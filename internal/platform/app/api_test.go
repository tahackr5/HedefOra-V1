package app

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/tahackr5/HedefOra-V1/internal/generated/openapi"
	"github.com/tahackr5/HedefOra-V1/internal/platform/config"
	"github.com/tahackr5/HedefOra-V1/internal/platform/telemetry"
)

func TestRunAPIOnListenerServesDrainsAndStops(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("net.Listen() error = %v", err)
	}
	value := config.DefaultAPI()
	value.ListenAddress = listener.Addr().String()
	value.DrainDelay = 300 * time.Millisecond
	value.ShutdownTimeout = 2 * time.Second
	var logs bytes.Buffer
	logger := telemetry.NewJSONLogger(&logs)
	runtime, err := buildAPIRuntime(value, logger, bytes.NewReader(bytes.Repeat([]byte{0x33}, 32)), &poolStub{})
	if err != nil {
		t.Fatalf("buildAPIRuntime() error = %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	result := make(chan error, 1)
	go func() {
		result <- runAPIOnListener(ctx, value, runtime, listener, logger)
	}()

	client := &http.Client{
		Timeout: time.Second,
		Transport: &http.Transport{
			DisableKeepAlives: true,
		},
	}
	url := "http://" + listener.Addr().String() + "/health/live"
	response := awaitStatus(t, client, url, http.StatusOK, time.Second)
	assertNetworkResponseHeaders(t, response, http.StatusOK)
	var liveBody openapi.HealthLiveResponse
	decodeNetworkJSON(t, response.Body, &liveBody)
	_ = response.Body.Close()
	if liveBody.Status != openapi.HealthLiveStatusLive {
		t.Fatalf("200 body = %#v", liveBody)
	}
	headRequest, err := http.NewRequest(http.MethodHead, url, nil)
	if err != nil {
		t.Fatalf("NewRequest(HEAD) error = %v", err)
	}
	headResponse, err := client.Do(headRequest)
	if err != nil {
		t.Fatalf("Do(HEAD) error = %v", err)
	}
	headBody, err := io.ReadAll(headResponse.Body)
	_ = headResponse.Body.Close()
	if err != nil {
		t.Fatalf("ReadAll(HEAD) error = %v", err)
	}
	if headResponse.StatusCode != http.StatusMethodNotAllowed ||
		headResponse.Header.Get("Allow") != http.MethodGet ||
		len(headBody) != 0 {
		t.Fatalf("HEAD response = status %d, Allow %q, body %q", headResponse.StatusCode, headResponse.Header.Get("Allow"), headBody)
	}
	cancel()
	awaitCondition(t, time.Second, runtime.health.IsDraining)
	response, err = client.Get(url)
	if err != nil {
		t.Fatalf("GET draining health error = %v", err)
	}
	requestID := assertNetworkResponseHeaders(t, response, http.StatusServiceUnavailable)
	if actual := response.Header.Get("Retry-After"); actual != strconv.Itoa(value.RetryAfterSeconds) {
		t.Fatalf("Retry-After = %q", actual)
	}
	var body openapi.ServiceUnavailableError
	decodeNetworkJSON(t, response.Body, &body)
	_ = response.Body.Close()
	if body.Code != openapi.ServiceUnavailableCodeValue ||
		body.Message == "" ||
		body.RequestID != requestID ||
		!body.Retryable ||
		body.RetryAfterSeconds != value.RetryAfterSeconds {
		t.Fatalf("503 body = %#v", body)
	}

	select {
	case err := <-result:
		if err != nil {
			t.Fatalf("runAPIOnListener() error = %v", err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("runAPIOnListener() did not stop")
	}
	for _, eventCode := range []string{"api_drain_started", "api_stopped"} {
		if !strings.Contains(logs.String(), `"event_code":"`+eventCode+`"`) {
			t.Fatalf("logs missing %s: %s", eventCode, logs.String())
		}
	}
}

func TestBuildAPIRuntimeAndRunAPIRejectStartupFailures(t *testing.T) {
	t.Parallel()

	value := config.DefaultAPI()
	logger := telemetry.NewJSONLogger(new(bytes.Buffer))
	if _, err := buildAPIRuntime(value, logger, bytes.NewReader(nil), &poolStub{}); !errors.Is(err, ErrAPIStartup) {
		t.Fatalf("buildAPIRuntime(no entropy) error = %v", err)
	}
	invalid := value
	invalid.RetryAfterSeconds = 0
	if _, err := buildAPIRuntime(invalid, logger, bytes.NewReader(bytes.Repeat([]byte{1}, 32)), &poolStub{}); !errors.Is(err, ErrAPIStartup) {
		t.Fatalf("buildAPIRuntime(invalid retry) error = %v", err)
	}
	cancelled, cancel := context.WithCancel(context.Background())
	cancel()
	if err := runAPI(cancelled, value, config.Postgres{}, logger, testDependencies(&poolStub{})); err != nil {
		t.Fatalf("RunAPI(cancelled) error = %v", err)
	}
	if err := RunAPI(nil, value, config.Postgres{}, logger); !errors.Is(err, ErrAPIStartup) {
		t.Fatalf("RunAPI(nil) error = %v", err)
	}
}

func TestRunAPIReturnsListenFailureForOccupiedAddress(t *testing.T) {
	t.Parallel()

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("net.Listen() error = %v", err)
	}
	t.Cleanup(func() { _ = listener.Close() })
	value := config.DefaultAPI()
	value.ListenAddress = listener.Addr().String()
	if err := runAPI(context.Background(), value, config.Postgres{}, telemetry.NewJSONLogger(io.Discard), testDependencies(&poolStub{})); !errors.Is(err, ErrAPIListen) {
		t.Fatalf("RunAPI(occupied address) error = %v", err)
	}
}

func TestRunAPIOnListenerReturnsServeFailure(t *testing.T) {
	t.Parallel()

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("net.Listen() error = %v", err)
	}
	if err := listener.Close(); err != nil {
		t.Fatalf("listener.Close() error = %v", err)
	}
	value := config.DefaultAPI()
	value.ListenAddress = listener.Addr().String()
	logger := telemetry.NewJSONLogger(io.Discard)
	runtime, err := buildAPIRuntime(value, logger, bytes.NewReader(bytes.Repeat([]byte{0x44}, 32)), &poolStub{})
	if err != nil {
		t.Fatalf("buildAPIRuntime() error = %v", err)
	}
	if err := runAPIOnListener(context.Background(), value, runtime, listener, logger); !errors.Is(err, ErrAPIServe) {
		t.Fatalf("runAPIOnListener(closed listener) error = %v", err)
	}
}

func TestRunAPIOnListenerForcesCloseAfterShutdownTimeout(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("net.Listen() error = %v", err)
	}
	t.Cleanup(func() { _ = listener.Close() })
	value := config.DefaultAPI()
	value.ListenAddress = listener.Addr().String()
	value.DrainDelay = 100 * time.Millisecond
	value.ShutdownTimeout = time.Second
	logger := telemetry.NewJSONLogger(io.Discard)
	runtime, err := buildAPIRuntime(value, logger, bytes.NewReader(bytes.Repeat([]byte{0x55}, 32)), &poolStub{})
	if err != nil {
		t.Fatalf("buildAPIRuntime() error = %v", err)
	}
	handlerStarted := make(chan struct{})
	releaseHandler := make(chan struct{})
	runtime.server.Handler = http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		close(handlerStarted)
		<-releaseHandler
	})
	ctx, cancel := context.WithCancel(context.Background())
	result := make(chan error, 1)
	go func() {
		result <- runAPIOnListener(ctx, value, runtime, listener, logger)
	}()
	clientResult := make(chan error, 1)
	go func() {
		response, requestErr := http.Get("http://" + listener.Addr().String() + "/blocked")
		if response != nil {
			_ = response.Body.Close()
		}
		clientResult <- requestErr
	}()
	select {
	case <-handlerStarted:
	case <-time.After(3 * time.Second):
		close(releaseHandler)
		cancel()
		t.Fatal("blocking handler did not start")
	}
	cancel()
	select {
	case err := <-result:
		if !errors.Is(err, ErrAPIShutdown) {
			close(releaseHandler)
			t.Fatalf("runAPIOnListener(shutdown timeout) error = %v", err)
		}
	case <-time.After(3 * time.Second):
		close(releaseHandler)
		t.Fatal("runAPIOnListener() did not return after forced close")
	}
	close(releaseHandler)
	select {
	case <-clientResult:
	case <-time.After(time.Second):
		t.Fatal("forced close did not release the client")
	}
}

