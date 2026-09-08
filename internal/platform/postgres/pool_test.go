package postgres

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"encoding/binary"
	"encoding/pem"
	"errors"
	"io"
	"math/big"
	"net"
	"os"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/tahackr5/HedefOra-V1/internal/platform/config"
)

// All certificates and wire peers in this file are generated in-process. These
// tests are not a PostgreSQL engine, authentication or migration acceptance gate.
func testCertificates(t *testing.T, wrongHostname bool) (string, tls.Certificate) {
	t.Helper()
	rootKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	root := &x509.Certificate{SerialNumber: big.NewInt(1), IsCA: true, BasicConstraintsValid: true,
		KeyUsage: x509.KeyUsageCertSign, NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(time.Hour)}
	rootDER, err := x509.CreateCertificate(rand.Reader, root, root, &rootKey.PublicKey, rootKey)
	if err != nil {
		t.Fatal(err)
	}
	serverKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	server := &x509.Certificate{SerialNumber: big.NewInt(2), NotBefore: root.NotBefore, NotAfter: root.NotAfter,
		ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}, KeyUsage: x509.KeyUsageDigitalSignature,
		DNSNames: []string{"localhost"}, IPAddresses: []net.IP{net.ParseIP("127.0.0.1")}}
	if wrongHostname {
		server.DNSNames = []string{"wrong.invalid"}
		server.IPAddresses = nil
	}
	serverDER, err := x509.CreateCertificate(rand.Reader, server, root, &serverKey.PublicKey, rootKey)
	if err != nil {
		t.Fatal(err)
	}
	return string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: rootDER})), tls.Certificate{Certificate: [][]byte{serverDER}, PrivateKey: serverKey}
}

func testConfig(t *testing.T) config.Postgres {
	t.Helper()
	ca, _ := testCertificates(t, false)
	c := config.DefaultPostgres()
	c.Host, c.Database, c.User, c.Password, c.RootCAPEM = "127.0.0.1", "hedefora_dev", "hedefora_app", "synthetic-unit-password", ca
	return c
}

type fakeConnection struct {
	ping     func(context.Context) error
	releases atomic.Int32
	active   atomic.Int32
	overlap  atomic.Bool
}

func (c *fakeConnection) Ping(ctx context.Context) error {
	if c.active.Add(1) != 1 {
		c.overlap.Store(true)
	}
	defer c.active.Add(-1)
	if c.ping != nil {
		return c.ping(ctx)
	}
	return nil
}
func (c *fakeConnection) Release() {
	if c.active.Load() != 0 {
		c.overlap.Store(true)
	}
	c.releases.Add(1)
}

type fakeBackend struct {
	acquire func(context.Context) (connection, error)
	close   func()
	closes  atomic.Int32
}

func (b *fakeBackend) Acquire(ctx context.Context) (connection, error) { return b.acquire(ctx) }
func (b *fakeBackend) Close() {
	b.closes.Add(1)
	if b.close != nil {
		b.close()
	}
}

func TestProviderConfigurationIsSealedAndRedacted(t *testing.T) {
	c := testConfig(t)
	c.Host = "db.example.test"
	c.Password = "synthetic-' sslmode=disable host=other"
	pc, err := providerConfig(c, nil, context.Background())
	if err != nil {
		t.Fatal(err)
	}
	cc := pc.ConnConfig
	if cc.Host != c.Host || cc.Port != c.Port || cc.Password != c.Password || cc.User != c.User || cc.Database != c.Database ||
		cc.ConnectTimeout != c.ConnectTimeout || pc.MaxConns != 4 || pc.MinConns != 0 || pc.MinIdleConns != 0 {
		t.Fatal("structured fields changed")
	}
	if strings.Contains(pc.ConnString(), c.Password) || strings.Contains(pc.ConnString(), c.Host) {
		t.Fatal("seed contains caller values")
	}
	if cc.TLSConfig == nil || cc.TLSConfig.InsecureSkipVerify || cc.TLSConfig.ServerName != c.Host ||
		cc.TLSConfig.MinVersion < tls.VersionTLS12 || cc.TLSConfig.RootCAs == nil || cc.Fallbacks != nil ||
		len(cc.TLSConfig.Certificates) != 0 || cc.TLSConfig.GetClientCertificate != nil || cc.TLSConfig.KeyLogWriter != nil ||
		cc.TLSConfig.VerifyConnection != nil || cc.TLSConfig.VerifyPeerCertificate != nil {
		t.Fatal("TLS boundary changed")
	}
	if cc.RuntimeParams != nil || cc.Tracer != nil || cc.OnNotice != nil || cc.OnNotification != nil ||
		cc.AfterConnect != nil || cc.AfterNetConnect != nil || cc.ValidateConnect != nil || cc.OAuthTokenProvider != nil ||
		pc.BeforeConnect != nil || pc.AfterConnect != nil || pc.BeforeAcquire != nil || pc.PrepareConn != nil ||
		pc.AfterRelease != nil || pc.BeforeClose != nil || pc.ShouldPing != nil {
		t.Fatal("optional provider exposure")
	}
	if cc.BuildFrontend == nil || cc.BuildContextWatcherHandler == nil || cc.OnPgError == nil {
		t.Fatal("required defaults removed")
	}
	for _, ambient := range []string{"PGHOST=", "PGPASSFILE=synthetic", "PGSERVICE=synthetic", "PGSERVICEFILE=synthetic", "pgsslrootcert=synthetic", "PgPassword=synthetic", "PGUNKNOWN"} {
		if got, err := providerConfig(c, []string{ambient}, context.Background()); got != nil || !errors.Is(err, config.ErrInvalidPostgresEnvironment) {
			t.Fatal("ambient configuration accepted")
		}
	}
	// These are synthetic process values, never an existing credential fixture.
	t.Setenv("PGPASSFILE", "synthetic-never-opened-path")
	if p, err := New(context.Background(), c); p != nil || !errors.Is(err, config.ErrInvalidPostgresEnvironment) {
		t.Fatal("constructor did not repeat ambient rejection")
	}
}

