//go:build integration

package postgres

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/tahackr5/HedefOra-V1/internal/platform/config"
)

// These tests require a real, separately admitted disposable PG17 engine.
// The integration tag alone is not admission. Missing fixture/admission fails.

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
	ControlToken   string `json:"control_token"`
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
		f.Schema != "hedefora.pg17.integration.v2" || !f.SyntheticOnly || f.Host != "127.0.0.1" ||
		!regexp.MustCompile(`^[a-f0-9]{32}$`).MatchString(f.RunID) ||
		!regexp.MustCompile(`^[a-f0-9]{40}$`).MatchString(f.SourceSHA) ||
		!regexp.MustCompile(`^sha256:[a-f0-9]{64}$`).MatchString(f.ImageDigest) ||
		f.SourceSHA != os.Getenv("HEDEFORA_PG17_TEST_SOURCE_SHA") ||
		f.ImageDigest != os.Getenv("HEDEFORA_PG17_TEST_IMAGE_DIGEST") ||
		!regexp.MustCompile(`^synthetic-pg17-[a-f0-9]{64}$`).MatchString(f.Password) ||
		!regexp.MustCompile(`^[a-f0-9]{64}$`).MatchString(f.ControlToken) || f.TLSPort == 0 ||
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

func pg17Context(t *testing.T, duration time.Duration) context.Context {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), duration)
	t.Cleanup(cancel)
	return ctx
}

func pg17New(t *testing.T, c config.Postgres) *Pool {
	t.Helper()
	p, err := New(pg17Context(t, 3*time.Second), c)
	if err != nil {
		t.Fatal("real pool construction failed")
	}
	t.Cleanup(func() {
		if p.Close(pg17Context(t, 6*time.Second)) != nil {
			t.Error("real pool cleanup failed")
		}
	})
	return p
}

func pg17Raw(t *testing.T, p *Pool) *pgxpool.Pool {
	t.Helper()
	b, ok := p.backend.(*pgxBackend)
	if !ok {
		t.Fatal("expected real pgxpool backend")
	}
	return b.pool
}

func pg17CleanError(t *testing.T, f pg17Fixture, err error) {
	t.Helper()
	if err == nil {
		t.Fatal("negative real-engine operation unexpectedly succeeded")
	}
	for _, forbidden := range []string{f.Password, f.ControlToken, f.RootCAPEM, f.Host, "hedefora_app", "SQLSTATE", "FATAL", "postgres://", "synthetic-"} {
		if strings.Contains(err.Error(), forbidden) {
			t.Fatal("provider detail escaped pool boundary")
		}
	}
}

func TestPG17TLSAndSCRAM(t *testing.T) {
	f := requirePG17Fixture(t)
	p := pg17New(t, f.config())
	if p.Check(pg17Context(t, 3*time.Second)) != nil {
		t.Fatal("real TLS app probe failed")
	}
	conn, err := pg17Raw(t, p).Acquire(pg17Context(t, 3*time.Second))
	if err != nil {
		t.Fatal("real metadata connection acquisition failed")
	}
	defer conn.Release()
	var ssl bool
	var version, role, database string
	var serverVersion int
	err = conn.QueryRow(pg17Context(t, 3*time.Second),
		"SELECT s.ssl, s.version, current_user, current_database(), current_setting('server_version_num')::int FROM pg_stat_ssl s WHERE s.pid = pg_backend_pid()").
		Scan(&ssl, &version, &role, &database, &serverVersion)
	if err != nil || !ssl || (version != "TLSv1.2" && version != "TLSv1.3") ||
		role != "hedefora_app" || database != "hedefora_dev" || serverVersion/10000 != 17 {
		t.Fatal("real PG17 session identity or TLS metadata did not match")
	}
	socket, ok := conn.Conn().PgConn().Conn().(*tls.Conn)
	if !ok || socket.ConnectionState().Version < tls.VersionTLS12 ||
		len(socket.ConnectionState().VerifiedChains) == 0 {
		t.Fatal("client session did not authenticate a TLS1.2+ certificate chain")
	}
	// A stricter test-only auth requirement proves an actual SCRAM exchange.
	// Production New above remains unchanged; no authentication stub is used.
	c := f.config()
	probe := newPool(nil, c)
	pc, err := providerConfig(c, os.Environ(), probe.lifetime)
	if err != nil {
		probe.cancel()
		t.Fatal("SCRAM config construction failed")
	}
	pc.ConnConfig.RequireAuth = "scram-sha-256"
	raw, err := pgxpool.NewWithConfig(pg17Context(t, 3*time.Second), pc)
	if err != nil {
		probe.cancel()
		t.Fatal("SCRAM pool construction failed")
	}
	probe.backend = &pgxBackend{pool: raw}
	defer func() {
		if probe.Close(pg17Context(t, 6*time.Second)) != nil {
			t.Error("SCRAM pool cleanup failed")
		}
	}()
	if probe.Check(pg17Context(t, 3*time.Second)) != nil {
		t.Fatal("real SCRAM authentication failed")
	}
}

