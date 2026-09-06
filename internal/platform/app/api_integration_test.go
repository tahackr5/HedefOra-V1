//go:build integration

package app

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/tahackr5/HedefOra-V1/internal/generated/openapi"
	"github.com/tahackr5/HedefOra-V1/internal/platform/config"
	"github.com/tahackr5/HedefOra-V1/internal/platform/postgres"
	"github.com/tahackr5/HedefOra-V1/internal/platform/telemetry"
)

// The runner owns only this admitted disposable PG17 instance. It must execute
// packages serially (-p=1) because this suite stops and restarts that instance.

const pg17Admission = "admitted-disposable-pg17-v1"

type pg17Fixture struct {
	Schema         string `json:"schema"`
	RunID          string `json:"run_id"`
	SourceSHA      string `json:"source_sha"`
	ImageDigest    string `json:"image_digest"`
	SyntheticOnly  bool   `json:"synthetic_only"`
	Host           string `json:"host"`
	TLSPort        uint16 `json:"tls_port"`
	PlaintextPort  uint16 `json:"plaintext_port"`
	RootCAPEM      string `json:"root_ca_pem"`
	Password       string `json:"password"`
	ControlAddress string `json:"control_address"`
}

func requirePG17Fixture(t *testing.T) pg17Fixture {
	t.Helper()
	if os.Getenv("HEDEFORA_PG17_TEST_ADMISSION") != pg17Admission {
		t.Fatal("PG17_INTEGRATION_ADMISSION_REQUIRED")
	}
	path := os.Getenv("HEDEFORA_PG17_TEST_FIXTURE")
	info, err := os.Lstat(path)
	if err != nil || !filepath.IsAbs(path) || filepath.Base(path) != "pg17-integration.json" ||
		!info.Mode().IsRegular() || info.Size() < 1 || info.Size() > 96<<10 {
		t.Fatal("PG17_INTEGRATION_FIXTURE_REQUIRED")
	}
	data, err := os.ReadFile(path)
	if err != nil || len(data) > 96<<10 {
		t.Fatal("PG17_INTEGRATION_FIXTURE_UNREADABLE")
	}
	var f pg17Fixture
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&f) != nil || decoder.Decode(new(any)) != io.EOF {
		t.Fatal("PG17_INTEGRATION_FIXTURE_INVALID")
	}
	controlHost, controlPort, err := net.SplitHostPort(f.ControlAddress)
	port, parseErr := strconv.ParseUint(controlPort, 10, 16)
	if err != nil || parseErr != nil || port == 0 || controlHost != "127.0.0.1" ||
		f.Schema != "hedefora.pg17.integration.v1" || !f.SyntheticOnly || f.Host != "127.0.0.1" ||
		!regexp.MustCompile(`^[a-f0-9]{32}$`).MatchString(f.RunID) ||
		!regexp.MustCompile(`^[a-f0-9]{40}$`).MatchString(f.SourceSHA) ||
		!regexp.MustCompile(`^sha256:[a-f0-9]{64}$`).MatchString(f.ImageDigest) ||
		f.SourceSHA != os.Getenv("HEDEFORA_PG17_TEST_SOURCE_SHA") ||
		f.ImageDigest != os.Getenv("HEDEFORA_PG17_TEST_IMAGE_DIGEST") ||
		f.Password != "synthetic-pg17-"+f.RunID || f.TLSPort == 0 ||
		f.PlaintextPort == 0 || f.TLSPort == f.PlaintextPort ||
		config.ValidatePostgres(f.config()) != nil {
		t.Fatal("PG17_INTEGRATION_FIXTURE_BINDING_INVALID")
	}
	return f
}

func (f pg17Fixture) config() config.Postgres {
	c := config.DefaultPostgres()
	c.Host, c.Port, c.Database, c.User = f.Host, f.TLSPort, "hedefora_dev", "hedefora_app"
	c.Password, c.RootCAPEM = f.Password, f.RootCAPEM
	c.AcquireTimeout, c.ProbeTimeout = time.Second, 3*time.Second
	c.MaxConnections = 2
	return c
}