func TestNewAndZeroPoolFailClosed(t *testing.T) {
	c := testConfig(t)
	if p, err := New(nil, c); p != nil || !errors.Is(err, ErrUnavailable) {
		t.Fatal("nil context accepted")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if p, err := New(ctx, c); p != nil || !errors.Is(err, context.Canceled) {
		t.Fatal("canceled construction accepted")
	}
	if p, err := New(context.Background(), config.Postgres{}); p != nil || !errors.Is(err, config.ErrInvalidPostgresEnvironment) {
		t.Fatal("invalid config accepted")
	}
	for _, p := range []*Pool{nil, {}} {
		if err := p.Check(context.Background()); !errors.Is(err, ErrClosed) {
			t.Fatal("invalid pool check succeeded")
		}
		if err := p.Close(context.Background()); !errors.Is(err, ErrClosed) {
			t.Fatal("invalid pool close succeeded")
		}
	}
}

func TestCheckBudgetsAndLateSuccess(t *testing.T) {
	cases := []struct {
		name                                   string
		acquireDelay, probeDelay, callerBudget time.Duration
		want                                   error
	}{
		{"success", 0, 0, 0, nil},
		{"acquire budget", 200 * time.Millisecond, 0, 0, context.DeadlineExceeded},
		{"total includes acquire", 80 * time.Millisecond, 200 * time.Millisecond, 0, context.DeadlineExceeded},
		{"caller budget", 0, 200 * time.Millisecond, 20 * time.Millisecond, context.DeadlineExceeded},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c := testConfig(t)
			c.AcquireTimeout = 100 * time.Millisecond
			c.ProbeTimeout = 150 * time.Millisecond
			conn := &fakeConnection{ping: func(ctx context.Context) error {
				if tc.probeDelay != 0 {
					select {
					case <-ctx.Done():
					case <-time.After(tc.probeDelay):
					}
				}
				return nil
			}}
			b := &fakeBackend{acquire: func(ctx context.Context) (connection, error) {
				if tc.acquireDelay != 0 {
					select {
					case <-ctx.Done():
					case <-time.After(tc.acquireDelay):
					}
				}
				return conn, nil
			}}
			p := newPool(b, c)
			defer func() {
				if err := p.Close(context.Background()); err != nil {
					t.Error(err)
				}
			}()
			ctx := context.Background()
			cancel := func() {}
			if tc.callerBudget != 0 {
				ctx, cancel = context.WithTimeout(ctx, tc.callerBudget)
			}
			defer cancel()
			start := time.Now()
			err := p.Check(ctx)
			elapsed := time.Since(start)
			if !errors.Is(err, tc.want) {
				t.Fatalf("error=%v, want=%v", err, tc.want)
			}
			if elapsed > 300*time.Millisecond {
				t.Fatalf("budget exceeded: %s", elapsed)
			}
			if conn.releases.Load() != 1 || conn.overlap.Load() {
				t.Fatal("connection not released exactly once after use")
			}
		})
	}
}

func TestCheckErrorsCancellationAndNoProviderLeak(t *testing.T) {
	for _, phase := range []string{"acquire error", "nil acquisition", "ping error", "caller cancellation"} {
		t.Run(phase, func(t *testing.T) {
			c := testConfig(t)
			raw := errors.New("synthetic-provider-password-DSN")
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			conn := &fakeConnection{ping: func(context.Context) error {
				if phase == "caller cancellation" {
					cancel()
					return nil
				}
				return raw
			}}
			b := &fakeBackend{acquire: func(context.Context) (connection, error) {
				if phase == "nil acquisition" {
					return nil, nil
				}
				if phase == "acquire error" {
					return conn, raw
				}
				return conn, nil
			}}
			p := newPool(b, c)
			defer p.Close(context.Background())
			err := p.Check(ctx)
			want := ErrUnavailable
			if phase == "caller cancellation" {
				want = context.Canceled
			}
			if !errors.Is(err, want) || errors.Is(err, raw) || strings.Contains(err.Error(), "DSN") {
				t.Fatal("incorrect error or provider detail escaped")
			}
			if phase != "nil acquisition" && conn.releases.Load() != 1 {
				t.Fatal("connection leaked")
			}
			if !errors.Is(p.Check(nil), ErrUnavailable) || !errors.Is(p.Close(nil), ErrUnavailable) {
				t.Fatal("nil context accepted")
			}
		})
	}
}