func pg17AuthenticatedWitness(t *testing.T, f pg17Fixture) {
	t.Helper()
	p := pg17New(t, f.config())
	conn, err := pg17Raw(t, p).Acquire(pg17Context(t, 3*time.Second))
	if err != nil {
		t.Fatal("positive PG17 witness could not acquire a connection")
	}
	var authenticated bool
	err = conn.QueryRow(pg17Context(t, 2*time.Second), `SELECT
		current_setting('server_version_num')::int / 10000 = 17
		AND system_user = 'scram-sha-256:hedefora_app'
		AND current_database() = 'hedefora_dev'
		AND (SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid())`).Scan(&authenticated)
	socket, tlsSocket := conn.Conn().PgConn().Conn().(*tls.Conn)
	verified := tlsSocket && socket.ConnectionState().Version >= tls.VersionTLS12 && len(socket.ConnectionState().VerifiedChains) > 0
	conn.Release()
	if err != nil || !authenticated || !verified {
		t.Fatal("positive PG17 witness did not prove verified TLS and SCRAM")
	}
	if p.Close(pg17Context(t, 6*time.Second)) != nil {
		t.Fatal("positive PG17 witness cleanup failed")
	}
}

func TestPG17TLSAndAuthenticationFailuresDoNotFallback(t *testing.T) {
	f := requirePG17Fixture(t)
	for _, name := range []string{"wrong-ca", "wrong-hostname", "wrong-password", "no-tls"} {
		t.Run(name, func(t *testing.T) {
			pg17AuthenticatedWitness(t, f)
			c := f.config()
			switch name {
			case "wrong-ca":
				c.RootCAPEM, _ = testCertificates(t, false)
			case "wrong-password":
				c.Password = "synthetic-wrong-password-" + f.RunID
			case "no-tls":
				c.Port = f.PlaintextPort
			case "wrong-hostname":
				c.Host = "mismatch.hedefora.invalid"
			}
			var p *Pool
			var observedMu sync.Mutex
			var observed []*pg17RefusalWire
			if name == "wrong-hostname" || name == "no-tls" {
				p = newPool(nil, c)
				pc, err := providerConfig(c, os.Environ(), p.lifetime)
				if err != nil {
					p.cancel()
					t.Fatal("hostname probe config failed")
				}
				if name == "wrong-hostname" {
					// Route to the same real engine without changing certificate SNI.
					pc.ConnConfig.LookupFunc = func(context.Context, string) ([]string, error) { return []string{f.Host}, nil }
				} else {
					dial := pc.ConnConfig.DialFunc
					pc.ConnConfig.DialFunc = func(ctx context.Context, network, address string) (net.Conn, error) {
						conn, err := dial(ctx, network, address)
						if err != nil {
							return nil, err
						}
						wire := &pg17RefusalWire{Conn: conn}
						observedMu.Lock()
						observed = append(observed, wire)
						observedMu.Unlock()
						return wire, nil
					}
				}
				raw, err := pgxpool.NewWithConfig(pg17Context(t, 3*time.Second), pc)
				if err != nil {
					p.cancel()
					t.Fatal("hostname probe pool failed")
				}
				p.backend = &pgxBackend{pool: raw}
				t.Cleanup(func() {
					if p.Close(pg17Context(t, 6*time.Second)) != nil {
						t.Error("negative pool cleanup failed")
					}
				})
			} else {
				p = pg17New(t, c)
			}
			err := p.Check(pg17Context(t, 4*time.Second))
			if !errors.Is(err, ErrUnavailable) {
				t.Fatal("real negative endpoint did not return generic unavailable")
			}
			pg17CleanError(t, f, err)
			// Inspect the provider only at the private test boundary. Production
			// keeps its generic sentinel; no raw error text is printed or stored.
			conn, providerErr := pg17Raw(t, p).Acquire(pg17Context(t, 4*time.Second))
			if conn != nil {
				conn.Release()
				t.Fatal("negative provider unexpectedly authenticated")
			}
			if providerErr == nil {
				t.Fatal("negative provider supplied no failure evidence")
			}
			switch name {
			case "wrong-ca":
				var cause x509.UnknownAuthorityError
				if !errors.As(providerErr, &cause) {
					t.Fatal("negative CA did not fail certificate authority verification")
				}
			case "wrong-hostname":
				var cause x509.HostnameError
				if !errors.As(providerErr, &cause) {
					t.Fatal("negative hostname did not fail certificate name verification")
				}
			case "wrong-password":
				var cause *pgconn.PgError
				if !errors.As(providerErr, &cause) || cause.Code != "28P01" {
					t.Fatal("negative password did not receive PostgreSQL authentication rejection")
				}
			}
			if p.Close(pg17Context(t, 6*time.Second)) != nil {
				t.Fatal("negative provider did not complete cleanup")
			}
			if name == "no-tls" {
				observedMu.Lock()
				wires := append([]*pg17RefusalWire(nil), observed...)
				observedMu.Unlock()
				if len(wires) < 2 {
					t.Fatal("both generic and provider TLS refusals were not observed")
				}
				for _, wire := range wires {
					if !wire.refusedWithoutStartup() {
						t.Fatal("real engine refusal was missing or plaintext fallback bytes were written")
					}
				}
			}
			if pg17Raw(t, p).Stat().AcquiredConns() != 0 {
				t.Fatal("failed handshake retained an acquired connection")
			}
			pg17AuthenticatedWitness(t, f)
		})
	}
	// The admitted ssl=off engine must actually answer PostgreSQL SSLRequest.
	// Keep hostnossl authentication rejected even in the negative fixture. The
	// runner separately verifies its PG17/ssl=off settings over a SCRAM socket.
	address := net.JoinHostPort(f.Host, strconv.Itoa(int(f.PlaintextPort)))
	conn, err := (&net.Dialer{Timeout: time.Second}).DialContext(pg17Context(t, 2*time.Second), "tcp", address)
	if err != nil {
		t.Fatal("expected real no-TLS PostgreSQL endpoint is unavailable")
	}
	defer conn.Close()
	if conn.SetDeadline(time.Now().Add(time.Second)) != nil {
		t.Fatal("no-TLS protocol witness deadline failed")
	}
	request := []byte{0, 0, 0, 8, 4, 210, 22, 47}
	if n, err := conn.Write(request); err != nil || n != len(request) {
		t.Fatal("no-TLS protocol witness request failed")
	}
	var reply [1]byte
	if _, err := io.ReadFull(conn, reply[:]); err != nil || reply[0] != 'N' {
		t.Fatal("negative engine did not explicitly reject PostgreSQL TLS negotiation")
	}
}