func pg17Control(t *testing.T, f pg17Fixture, action string) {
	t.Helper()
	if action != "start" && action != "stop" {
		t.Fatal("unsupported test engine control")
	}
	requestBody, _ := json.Marshal(map[string]string{"run_id": f.RunID, "image_digest": f.ImageDigest, "action": action})
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, "http://"+f.ControlAddress+"/v1/pg17", bytes.NewReader(requestBody))
	if err != nil {
		t.Fatal("test control request construction failed")
	}
	request.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 15 * time.Second, Transport: &http.Transport{Proxy: nil, DisableKeepAlives: true},
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	response, err := client.Do(request)
	if err != nil {
		t.Fatal("admitted test engine controller unavailable")
	}
	defer response.Body.Close()
	var result struct {
		RunID       string `json:"run_id"`
		ImageDigest string `json:"image_digest"`
		Action      string `json:"action"`
		State       string `json:"state"`
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, 4097))
	if err != nil || len(body) > 4096 || response.StatusCode != http.StatusOK {
		t.Fatal("test engine control failed")
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&result) != nil || decoder.Decode(new(any)) != io.EOF ||
		result.RunID != f.RunID || result.ImageDigest != f.ImageDigest || result.Action != action ||
		(action == "start" && result.State != "accepting-scram-tls") || (action == "stop" && result.State != "stopped") {
		t.Fatal("test engine controller returned invalid identity/state")
	}
}

type pg17LogBuffer struct {
	mu sync.Mutex
	bytes.Buffer
}

func (b *pg17LogBuffer) Write(data []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.Buffer.Write(data)
}
func (b *pg17LogBuffer) snapshot() string { b.mu.Lock(); defer b.mu.Unlock(); return b.Buffer.String() }

type pg17ObservedPool struct {
	*postgres.Pool
	hold      atomic.Bool
	succeeded chan struct{}
	canceled  chan struct{}
	closes    atomic.Int32
}

func (p *pg17ObservedPool) Check(ctx context.Context) error {
	err := p.Pool.Check(ctx)
	if err == nil && p.hold.CompareAndSwap(true, false) {
		// Hold an actual successful PG result across drain. This test-only
		// barrier models a late return; it never substitutes for DB success.
		p.succeeded <- struct{}{}
		<-ctx.Done()
		p.canceled <- struct{}{}
	}
	return err
}
func (p *pg17ObservedPool) Close(ctx context.Context) error {
	p.closes.Add(1)
	return p.Pool.Close(ctx)
}

func pg17Response(t *testing.T, client *http.Client, url string, status int, f pg17Fixture, retry int) {
	t.Helper()
	response := awaitStatus(t, client, url, status, 4*time.Second)
	defer response.Body.Close()
	pg17AssertResponse(t, response, status, f, retry)
}
func pg17AssertResponse(t *testing.T, response *http.Response, status int, f pg17Fixture, retry int) {
	t.Helper()
	requestID := assertNetworkResponseHeaders(t, response, status)
	payload, err := io.ReadAll(io.LimitReader(response.Body, 8193))
	if err != nil || len(payload) > 8192 {
		t.Fatal("health response exceeded its bounded contract")
	}
	pg17NoSensitive(t, string(payload), f)
	if status == http.StatusServiceUnavailable {
		var body openapi.ServiceUnavailableError
		decodeNetworkJSON(t, bytes.NewReader(payload), &body)
		if body.Code != openapi.ServiceUnavailableCodeValue || body.RequestID != requestID ||
			!body.Retryable || body.RetryAfterSeconds != retry ||
			body.Message != "Hizmet geçici olarak kullanılamıyor. Lütfen yeniden deneyin." ||
			response.Header.Get("Retry-After") != strconv.Itoa(retry) {
			t.Fatal("generic unavailable contract changed")
		}
	} else {
		want := `{"status":"live"}`
		if response.Request.URL.Path == "/health/ready" {
			want = `{"status":"ready"}`
		}
		if strings.TrimSpace(string(payload)) != want {
			t.Fatal("health success shape changed")
		}
	}
}
func pg17NoSensitive(t *testing.T, text string, f pg17Fixture) {
	t.Helper()
	for _, forbidden := range []string{f.Password, f.RootCAPEM, "hedefora_app", "hedefora_dev", "SQLSTATE", "FATAL", "postgres://", "synthetic-ambient-poison"} {
		if strings.Contains(text, forbidden) {
			t.Fatal("sensitive database detail appeared in health output")
		}
	}
}