func TestCloseCancelsOwnedProbeAndWaitsForRelease(t *testing.T) {
	c := testConfig(t)
	entered := make(chan struct{})
	canceled := make(chan struct{})
	conn := &fakeConnection{ping: func(ctx context.Context) error { close(entered); <-ctx.Done(); close(canceled); return nil }}
	b := &fakeBackend{acquire: func(context.Context) (connection, error) { return conn, nil }, close: func() {
		if conn.releases.Load() != 1 {
			t.Error("provider closed before release")
		}
	}}
	p := newPool(b, c)
	result := make(chan error, 1)
	go func() { result <- p.Check(context.Background()) }()
	<-entered
	if err := p.Close(context.Background()); err != nil {
		t.Fatal(err)
	}
	<-canceled
	if !errors.Is(<-result, ErrClosed) {
		t.Fatal("late canceled probe became ready")
	}
	if !errors.Is(p.Check(context.Background()), ErrClosed) || b.closes.Load() != 1 {
		t.Fatal("closed pool admitted work or close repeated")
	}
	if err := p.Close(context.Background()); err != nil || b.closes.Load() != 1 {
		t.Fatal("close not idempotent")
	}
}

func TestCloseDeadlineNeverClaimsProviderCompletion(t *testing.T) {
	c := testConfig(t)
	c.CloseTimeout = time.Second
	finish := make(chan struct{})
	entered := make(chan struct{})
	b := &fakeBackend{acquire: func(context.Context) (connection, error) { return nil, ErrUnavailable }, close: func() { close(entered); <-finish }}
	p := newPool(b, c)
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	start := time.Now()
	if err := p.Close(ctx); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatal("unfinished provider close accepted")
	}
	if time.Since(start) > 250*time.Millisecond {
		t.Fatal("caller close budget exceeded")
	}
	<-entered
	select {
	case <-p.closeDone:
		t.Fatal("provider completion fabricated")
	default:
	}
	if err := p.Close(context.Background()); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatal("own close budget ignored")
	}
	close(finish)
	if err := p.Close(context.Background()); err != nil || b.closes.Load() != 1 {
		t.Fatal("actual completion not observed")
	}
}

func TestIntendedUseConcurrentCheckCancelAndClose(t *testing.T) {
	c := testConfig(t)
	var accepted, released atomic.Int32
	var mu sync.Mutex
	conns := make([]*fakeConnection, 0)
	b := &fakeBackend{acquire: func(ctx context.Context) (connection, error) {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		conn := &fakeConnection{ping: func(ctx context.Context) error {
			select {
			case <-ctx.Done():
				return ctx.Err()
			default:
				return nil
			}
		}}
		accepted.Add(1)
		mu.Lock()
		conns = append(conns, conn)
		mu.Unlock()
		return conn, nil
	}}
	p := newPool(b, c)
	if err := p.Check(context.Background()); err != nil {
		t.Fatal(err)
	}
	start := make(chan struct{})
	var workers sync.WaitGroup
	for i := 0; i < 64; i++ {
		workers.Add(1)
		go func(i int) {
			defer workers.Done()
			<-start
			for j := 0; j < 20; j++ {
				ctx, cancel := context.WithCancel(context.Background())
				if (i+j)%3 == 0 {
					cancel()
				}
				err := p.Check(ctx)
				cancel()
				if err != nil && !errors.Is(err, context.Canceled) && !errors.Is(err, ErrClosed) {
					t.Errorf("unexpected check error: %v", err)
				}
			}
		}(i)
	}
	for i := 0; i < 8; i++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			<-start
			if err := p.Close(context.Background()); err != nil {
				t.Error(err)
			}
		}()
	}
	close(start)
	workers.Wait()
	mu.Lock()
	defer mu.Unlock()
	for _, conn := range conns {
		if conn.releases.Load() != 1 || conn.overlap.Load() {
			t.Fatal("acquired connection ownership violated")
		}
		released.Add(conn.releases.Load())
	}
	if accepted.Load() != released.Load() || b.closes.Load() != 1 {
		t.Fatal("resource leak or repeated provider close")
	}
}

func TestBoundedLookupAndDialLifecycle(t *testing.T) {
	ctx := context.Background()
	lookup := boundedLookup(ctx, 100*time.Millisecond, func(context.Context, string) ([]string, error) { return []string{"bad", "127.0.0.1", "127.0.0.2"}, nil })
	addresses, err := lookup(ctx, "db.example.test")
	if err != nil || len(addresses) != 1 || addresses[0] != "127.0.0.1" {
		t.Fatal("multiple address budgets escaped")
	}
	for _, mode := range []string{"timeout", "lifetime", "late success", "empty", "error"} {
		t.Run(mode, func(t *testing.T) {
			life, cancel := context.WithCancel(context.Background())
			defer cancel()
			entered := make(chan struct{})
			result := make(chan error, 1)
			f := boundedLookup(life, 100*time.Millisecond, func(ctx context.Context, _ string) ([]string, error) {
				close(entered)
				if mode == "empty" {
					return nil, nil
				}
				if mode == "error" {
					return nil, errors.New("synthetic")
				}
				<-ctx.Done()
				return []string{"127.0.0.1"}, nil
			})
			start := time.Now()
			go func() { _, err := f(ctx, "example.test"); result <- err }()
			<-entered
			if mode == "lifetime" {
				cancel()
			}
			if err := <-result; err == nil {
				t.Fatal("lookup failure or expired success accepted")
			}
			if time.Since(start) > 300*time.Millisecond {
				t.Fatal("lookup exceeded budget")
			}
		})
	}
	life, cancel := context.WithCancel(ctx)
	defer cancel()
	client, server := net.Pipe()
	defer server.Close()
	dial := boundedDial(life, time.Second, func(context.Context, string, string) (net.Conn, error) { return client, nil })
	conn, err := dial(ctx, "tcp", "fixture")
	if err != nil {
		t.Fatal(err)
	}
	cancel()
	_ = server.SetReadDeadline(time.Now().Add(time.Second))
	if _, err := server.Read(make([]byte, 1)); !errors.Is(err, io.EOF) {
		t.Fatalf("lifecycle did not close socket: %v", err)
	}
	_ = conn.Close()
	if conn, err := dial(ctx, "tcp", "fixture"); conn != nil || !errors.Is(err, context.Canceled) {
		t.Fatal("closed lifecycle admitted dial")
	}
}