func TestRunAPIOnListenerWaitsForInflightRequestDuringGracefulShutdown(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("net.Listen() error = %v", err)
	}
	t.Cleanup(func() { _ = listener.Close() })
	value := config.DefaultAPI()
	value.ListenAddress = listener.Addr().String()
	value.DrainDelay = 100 * time.Millisecond
	value.ShutdownTimeout = time.Second
	logger := telemetry.NewJSONLogger(io.Discard)
	runtime, err := buildAPIRuntime(value, logger, bytes.NewReader(bytes.Repeat([]byte{0x66}, 32)), &poolStub{})
	if err != nil {
		t.Fatalf("buildAPIRuntime() error = %v", err)
	}
	handlerStarted := make(chan struct{})
	releaseHandler := make(chan struct{})
	shutdownStarted := make(chan struct{})
	runtime.server.RegisterOnShutdown(func() { close(shutdownStarted) })
	runtime.server.Handler = http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		close(handlerStarted)
		<-releaseHandler
		writer.WriteHeader(http.StatusNoContent)
	})
	ctx, cancel := context.WithCancel(context.Background())
	result := make(chan error, 1)
	go func() {
		result <- runAPIOnListener(ctx, value, runtime, listener, logger)
	}()
	clientResult := make(chan int, 1)
	go func() {
		response, requestErr := (&http.Client{Timeout: 3 * time.Second}).Get("http://" + listener.Addr().String() + "/blocked")
		if requestErr != nil {
			clientResult <- 0
			return
		}
		_ = response.Body.Close()
		clientResult <- response.StatusCode
	}()
	select {
	case <-handlerStarted:
	case <-time.After(time.Second):
		close(releaseHandler)
		cancel()
		t.Fatal("in-flight handler did not start")
	}
	cancel()
	select {
	case <-shutdownStarted:
	case <-time.After(time.Second):
		close(releaseHandler)
		t.Fatal("graceful shutdown did not start")
	}
	close(releaseHandler)
	select {
	case status := <-clientResult:
		if status != http.StatusNoContent {
			t.Fatalf("in-flight response status = %d", status)
		}
	case <-time.After(time.Second):
		t.Fatal("in-flight request did not complete")
	}
	select {
	case err := <-result:
		if err != nil {
			t.Fatalf("runAPIOnListener(graceful) error = %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("runAPIOnListener(graceful) did not stop")
	}
}

func TestWaitDrainDelayObservesServeResult(t *testing.T) {
	t.Parallel()

	for _, test := range []struct {
		name    string
		serve   error
		wantErr error
	}{
		{name: "closed", serve: http.ErrServerClosed},
		{name: "failed", serve: errors.New("fixture-serve-failure"), wantErr: ErrAPIServe},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			serveResult := make(chan error, 1)
			serveResult <- test.serve
			stopped, err := waitDrainDelay(time.Hour, serveResult)
			if !stopped || !errors.Is(err, test.wantErr) {
				t.Fatalf("waitDrainDelay() = stopped %v, error %v", stopped, err)
			}
		})
	}
}

