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
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

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