type wirePeer struct {
	listener     net.Listener
	certificate  tls.Certificate
	mode         string
	connections  atomic.Int32
	finished     atomic.Int32
	plainStartup atomic.Int32
	queries      atomic.Int32
	mu           sync.Mutex
	sockets      []net.Conn
	workers      sync.WaitGroup
	stop         chan struct{}
}

func newWirePeer(t *testing.T, mode string, wrongHostname bool) (*wirePeer, config.Postgres) {
	t.Helper()
	ca, cert := testCertificates(t, wrongHostname)
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	p := &wirePeer{listener: l, certificate: cert, mode: mode, stop: make(chan struct{})}
	p.workers.Add(1)
	go func() {
		defer p.workers.Done()
		for {
			conn, err := l.Accept()
			if err != nil {
				return
			}
			p.connections.Add(1)
			p.mu.Lock()
			p.sockets = append(p.sockets, conn)
			p.mu.Unlock()
			p.workers.Add(1)
			go func() { defer p.workers.Done(); defer p.finished.Add(1); defer conn.Close(); p.serve(conn) }()
		}
	}()
	t.Cleanup(func() {
		close(p.stop)
		_ = l.Close()
		p.mu.Lock()
		for _, conn := range p.sockets {
			_ = conn.Close()
		}
		p.mu.Unlock()
		p.workers.Wait()
	})
	c := config.DefaultPostgres()
	c.Host, c.Database, c.User, c.Password, c.RootCAPEM = "127.0.0.1", "hedefora_dev", "hedefora_app", "synthetic-wire-password", ca
	_, port, _ := net.SplitHostPort(l.Addr().String())
	n, _ := strconv.Atoi(port)
	c.Port = uint16(n)
	c.ConnectTimeout = 100 * time.Millisecond
	c.AcquireTimeout = 200 * time.Millisecond
	c.ProbeTimeout = 300 * time.Millisecond
	return p, c
}

func (p *wirePeer) serve(raw net.Conn) {
	_ = raw.SetDeadline(time.Now().Add(5 * time.Second))
	var ssl [8]byte
	if _, err := io.ReadFull(raw, ssl[:]); err != nil {
		return
	}
	if binary.BigEndian.Uint32(ssl[:4]) != 8 || binary.BigEndian.Uint32(ssl[4:]) != 80877103 {
		p.plainStartup.Add(1)
		return
	}
	if p.mode == "stall" {
		var b [1]byte
		_, _ = raw.Read(b[:])
		return
	}
	if p.mode == "plaintext" {
		_, _ = raw.Write([]byte{'N'})
		var b [1]byte
		if _, err := raw.Read(b[:]); err == nil {
			p.plainStartup.Add(1)
		}
		return
	}
	if _, err := raw.Write([]byte{'S'}); err != nil {
		return
	}
	conn := tls.Server(raw, &tls.Config{Certificates: []tls.Certificate{p.certificate}, MinVersion: tls.VersionTLS12})
	if err := conn.Handshake(); err != nil {
		return
	}
	var header [4]byte
	if _, err := io.ReadFull(conn, header[:]); err != nil {
		return
	}
	size := int(binary.BigEndian.Uint32(header[:]))
	if size < 8 || size > 16384 {
		return
	}
	startup := make([]byte, size-4)
	if _, err := io.ReadFull(conn, startup); err != nil {
		return
	}
	if !strings.Contains(string(startup), "hedefora_app") || !strings.Contains(string(startup), "hedefora_dev") {
		return
	}
	if !writeWire(conn, 'R', []byte{0, 0, 0, 0}) || !writeWire(conn, 'Z', []byte{'I'}) {
		return
	}
	for {
		var msg [5]byte
		if _, err := io.ReadFull(conn, msg[:]); err != nil {
			return
		}
		n := int(binary.BigEndian.Uint32(msg[1:]))
		if n < 4 || n > 65536 {
			return
		}
		body := make([]byte, n-4)
		if _, err := io.ReadFull(conn, body); err != nil {
			return
		}
		if msg[0] == 'X' {
			return
		}
		if msg[0] != 'Q' {
			return
		}
		p.queries.Add(1)
		if p.mode == "query stall" {
			var b [1]byte
			_, _ = conn.Read(b[:])
			return
		}
		if p.mode == "provider error" {
			if !writeWire(conn, 'E', []byte("SERROR\x00CXX000\x00Msynthetic-provider-password\x00\x00")) || !writeWire(conn, 'Z', []byte{'I'}) {
				return
			}
			continue
		}
		if !writeWire(conn, 'C', []byte("SELECT 1\x00")) || !writeWire(conn, 'Z', []byte{'I'}) {
			return
		}
	}
}

func writeWire(w io.Writer, kind byte, body []byte) bool {
	message := make([]byte, 5+len(body))
	message[0] = kind
	binary.BigEndian.PutUint32(message[1:5], uint32(4+len(body)))
	copy(message[5:], body)
	_, err := w.Write(message)
	return err == nil
}