func awaitStatus(t *testing.T, client *http.Client, url string, status int, timeout time.Duration) *http.Response {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for {
		if time.Now().After(deadline) {
			t.Fatalf("GET %s did not return %d", url, status)
		}
		response, err := client.Get(url)
		if err == nil {
			if response.StatusCode == status {
				return response
			}
			_ = response.Body.Close()
		}
		time.Sleep(5 * time.Millisecond)
	}
}

func awaitCondition(t *testing.T, timeout time.Duration, condition func() bool) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for !condition() {
		if time.Now().After(deadline) {
			t.Fatal("condition was not satisfied before deadline")
		}
		time.Sleep(time.Millisecond)
	}
}

func assertNetworkResponseHeaders(t *testing.T, response *http.Response, status int) openapi.RequestID {
	t.Helper()
	if response.StatusCode != status {
		t.Fatalf("status = %d, want %d", response.StatusCode, status)
	}
	for name, expected := range map[string]string{
		"Cache-Control":          "no-store",
		"Content-Type":           "application/json",
		"Vary":                   "Accept",
		"X-Content-Type-Options": "nosniff",
	} {
		if actual := response.Header.Get(name); actual != expected {
			t.Fatalf("%s = %q, want %q", name, actual, expected)
		}
	}
	requestID := openapi.RequestID(response.Header.Get("X-Request-ID"))
	if len(requestID) != 36 {
		t.Fatalf("X-Request-ID = %q", requestID)
	}
	return requestID
}