func TestPG17APIStartupOutageRecoveryAndDrain(t *testing.T) {
	f := requirePG17Fixture(t)
	// The controller ACK is tied to actual stopped processes/listeners, not
	// merely to acceptance of a stop request. No admin credential enters Go.
	pg17Control(t, f, "stop")
	t.Cleanup(func() { pg17Control(t, f, "start") })
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal("API test listener failed")
	}
	defer listener.Close()
	api := config.DefaultAPI()
	api.ListenAddress = listener.Addr().String()
	api.DrainDelay = 2 * time.Second
	api.ShutdownTimeout = 3 * time.Second
	api.ReadinessTimeout = 1500 * time.Millisecond
	var logs pg17LogBuffer
	logger := telemetry.NewJSONLogger(&logs)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	poolReady := make(chan *pg17ObservedPool, 1)
	deps := apiDependencies{
		newPool: func(ctx context.Context, c config.Postgres) (databasePool, error) {
			real, err := postgres.New(ctx, c)
			if err != nil {
				return nil, err
			}
			p := &pg17ObservedPool{Pool: real, succeeded: make(chan struct{}, 1), canceled: make(chan struct{}, 1)}
			poolReady <- p
			return p, nil
		},
		listen:  func(string, string) (net.Listener, error) { return listener, nil },
		entropy: rand.Reader,
	}
	done := make(chan error, 1)
	go func() { done <- runAPI(ctx, api, f.config(), logger, deps) }()
	finished := false
	defer func() {
		cancel()
		if !finished {
			select {
			case <-done:
			case <-time.After(6 * time.Second):
				t.Error("API cleanup exceeded deadline")
			}
		}
	}()
	client := &http.Client{Timeout: 3 * time.Second, Transport: &http.Transport{Proxy: nil, DisableKeepAlives: true}}
	base := "http://" + listener.Addr().String()
	pg17Response(t, client, base+"/health/live", 200, f, api.RetryAfterSeconds)
	pg17Response(t, client, base+"/health/ready", 503, f, api.RetryAfterSeconds)
	var pool *pg17ObservedPool
	select {
	case pool = <-poolReady:
	case <-time.After(time.Second):
		t.Fatal("real API pool not created")
	}
	if pool.closes.Load() != 0 {
		t.Fatal("DB outage closed the serving pool")
	}
	pg17Control(t, f, "start")
	pg17Response(t, client, base+"/health/ready", 200, f, api.RetryAfterSeconds)
	pg17Control(t, f, "stop")
	pg17Response(t, client, base+"/health/live", 200, f, api.RetryAfterSeconds)
	pg17Response(t, client, base+"/health/ready", 503, f, api.RetryAfterSeconds)
	pg17Control(t, f, "start")
	pg17Response(t, client, base+"/health/ready", 200, f, api.RetryAfterSeconds)
	pool.hold.Store(true)
	type heldResponse struct {
		response *http.Response
		err      error
	}
	pending := make(chan heldResponse, 1)
	go func() { response, err := client.Get(base + "/health/ready"); pending <- heldResponse{response, err} }()
	select {
	case <-pool.succeeded:
	case <-time.After(3 * time.Second):
		t.Fatal("actual PG success did not reach drain barrier")
	}
	cancel()
	select {
	case <-pool.canceled:
	case <-time.After(time.Second):
		t.Fatal("drain did not cancel the probe context")
	}
	select {
	case item := <-pending:
		if item.err != nil {
			t.Fatal("draining request lost its generic HTTP response")
		}
		pg17AssertResponse(t, item.response, 503, f, api.RetryAfterSeconds)
		item.response.Body.Close()
	case <-time.After(time.Second):
		t.Fatal("late real success outlived drain")
	}
	pg17Response(t, client, base+"/health/live", 503, f, api.RetryAfterSeconds)
	pg17Response(t, client, base+"/health/ready", 503, f, api.RetryAfterSeconds)
	select {
	case err := <-done:
		finished = true
		if err != nil {
			t.Fatal("API graceful stop returned a failure")
		}
	case <-time.After(5 * time.Second):
		t.Fatal("API stop exceeded bounded shutdown")
	}
	if pool.closes.Load() != 1 || !errors.Is(pool.Pool.Check(context.Background()), postgres.ErrClosed) {
		t.Fatal("API did not complete exactly one real pool close")
	}
	pg17NoSensitive(t, logs.snapshot(), f)
	for _, event := range []string{"api_drain_started", "api_stopped"} {
		if !strings.Contains(logs.snapshot(), event) {
			t.Fatal("required API lifecycle event missing")
		}
	}
}