func TestSyntheticWireTLSAndProviderErrors(t *testing.T) {
	for _, tc := range []struct {
		name, mode         string
		wrongHost, wrongCA bool
		wantSuccess        bool
	}{
		{"verified", "ok", false, false, true},
		{"wrong CA", "ok", false, true, false},
		{"wrong hostname", "ok", true, false, false},
		{"no plaintext fallback", "plaintext", false, false, false},
		{"stalled handshake", "stall", false, false, false},
		{"query timeout", "query stall", false, false, false},
		{"provider error redacted", "provider error", false, false, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			peer, c := newWirePeer(t, tc.mode, tc.wrongHost)
			if tc.wrongCA {
				c.RootCAPEM, _ = testCertificates(t, false)
			}
			p, err := New(context.Background(), c)
			if err != nil || p == nil {
				t.Fatal("valid config must allow startup before DB reachability")
			}
			if peer.connections.Load() != 0 {
				t.Fatal("constructor probed database")
			}
			start := time.Now()
			err = p.Check(context.Background())
			if (err == nil) != tc.wantSuccess {
				t.Fatalf("success=%v; error=%v", tc.wantSuccess, err)
			}
			if err != nil && !errors.Is(err, ErrUnavailable) && !errors.Is(err, context.DeadlineExceeded) {
				t.Fatalf("provider error escaped: %v", err)
			}
			if time.Since(start) > 600*time.Millisecond {
				t.Fatal("probe budget exceeded")
			}
			if err := p.Close(context.Background()); err != nil {
				t.Fatal(err)
			}
			if peer.plainStartup.Load() != 0 {
				t.Fatal("plaintext startup attempted")
			}
			if tc.wantSuccess && peer.queries.Load() != 1 {
				t.Fatal("no real wire probe")
			}
		})
	}
}

func TestSyntheticWirePoolSaturationCancellationAndClose(t *testing.T) {
	peer, c := newWirePeer(t, "query stall", false)
	c.MaxConnections = 1
	c.AcquireTimeout = 100 * time.Millisecond
	c.ProbeTimeout = 5 * time.Second
	p, err := New(context.Background(), c)
	if err != nil {
		t.Fatal(err)
	}
	first := make(chan error, 1)
	go func() { first <- p.Check(context.Background()) }()
	deadline := time.Now().Add(time.Second)
	for peer.queries.Load() == 0 {
		if time.Now().After(deadline) {
			t.Fatal("first probe not entered")
		}
		time.Sleep(time.Millisecond)
	}
	start := time.Now()
	if err := p.Check(context.Background()); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("saturation: %v", err)
	}
	if time.Since(start) > 300*time.Millisecond {
		t.Fatal("acquire bound exceeded")
	}
	if err := p.Close(context.Background()); err != nil {
		t.Fatal(err)
	}
	if !errors.Is(<-first, ErrClosed) {
		t.Fatal("close did not cancel acquired query")
	}
	if peer.connections.Load() != 1 {
		t.Fatal("pool capacity exceeded")
	}
}

func TestSyntheticWireCanceledAcquireClosesBackgroundConstructor(t *testing.T) {
	peer, c := newWirePeer(t, "stall", false)
	c.ConnectTimeout = 5 * time.Second
	p, err := New(context.Background(), c)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
	defer cancel()
	if err := p.Check(ctx); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatal("canceled acquisition succeeded")
	}
	if peer.connections.Load() != 1 {
		t.Fatal("background constructor not exercised")
	}
	start := time.Now()
	if err := p.Close(context.Background()); err != nil {
		t.Fatal(err)
	}
	if time.Since(start) > 500*time.Millisecond {
		t.Fatal("close waited for original connect timeout")
	}
	deadline := time.Now().Add(time.Second)
	for peer.finished.Load() != peer.connections.Load() {
		if time.Now().After(deadline) {
			t.Fatal("constructor socket survived close")
		}
		time.Sleep(time.Millisecond)
	}
}

func TestSyntheticWireIntendedConcurrentUse(t *testing.T) {
	peer, c := newWirePeer(t, "ok", false)
	c.ConnectTimeout, c.AcquireTimeout, c.ProbeTimeout = time.Second, 2*time.Second, 3*time.Second
	p, err := New(context.Background(), c)
	if err != nil {
		t.Fatal(err)
	}
	var workers sync.WaitGroup
	for i := 0; i < 16; i++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			for j := 0; j < 20; j++ {
				if err := p.Check(context.Background()); err != nil {
					t.Errorf("concurrent probe: %v", err)
					return
				}
			}
		}()
	}
	workers.Wait()
	if err := p.Close(context.Background()); err != nil {
		t.Fatal(err)
	}
	if peer.connections.Load() > c.MaxConnections || peer.queries.Load() < 320 {
		t.Fatal("capacity or probe accounting failed")
	}
}

// Observe the real ssl=off engine without intercepting or changing its bytes.
// A plaintext StartupMessage, on this or a fallback connection, fails even if
// the engine's hostnossl-reject HBA would also deny authentication.
type pg17RefusalWire struct {
	net.Conn
	mu      sync.Mutex
	written int
	read    int
	prefix  [8]byte
	reply   byte
}

func (w *pg17RefusalWire) recordWrite(b []byte) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.written < len(w.prefix) {
		copy(w.prefix[w.written:], b)
	}
	w.written += len(b)
}