func decodeNetworkJSON(t *testing.T, reader io.Reader, destination any) {
	t.Helper()
	decoder := json.NewDecoder(reader)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		t.Fatalf("Decode() error = %v", err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		t.Fatalf("Decode() trailing value error = %v", err)
	}
}

type poolStub struct {
	check      func(context.Context) error
	close      func(context.Context) error
	closeCalls atomic.Int32
}

func (pool *poolStub) Check(ctx context.Context) error {
	if pool.check != nil {
		return pool.check(ctx)
	}
	return nil
}
func (pool *poolStub) Close(ctx context.Context) error {
	pool.closeCalls.Add(1)
	if pool.close != nil {
		return pool.close(ctx)
	}
	return nil
}
func testDependencies(pool *poolStub) apiDependencies {
	return apiDependencies{
		newPool: func(context.Context, config.Postgres) (databasePool, error) { return pool, nil },
		listen:  net.Listen,
		entropy: bytes.NewReader(bytes.Repeat([]byte{0x77}, 32)),
	}
}

func TestRunAPICleansPoolOnBuildListenAndServeFailure(t *testing.T) {
	t.Parallel()
	const poison = "fixture-pool-provider-secret"
	for _, phase := range []string{"build", "listen", "serve"} {
		t.Run(phase, func(t *testing.T) {
			t.Parallel()
			pool := &poolStub{}
			dependencies := testDependencies(pool)
			expected := ErrAPIStartup
			switch phase {
			case "build":
				dependencies.entropy = bytes.NewReader(nil)
				dependencies.listen = func(string, string) (net.Listener, error) {
					t.Error("listener called after build failure")
					return nil, errors.New(poison)
				}
			case "listen":
				expected = ErrAPIListen
				dependencies.listen = func(string, string) (net.Listener, error) { return nil, errors.New(poison) }
			case "serve":
				expected = ErrAPIServe
				dependencies.listen = func(string, string) (net.Listener, error) {
					listener, err := net.Listen("tcp", "127.0.0.1:0")
					if err != nil {
						return nil, err
					}
					if err = listener.Close(); err != nil {
						return nil, err
					}
					return listener, nil
				}
			}
			pool.close = func(ctx context.Context) error {
				deadline, ok := ctx.Deadline()
				if !ok || ctx.Err() != nil || time.Until(deadline) > config.DefaultAPI().ShutdownTimeout {
					t.Error("pool close has no fresh bounded context")
				}
				return nil
			}
			err := runAPI(context.Background(), config.DefaultAPI(), config.Postgres{}, telemetry.NewJSONLogger(io.Discard), dependencies)
			if !errors.Is(err, expected) || pool.closeCalls.Load() != 1 {
				t.Fatalf("runAPI(%s) error=%v, close calls=%d", phase, err, pool.closeCalls.Load())
			}
			if strings.Contains(err.Error(), poison) {
				t.Fatal("provider error leaked")
			}
		})
	}
}

func TestRunAPIPoolConstructionFailureDoesNotOpenListener(t *testing.T) {
	t.Parallel()
	const poison = "fixture-constructor-secret"
	dependencies := testDependencies(&poolStub{})
	dependencies.newPool = func(context.Context, config.Postgres) (databasePool, error) { return nil, errors.New(poison) }
	dependencies.listen = func(string, string) (net.Listener, error) {
		t.Error("listener opened after constructor failure")
		return nil, errors.New(poison)
	}
	err := runAPI(context.Background(), config.DefaultAPI(), config.Postgres{}, telemetry.NewJSONLogger(io.Discard), dependencies)
	if !errors.Is(err, ErrAPIStartup) || strings.Contains(err.Error(), poison) {
		t.Fatalf("runAPI error=%v", err)
	}
	for _, pool := range []databasePool{nil, (*poolStub)(nil)} {
		dependencies.newPool = func(context.Context, config.Postgres) (databasePool, error) { return pool, nil }
		// poolStub.Close dereferences its receiver: reaching cleanup for the
		// typed-nil case would panic, and must fail this regression test.
		if err := runAPI(context.Background(), config.DefaultAPI(), config.Postgres{}, telemetry.NewJSONLogger(io.Discard), dependencies); !errors.Is(err, ErrAPIStartup) {
			t.Fatalf("nil pool error=%v", err)
		}
	}
}