func TestPG17AmbientDiscoveryCannotChangeTheEndpoint(t *testing.T) {
	f := requirePG17Fixture(t)
	dir := t.TempDir()
	// Only synthetic files are created; never inspect an existing home/passfile.
	passfile := filepath.Join(dir, ".pgpass")
	servicefile := filepath.Join(dir, ".pg_service.conf")
	if os.WriteFile(passfile, []byte("*:*:*:*:synthetic-ambient-poison\n"), 0600) != nil ||
		os.WriteFile(servicefile, []byte("[poison]\nhost=127.0.0.1\nsslmode=disable\npassword=synthetic-ambient-poison\n"), 0600) != nil {
		t.Fatal("synthetic discovery canary creation failed")
	}
	t.Setenv("HOME", dir)
	t.Setenv("USERPROFILE", dir)
	t.Setenv("APPDATA", dir)
	for _, item := range []struct{ name, value string }{
		{"PGHOST", ""}, {"PGPASSWORD", "synthetic-ambient-poison"},
		{"PGPASSFILE", passfile}, {"PGSERVICE", "poison"}, {"PGSERVICEFILE", servicefile},
		{"PGSSLMODE", "disable"},
	} {
		t.Run(item.name, func(t *testing.T) {
			t.Setenv(item.name, item.value)
			p, err := New(pg17Context(t, time.Second), f.config())
			if p != nil || !errors.Is(err, config.ErrInvalidPostgresEnvironment) {
				t.Fatal("ambient PG setting was accepted")
			}
		})
	}
	p := pg17New(t, f.config())
	if p.Check(pg17Context(t, 3*time.Second)) != nil {
		t.Fatal("synthetic default discovery files influenced the explicit connection")
	}
	for _, verb := range []string{"%v", "%+v", "%#v", "%s"} {
		out := fmt.Sprintf(verb, f.config())
		if strings.Contains(out, f.Password) || strings.Contains(out, f.RootCAPEM) || strings.Contains(out, f.Host) {
			t.Fatal("whole config formatting leaked fixture details")
		}
	}
}