func (w *pg17RefusalWire) recordRead(b []byte) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.read == 0 && len(b) > 0 {
		w.reply = b[0]
	}
	w.read += len(b)
}

func (w *pg17RefusalWire) Write(b []byte) (int, error) {
	n, err := w.Conn.Write(b)
	w.recordWrite(b[:n])
	return n, err
}

func (w *pg17RefusalWire) Read(b []byte) (int, error) {
	n, err := w.Conn.Read(b)
	w.recordRead(b[:n])
	return n, err
}

func (w *pg17RefusalWire) refusedWithoutStartup() bool {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.written == 8 && w.prefix == [8]byte{0, 0, 0, 8, 4, 210, 22, 47} && w.read == 1 && w.reply == 'N'
}

func TestTLSRefusalWireObservationRejectsFallback(t *testing.T) {
	request := []byte{0, 0, 0, 8, 4, 210, 22, 47}
	w := &pg17RefusalWire{}
	w.recordWrite(request[:3])
	w.recordWrite(request[3:])
	w.recordRead([]byte{'N'})
	if !w.refusedWithoutStartup() {
		t.Fatal("fragmented SSLRequest witness rejected")
	}
	w.recordWrite([]byte{0, 0, 0, 20})
	if w.refusedWithoutStartup() {
		t.Fatal("plaintext startup after TLS refusal accepted")
	}
	for _, reply := range [][]byte{nil, {'S'}, {'N', 'X'}} {
		w := &pg17RefusalWire{}
		w.recordWrite(request)
		w.recordRead(reply)
		if w.refusedWithoutStartup() {
			t.Fatal("missing or wrong refusal witness accepted")
		}
	}
	w = &pg17RefusalWire{}
	w.recordWrite([]byte{0, 0, 0, 8, 0, 3, 0, 0})
	w.recordRead([]byte{'N'})
	if w.refusedWithoutStartup() {
		t.Fatal("plaintext startup on fallback connection accepted")
	}
}

func pg17CancelAndObserve(ctx context.Context, cancelQuery func(context.Context) (bool, error), activeQuery func(context.Context) (bool, error)) error {
	cancelled, err := cancelQuery(ctx)
	if err != nil || !cancelled {
		return errors.New("synthetic query cancellation was not acknowledged")
	}
	for {
		active, err := activeQuery(ctx)
		if err != nil {
			return errors.New("synthetic query completion could not be observed")
		}
		if !active {
			return nil
		}
		timer := time.NewTimer(10 * time.Millisecond)
		select {
		case <-ctx.Done():
			timer.Stop()
			return ctx.Err()
		case <-timer.C:
		}
	}
}

func TestSyntheticQueryCleanupRequiresAcknowledgementAndCompletion(t *testing.T) {
	ok := func(context.Context) (bool, error) { return true, nil }
	no := func(context.Context) (bool, error) { return false, nil }
	if pg17CancelAndObserve(context.Background(), no, no) == nil {
		t.Fatal("false cancellation was accepted")
	}
	if pg17CancelAndObserve(context.Background(), ok, no) != nil {
		t.Fatal("acknowledged completed cleanup was rejected")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if !errors.Is(pg17CancelAndObserve(ctx, ok, ok), context.Canceled) {
		t.Fatal("active query was accepted after cleanup deadline")
	}
	failed := func(context.Context) (bool, error) { return false, errors.New("synthetic query error") }
	if pg17CancelAndObserve(context.Background(), failed, no) == nil || pg17CancelAndObserve(context.Background(), ok, failed) == nil {
		t.Fatal("failed cleanup query was accepted")
	}
}

// A pgxpool Release invalidates the acquired handle synchronously, but a closed
// connection stays in AcquiredConns until puddle's asynchronous destructor and
// bookkeeping finish. Observe the exact lease separately from that capacity.
type pg17LeaseObservation struct {
	acquisitions atomic.Int32
	releases     atomic.Int32
	acknowledged chan struct{}
	once         sync.Once
}

func newPG17LeaseObservation() *pg17LeaseObservation {
	return &pg17LeaseObservation{acknowledged: make(chan struct{})}
}

func (o *pg17LeaseObservation) release(release func()) {
	release()
	o.releases.Add(1)
	o.once.Do(func() { close(o.acknowledged) })
}

func (o *pg17LeaseObservation) releasedBeforeReturn() bool {
	if o == nil || o.acquisitions.Load() != 1 || o.releases.Load() != 1 {
		return false
	}
	select {
	case <-o.acknowledged:
		return true
	default:
		return false
	}
}

type pg17CheckResult struct {
	err                     error
	releaseObservedAtReturn bool
}

func pg17CaptureCheckResult(err error, observation *pg17LeaseObservation) pg17CheckResult {
	return pg17CheckResult{err: err, releaseObservedAtReturn: observation.releasedBeforeReturn()}
}

func pg17ObserveReleasedCapacity(ctx context.Context, observation *pg17LeaseObservation, acquired func() int32) error {
	if ctx == nil || acquired == nil || !observation.releasedBeforeReturn() {
		return errors.New("exact lease release was not acknowledged before return")
	}
	deadline, bounded := ctx.Deadline()
	if !bounded {
		return errors.New("provider capacity observation requires an absolute deadline")
	}
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		if !time.Now().Before(deadline) {
			return context.DeadlineExceeded
		}
		count := acquired()
		// The observation itself may cross the deadline. A late zero is not PASS.
		if err := ctx.Err(); err != nil {
			return err
		}
		if !time.Now().Before(deadline) {
			return context.DeadlineExceeded
		}
		if count < 0 || !observation.releasedBeforeReturn() {
			return errors.New("provider lease evidence changed during observation")
		}
		if count == 0 {
			return nil
		}
		timer := time.NewTimer(min(10*time.Millisecond, time.Until(deadline)))
		select {
		case <-ctx.Done():
			timer.Stop()
			return ctx.Err()
		case <-timer.C:
		}
	}
}