func TestRunAPICloseBudgetIsBoundedAndErrorsStayGeneric(t *testing.T) {
	t.Parallel()
	value := config.DefaultAPI()
	value.ShutdownTimeout = time.Second
	pool := &poolStub{close: func(ctx context.Context) error { <-ctx.Done(); return errors.New("fixture-close-secret") }}
	dependencies := testDependencies(pool)
	dependencies.listen = func(string, string) (net.Listener, error) { return nil, errors.New("fixture-listen-secret") }
	started := time.Now()
	err := runAPI(context.Background(), value, config.Postgres{}, telemetry.NewJSONLogger(io.Discard), dependencies)
	if !errors.Is(err, ErrAPIListen) || !errors.Is(err, ErrAPIShutdown) || strings.Contains(err.Error(), "fixture-") {
		t.Fatalf("runAPI error=%v", err)
	}
	if elapsed := time.Since(started); elapsed < time.Second || elapsed > 3*time.Second {
		t.Fatalf("bounded pool close elapsed=%v", elapsed)
	}
	if pool.closeCalls.Load() != 1 {
		t.Fatalf("close calls=%d", pool.closeCalls.Load())
	}
}

func TestRunAPIWithUnavailableDatabaseServesLiveAndClosesAfterDrain(t *testing.T) {
	t.Parallel()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = listener.Close() })
	value := config.DefaultAPI()
	value.ListenAddress = listener.Addr().String()
	value.DrainDelay = 300 * time.Millisecond
	pool := &poolStub{check: func(context.Context) error { return errors.New("fixture-offline-database-secret") }}
	dependencies := testDependencies(pool)
	dependencies.listen = func(string, string) (net.Listener, error) { return listener, nil }
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	result := make(chan error, 1)
	go func() {
		result <- runAPI(ctx, value, config.Postgres{}, telemetry.NewJSONLogger(io.Discard), dependencies)
	}()
	client := &http.Client{Timeout: time.Second}
	base := "http://" + listener.Addr().String()
	for _, endpoint := range []struct {
		path   string
		status int
	}{{"/health/live", 200}, {"/health/ready", 503}} {
		response := awaitStatus(t, client, base+endpoint.path, endpoint.status, time.Second)
		assertNetworkResponseHeaders(t, response, endpoint.status)
		payload, readErr := io.ReadAll(response.Body)
		_ = response.Body.Close()
		if readErr != nil || strings.Contains(string(payload), "fixture-") {
			t.Fatal("database probe leaked or response unreadable")
		}
	}
	if pool.closeCalls.Load() != 0 {
		t.Fatal("pool closed while listener was active")
	}
	cancel()
	for _, path := range []string{"/health/live", "/health/ready"} {
		response := awaitStatus(t, client, base+path, http.StatusServiceUnavailable, time.Second)
		assertNetworkResponseHeaders(t, response, http.StatusServiceUnavailable)
		_ = response.Body.Close()
	}
	select {
	case err := <-result:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("runtime did not stop")
	}
	if pool.closeCalls.Load() != 1 {
		t.Fatalf("close calls=%d", pool.closeCalls.Load())
	}
}

func TestBuildAPIRuntimeRejectsNilReadinessAndLogger(t *testing.T) {
	t.Parallel()
	logger := telemetry.NewJSONLogger(io.Discard)
	for _, build := range []func() (*apiRuntime, error){
		func() (*apiRuntime, error) {
			return buildAPIRuntime(config.DefaultAPI(), logger, bytes.NewReader(bytes.Repeat([]byte{1}, 32)), nil)
		},
		func() (*apiRuntime, error) {
			return buildAPIRuntime(config.DefaultAPI(), nil, bytes.NewReader(bytes.Repeat([]byte{1}, 32)), &poolStub{})
		},
	} {
		if _, err := build(); !errors.Is(err, ErrAPIStartup) {
			t.Fatalf("build error=%v", err)
		}
	}
}