func TestPG17PoolCapacityDeadlineReuseAndClose(t *testing.T) {
	f := requirePG17Fixture(t)
	c := f.config()
	c.AcquireTimeout = 200 * time.Millisecond
	p := pg17New(t, c)
	raw := pg17Raw(t, p)
	a, err := raw.Acquire(pg17Context(t, 3*time.Second))
	if err != nil {
		t.Fatal("first real acquisition failed")
	}
	b, err := raw.Acquire(pg17Context(t, 3*time.Second))
	if err != nil {
		a.Release()
		t.Fatal("second real acquisition failed")
	}
	aHeld, bHeld := true, true
	defer func() {
		if aHeld {
			a.Release()
		}
		if bHeld {
			b.Release()
		}
	}()
	pids := map[uint32]bool{a.Conn().PgConn().PID(): true, b.Conn().PgConn().PID(): true}
	if len(pids) != 2 || raw.Stat().TotalConns() != 2 {
		t.Fatal("real capacity setup did not open two sessions")
	}
	before := raw.Stat().CanceledAcquireCount()
	start := time.Now()
	err = p.Check(pg17Context(t, time.Second))
	if !errors.Is(err, context.DeadlineExceeded) || time.Since(start) > time.Second ||
		raw.Stat().CanceledAcquireCount() <= before || raw.Stat().TotalConns() > 2 {
		t.Fatal("saturated real pool did not enforce bounded admission")
	}
	a.Release()
	aHeld = false
	b.Release()
	bHeld = false
	for i := 0; i < 8; i++ {
		if p.Check(pg17Context(t, 3*time.Second)) != nil {
			t.Fatal("pool was not reusable after acquisition timeout")
		}
		conn, err := raw.Acquire(pg17Context(t, 3*time.Second))
		if err != nil {
			t.Fatal("reuse witness failed")
		}
		known := pids[conn.Conn().PgConn().PID()]
		conn.Release()
		if !known {
			t.Fatal("successful probes failed to reuse existing real sessions")
		}
	}
	var wg sync.WaitGroup
	failures := make(chan struct{}, 16)
	for i := 0; i < 16; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 8; j++ {
				ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
				err := p.Check(ctx)
				cancel()
				if err != nil || raw.Stat().TotalConns() > c.MaxConnections {
					failures <- struct{}{}
					return
				}
			}
		}()
	}
	wg.Wait()
	if len(failures) > 0 {
		t.Fatal("intended concurrent ownership/capacity failed")
	}
	held, err := raw.Acquire(pg17Context(t, 3*time.Second))
	if err != nil {
		t.Fatal("close witness acquisition failed")
	}
	closeCtx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	err = p.Close(closeCtx)
	cancel()
	if !errors.Is(err, context.DeadlineExceeded) {
		held.Release()
		t.Fatal("Close claimed completion while a provider lease remained held")
	}
	if !errors.Is(p.Check(context.Background()), ErrClosed) {
		held.Release()
		t.Fatal("closed pool admitted a new probe")
	}
	held.Release()
	if p.Close(pg17Context(t, 6*time.Second)) != nil {
		t.Fatal("provider completion was not observable after release")
	}
	select {
	case <-p.closeDone:
	default:
		t.Fatal("close success preceded actual provider completion")
	}
}

type pg17SleepingBackend struct {
	*pgxBackend
	started chan uint32
}
type pg17SleepingConnection struct {
	*pgxpool.Conn
	started chan uint32
}