type pg17ObservedBackend struct {
	*pgxBackend
	observation *pg17LeaseObservation
}

func (b *pg17ObservedBackend) Acquire(ctx context.Context) (connection, error) {
	conn, err := b.pgxBackend.Acquire(ctx)
	if err != nil {
		return nil, err
	}
	b.observation.acquisitions.Add(1)
	return &pg17ObservedConnection{connection: conn, observation: b.observation}, nil
}

type pg17ObservedConnection struct {
	connection
	observation *pg17LeaseObservation
}

func (c *pg17ObservedConnection) Release() {
	c.observation.release(c.connection.Release)
}

func TestPGXReleaseAcknowledgementPrecedesAsynchronousDestructorAccounting(t *testing.T) {
	peer, c := newWirePeer(t, "query stall", false)
	c.MaxConnections = 1
	c.ConnectTimeout, c.AcquireTimeout, c.ProbeTimeout = time.Second, time.Second, 5*time.Second
	p := newPool(nil, c)
	pc, err := providerConfig(c, os.Environ(), p.lifetime)
	if err != nil {
		t.Fatal("synthetic provider configuration failed")
	}
	entered, finish := make(chan struct{}), make(chan struct{})
	var unblock sync.Once
	allowDestructor := func() { unblock.Do(func() { close(finish) }) }
	defer allowDestructor()
	pc.BeforeClose = func(*pgx.Conn) {
		close(entered)
		<-finish
	}
	raw, err := pgxpool.NewWithConfig(context.Background(), pc)
	if err != nil {
		t.Fatal("synthetic provider construction failed")
	}
	observation := newPG17LeaseObservation()
	p.backend = &pg17ObservedBackend{pgxBackend: &pgxBackend{pool: raw}, observation: observation}
	defer func() {
		allowDestructor()
		if p.Close(context.Background()) != nil {
			t.Error("synthetic provider cleanup failed")
		}
	}()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	result := make(chan pg17CheckResult, 1)
	go func() {
		err := p.Check(ctx)
		result <- pg17CaptureCheckResult(err, observation)
	}()
	deadline := time.Now().Add(time.Second)
	for peer.queries.Load() != 1 {
		if !time.Now().Before(deadline) {
			t.Fatal("synthetic query was not observed")
		}
		time.Sleep(time.Millisecond)
	}
	cancel()
	select {
	case observed := <-result:
		if !errors.Is(observed.err, context.Canceled) || !observed.releaseObservedAtReturn || !observation.releasedBeforeReturn() {
			t.Fatal("probe returned without exact lease release acknowledgement")
		}
	case <-time.After(time.Second):
		t.Fatal("probe waited for the blocked asynchronous destructor")
	}
	select {
	case <-entered:
	case <-time.After(time.Second):
		t.Fatal("asynchronous destructor did not enter its barrier")
	}
	if raw.Stat().AcquiredConns() != 1 {
		t.Fatal("blocked destructor did not retain its capacity reservation")
	}
	waitCtx, stopWait := context.WithTimeout(context.Background(), 20*time.Millisecond)
	if err := pg17ObserveReleasedCapacity(waitCtx, observation, func() int32 { return raw.Stat().AcquiredConns() }); !errors.Is(err, context.DeadlineExceeded) {
		stopWait()
		t.Fatal("reserved provider capacity was accepted as complete")
	}
	stopWait()
	closeCtx, stopClose := context.WithTimeout(context.Background(), 20*time.Millisecond)
	if err := p.Close(closeCtx); !errors.Is(err, context.DeadlineExceeded) {
		stopClose()
		t.Fatal("Close claimed completion while the destructor was blocked")
	}
	stopClose()
	select {
	case <-p.closeDone:
		t.Fatal("provider close completed before its destructor")
	default:
	}
	allowDestructor()
	completed, stopCompleted := context.WithTimeout(context.Background(), 2*time.Second)
	defer stopCompleted()
	if p.Close(completed) != nil || pg17ObserveReleasedCapacity(completed, observation, func() int32 { return raw.Stat().AcquiredConns() }) != nil {
		t.Fatal("actual provider completion was not observed after the barrier")
	}
	if raw.Stat().AcquiredConns() != 0 || observation.acquisitions.Load() != 1 || observation.releases.Load() != 1 {
		t.Fatal("provider capacity or exact lease accounting changed")
	}
}

func TestReleaseEvidenceRequiresSynchronousExactAcknowledgement(t *testing.T) {
	for _, mode := range []string{"missing acquisition", "missing release", "unacknowledged release", "duplicate acquisition", "duplicate release"} {
		t.Run(mode, func(t *testing.T) {
			observation := newPG17LeaseObservation()
			if mode != "missing acquisition" {
				observation.acquisitions.Add(1)
			}
			if mode == "unacknowledged release" {
				observation.releases.Add(1)
			} else if mode != "missing release" {
				observation.release(func() {})
			}
			if mode == "duplicate acquisition" {
				observation.acquisitions.Add(1)
			}
			if mode == "duplicate release" {
				observation.release(func() {})
			}
			ctx, cancel := context.WithTimeout(context.Background(), time.Second)
			defer cancel()
			called := false
			if pg17ObserveReleasedCapacity(ctx, observation, func() int32 { called = true; return 0 }) == nil || called {
				t.Fatal("missing or ambiguous synchronous release was accepted")
			}
		})
	}
}