func (b *pg17SleepingBackend) Acquire(ctx context.Context) (connection, error) {
	conn, err := b.pool.Acquire(ctx)
	if err != nil {
		return nil, err
	}
	return &pg17SleepingConnection{Conn: conn, started: b.started}, nil
}
func (c *pg17SleepingConnection) Ping(ctx context.Context) error {
	c.started <- c.Conn.Conn().PgConn().PID()
	_, err := c.Exec(ctx, "SELECT pg_sleep(30)")
	return err
}

func TestPG17InflightQueryCancellationAndClose(t *testing.T) {
	f := requirePG17Fixture(t)
	for _, action := range []string{"caller-cancel", "pool-close"} {
		t.Run(action, func(t *testing.T) {
			c := f.config()
			c.ProbeTimeout = 5 * time.Second
			p := pg17New(t, c)
			raw := pg17Raw(t, p)
			started := make(chan uint32, 1)
			p.backend = &pg17SleepingBackend{pgxBackend: &pgxBackend{pool: raw}, started: started}
			monitor := pg17New(t, f.config())
			monitorConn, err := pg17Raw(t, monitor).Acquire(pg17Context(t, 3*time.Second))
			if err != nil {
				t.Fatal("same-role activity witness failed")
			}
			defer monitorConn.Release()
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			result := make(chan error, 1)
			go func() { result <- p.Check(ctx) }()
			var pid uint32
			select {
			case pid = <-started:
			case <-time.After(3 * time.Second):
				t.Fatal("real long query did not acquire")
			}
			// The public boundary only promises bounded caller/provider ownership.
			// PG17 may keep running SQL after a socket deadline. Clean up only the
			// exact same-role test sleep; this is not server-cancel PASS evidence.
			defer func() {
				ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
				defer cancel()
				err := pg17CancelAndObserve(ctx, func(ctx context.Context) (bool, error) {
					var acknowledged bool
					// Zero matching active queries is already clean at this observation;
					// a matching backend returning false is never converted to success.
					err := monitorConn.QueryRow(ctx,
						"SELECT COALESCE(bool_and(pg_cancel_backend(pid)), true) FROM pg_stat_activity WHERE pid=$1 AND usename=current_user AND state='active' AND query='SELECT pg_sleep(30)'", pid).Scan(&acknowledged)
					return acknowledged, err
				}, func(ctx context.Context) (bool, error) {
					var active bool
					err := monitorConn.QueryRow(ctx,
						"SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND usename=current_user AND state='active' AND query='SELECT pg_sleep(30)')", pid).Scan(&active)
					return active, err
				})
				if err != nil {
					t.Error("synthetic long-query cleanup failed")
				}
			}()
			deadline := time.Now().Add(2 * time.Second)
			for {
				var sleeping bool
				err := monitorConn.QueryRow(pg17Context(t, time.Second),
					"SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND usename=current_user AND state='active' AND wait_event='PgSleep')", pid).Scan(&sleeping)
				if err != nil {
					t.Fatal("real server activity witness failed")
				}
				if sleeping {
					break
				}
				if time.Now().After(deadline) {
					t.Fatal("no actual PostgreSQL sleeping query was observed")
				}
				time.Sleep(10 * time.Millisecond)
			}
			start := time.Now()
			want := context.Canceled
			if action == "pool-close" {
				want = ErrClosed
				if p.Close(pg17Context(t, 3*time.Second)) != nil {
					t.Fatal("Close did not cancel real server I/O")
				}
			} else {
				cancel()
			}
			select {
			case err := <-result:
				if !errors.Is(err, want) || time.Since(start) > 2*time.Second {
					t.Fatal("canceled real operation returned late or succeeded")
				}
				pg17CleanError(t, f, err)
			case <-time.After(2 * time.Second):
				t.Fatal("real in-flight query outlived cancellation")
			}
			if raw.Stat().AcquiredConns() != 0 {
				t.Fatal("canceled operation retained provider ownership")
			}
			if action == "caller-cancel" {
				p.backend = &pgxBackend{pool: raw}
				if p.Check(pg17Context(t, 3*time.Second)) != nil {
					t.Fatal("real pool did not recover after canceled server I/O")
				}
			}
		})
	}
}