func TestCapacityObservationKeepsItsOriginalAbsoluteDeadline(t *testing.T) {
	for _, mode := range []string{"zero", "eventual zero", "persistent reservation", "expired zero", "late zero", "canceled zero", "duplicate release", "negative count", "unbounded"} {
		t.Run(mode, func(t *testing.T) {
			observation := newPG17LeaseObservation()
			observation.acquisitions.Add(1)
			observation.release(func() {})
			deadline := time.Now().Add(25 * time.Millisecond)
			if mode == "zero" || mode == "eventual zero" {
				deadline = time.Now().Add(time.Second)
			}
			if mode == "expired zero" {
				deadline = time.Now().Add(-time.Second)
			}
			ctx, cancel := context.WithDeadline(context.Background(), deadline)
			defer cancel()
			if mode == "canceled zero" {
				cancel()
			}
			if mode == "unbounded" {
				ctx = context.Background()
			}
			calls := 0
			err := pg17ObserveReleasedCapacity(ctx, observation, func() int32 {
				calls++
				switch mode {
				case "persistent reservation":
					return 1
				case "eventual zero":
					if calls == 1 {
						return 1
					}
				case "late zero":
					<-ctx.Done()
					return 0
				case "duplicate release":
					observation.release(func() {})
				case "negative count":
					return -1
				}
				return 0
			})
			wantSuccess := mode == "zero" || mode == "eventual zero"
			if (err == nil) != wantSuccess {
				t.Fatal("invalid provider capacity completion decision")
			}
			if (mode == "expired zero" || mode == "canceled zero" || mode == "unbounded") && calls != 0 {
				t.Fatal("capacity was observed outside its admitted deadline")
			}
		})
	}
}

func TestReleaseAcknowledgementWaitsForActualReleaseReturn(t *testing.T) {
	observation := newPG17LeaseObservation()
	observation.acquisitions.Add(1)
	entered, finish, done := make(chan struct{}), make(chan struct{}), make(chan struct{})
	var unblock sync.Once
	allowRelease := func() { unblock.Do(func() { close(finish) }) }
	defer allowRelease()
	go func() {
		defer close(done)
		observation.release(func() { close(entered); <-finish })
	}()
	<-entered
	if observation.releasedBeforeReturn() || observation.releases.Load() != 0 {
		t.Fatal("blocked release was acknowledged before returning")
	}
	allowRelease()
	<-done
	if !observation.releasedBeforeReturn() {
		t.Fatal("completed exact release was not acknowledged")
	}
}

func TestCheckReturnSnapshotRejectsReleaseAcknowledgedOnlyBeforeConsumption(t *testing.T) {
	observation := newPG17LeaseObservation()
	observation.acquisitions.Add(1)
	result := make(chan pg17CheckResult, 1)
	result <- pg17CaptureCheckResult(context.Canceled, observation)
	observation.release(func() {})
	observed := <-result
	if !observation.releasedBeforeReturn() || observed.releaseObservedAtReturn || !errors.Is(observed.err, context.Canceled) {
		t.Fatal("late release changed the captured Check-return observation")
	}
}

type pg17BlockedReleaseConnection struct {
	connection
	beforeRelease func()
}

func (c *pg17BlockedReleaseConnection) Release() {
	c.beforeRelease()
	c.connection.Release()
}

func TestCheckCannotReturnBeforeItsUnderlyingReleaseCompletes(t *testing.T) {
	entered, finish := make(chan struct{}), make(chan struct{})
	var unblock sync.Once
	allowRelease := func() { unblock.Do(func() { close(finish) }) }
	defer allowRelease()
	observation := newPG17LeaseObservation()
	underlying := &fakeConnection{}
	blocked := &pg17BlockedReleaseConnection{connection: underlying, beforeRelease: func() { close(entered); <-finish }}
	backend := &fakeBackend{acquire: func(context.Context) (connection, error) {
		observation.acquisitions.Add(1)
		return &pg17ObservedConnection{connection: blocked, observation: observation}, nil
	}}
	p := newPool(backend, testConfig(t))
	defer func() {
		allowRelease()
		if p.Close(context.Background()) != nil {
			t.Error("blocked-release pool cleanup failed")
		}
	}()
	result := make(chan pg17CheckResult, 1)
	go func() {
		err := p.Check(context.Background())
		result <- pg17CaptureCheckResult(err, observation)
	}()
	select {
	case <-entered:
	case <-time.After(time.Second):
		t.Fatal("underlying release did not enter its barrier")
	}
	select {
	case <-result:
		t.Fatal("Check returned before its underlying Release completed")
	default:
	}
	if observation.releasedBeforeReturn() || underlying.releases.Load() != 0 {
		t.Fatal("blocked underlying release was acknowledged")
	}
	allowRelease()
	select {
	case observed := <-result:
		if observed.err != nil || !observed.releaseObservedAtReturn || underlying.releases.Load() != 1 {
			t.Fatal("Check result omitted its exact completed release")
		}
	case <-time.After(time.Second):
		t.Fatal("Check did not return after its underlying release completed")
	}
}
