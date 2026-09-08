// Package postgres owns the application pool. Connections and provider errors
// never cross this boundary; Check is a bounded reachability probe only.
package postgres

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"net"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/tahackr5/HedefOra-V1/internal/platform/config"
)

var (
	ErrUnavailable = errors.New("PostgreSQL unavailable")
	ErrClosed      = errors.New("PostgreSQL pool closed")
)

// These interfaces are private test boundaries, not application extension points.
type connection interface {
	Ping(context.Context) error
	Release()
}

type poolBackend interface {
	Acquire(context.Context) (connection, error)
	Close()
}

type pgxBackend struct{ pool *pgxpool.Pool }

func (p *pgxBackend) Acquire(ctx context.Context) (connection, error) {
	conn, err := p.pool.Acquire(ctx)
	if err != nil {
		return nil, err
	}
	return conn, nil
}
func (p *pgxBackend) Close() { p.pool.Close() }

// Pool must not be copied. Close stops admission, cancels owned probes and waits
// for actual provider completion within each caller's bounded wait.
type Pool struct {
	mu             sync.Mutex
	operations     sync.WaitGroup
	backend        poolBackend
	lifetime       context.Context
	cancel         context.CancelFunc
	closed         bool
	closeDone      chan struct{}
	acquireTimeout time.Duration
	probeTimeout   time.Duration
	closeTimeout   time.Duration
}

func New(ctx context.Context, c config.Postgres) (*Pool, error) {
	if ctx == nil {
		return nil, ErrUnavailable
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	p := newPool(nil, c)
	pc, err := providerConfig(c, os.Environ(), p.lifetime)
	if err != nil {
		p.cancel()
		return nil, err
	}
	backend, err := pgxpool.NewWithConfig(ctx, pc)
	if err != nil {
		p.cancel()
		return nil, ErrUnavailable
	}
	// MinConns and MinIdleConns are zero: construction does not probe the DB.
	p.backend = &pgxBackend{pool: backend}
	if err := ctx.Err(); err != nil {
		_ = p.Close(ctx)
		return nil, err
	}
	return p, nil
}

func newPool(backend poolBackend, c config.Postgres) *Pool {
	lifetime, cancel := context.WithCancel(context.Background())
	return &Pool{backend: backend, lifetime: lifetime, cancel: cancel,
		closeDone: make(chan struct{}), acquireTimeout: c.AcquireTimeout,
		probeTimeout: c.ProbeTimeout, closeTimeout: c.CloseTimeout}
}

func providerConfig(c config.Postgres, environ []string, lifetime context.Context) (*pgxpool.Config, error) {
	if err := config.ValidatePostgres(c); err != nil {
		return nil, err
	}
	// Repeat ambient rejection at construction even for directly constructed config.
	for _, entry := range environ {
		name, _, _ := strings.Cut(entry, "=")
		if strings.HasPrefix(strings.ToUpper(name), "PG") {
			return nil, config.ErrInvalidPostgresEnvironment
		}
	}
	// ParseConfig is required by pgx's private creation marker. This constant seed
	// contains no supplied values and is never connected. Empty explicit file
	// settings prevent passfile/default TLS file contents from being read. The
	// service key must be absent: even service='' invokes the service-file parser.
	pc, err := pgxpool.ParseConfig("host=localhost port=5432 user=unused dbname=unused password=unused passfile='' servicefile='' sslrootcert='' sslcert='' sslkey='' sslpassword='' sslmode=disable")
	if err != nil {
		return nil, ErrUnavailable
	}
	roots := x509.NewCertPool()
	if !roots.AppendCertsFromPEM([]byte(c.RootCAPEM)) {
		return nil, config.ErrInvalidPostgresEnvironment
	}
	cc := pc.ConnConfig
	cc.Host, cc.Port, cc.Database, cc.User, cc.Password = c.Host, c.Port, c.Database, c.User, c.Password
	cc.ConnectTimeout = c.ConnectTimeout
	cc.TLSConfig = &tls.Config{RootCAs: roots, ServerName: c.Host, MinVersion: tls.VersionTLS12}
	cc.Fallbacks = nil
	cc.RuntimeParams = nil
	cc.SSLNegotiation = "postgres"
	cc.KerberosSrvName, cc.KerberosSpn = "", ""
	cc.ValidateConnect, cc.AfterConnect, cc.AfterNetConnect = nil, nil, nil
	cc.OnNotice, cc.OnNotification, cc.OAuthTokenProvider = nil, nil, nil
	cc.Tracer = nil
	// Retain pgx's frontend, cancellation watcher and FATAL-error handler.
	// pgx does DNS before its per-address ConnectTimeout. Bound that phase too
	// and select one address, avoiding an unbounded sequence of address budgets.
	cc.LookupFunc = boundedLookup(lifetime, c.ConnectTimeout, net.DefaultResolver.LookupHost)
	cc.DialFunc = boundedDial(lifetime, c.ConnectTimeout, (&net.Dialer{Timeout: c.ConnectTimeout, KeepAlive: 30 * time.Second}).DialContext)
	pc.MaxConns, pc.MinConns, pc.MinIdleConns = c.MaxConnections, 0, 0
	pc.PingTimeout = min(c.AcquireTimeout, c.ProbeTimeout)
	pc.BeforeConnect, pc.AfterConnect, pc.BeforeAcquire, pc.PrepareConn = nil, nil, nil, nil
	pc.AfterRelease, pc.BeforeClose, pc.ShouldPing = nil, nil, nil
	return pc, nil
}

func boundedLookup(lifetime context.Context, timeout time.Duration, lookup func(context.Context, string) ([]string, error)) func(context.Context, string) ([]string, error) {
	return func(ctx context.Context, host string) ([]string, error) {
		bounded, cancel := context.WithTimeout(ctx, timeout)
		stop := context.AfterFunc(lifetime, cancel)
		defer stop()
		defer cancel()
		if lifetime.Err() != nil {
			return nil, context.Canceled
		}
		addresses, err := lookup(bounded, host)
		if bounded.Err() != nil {
			return nil, bounded.Err()
		}
		if err != nil || len(addresses) == 0 {
			return nil, ErrUnavailable
		}
		for _, address := range addresses {
			if net.ParseIP(address) != nil {
				return []string{address}, nil
			}
		}
		return nil, ErrUnavailable
	}
}

type lifecycleConnection struct {
	net.Conn
	stop func() bool
}

func (c *lifecycleConnection) Close() error {
	c.stop()
	return c.Conn.Close()
}

func boundedDial(lifetime context.Context, timeout time.Duration, dial func(context.Context, string, string) (net.Conn, error)) func(context.Context, string, string) (net.Conn, error) {
	return func(ctx context.Context, network, address string) (net.Conn, error) {
		bounded, cancel := context.WithTimeout(ctx, timeout)
		stop := context.AfterFunc(lifetime, cancel)
		defer stop()
		defer cancel()
		if lifetime.Err() != nil {
			return nil, context.Canceled
		}
		conn, err := dial(bounded, network, address)
		if bounded.Err() != nil || lifetime.Err() != nil || err != nil {
			if conn != nil {
				_ = conn.Close()
			}
			if lifetime.Err() != nil {
				return nil, context.Canceled
			}
			return nil, firstError(bounded.Err(), ErrUnavailable)
		}
		if conn == nil {
			return nil, ErrUnavailable
		}
		// Keep established TLS/startup/idle sockets attached to pool cancellation,
		// even when pgx continues constructing after an Acquire caller has left.
		closeSocket := context.AfterFunc(lifetime, func() { _ = conn.Close() })
		return &lifecycleConnection{Conn: conn, stop: closeSocket}, nil
	}
}

func (p *Pool) Check(ctx context.Context) error {
	if p == nil {
		return ErrClosed
	}
	if ctx == nil {
		return ErrUnavailable
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	p.mu.Lock()
	if p.closed || p.backend == nil {
		p.mu.Unlock()
		return ErrClosed
	}
	p.operations.Add(1)
	p.mu.Unlock()
	defer p.operations.Done()
	probe, cancel := context.WithTimeout(ctx, p.probeTimeout)
	stop := context.AfterFunc(p.lifetime, cancel)
	defer stop()
	defer cancel()
	acquire, cancelAcquire := context.WithTimeout(probe, p.acquireTimeout)
	conn, err := p.backend.Acquire(acquire)
	acquireErr := acquire.Err()
	cancelAcquire()
	if conn != nil {
		defer conn.Release()
	}
	if err != nil || acquireErr != nil || conn == nil {
		return p.result(ctx, probe, firstError(acquireErr, ErrUnavailable))
	}
	if probe.Err() != nil {
		return p.result(ctx, probe, ErrUnavailable)
	}
	// Only this goroutine uses the acquired connection, including its release.
	err = conn.Ping(probe)
	if err != nil {
		err = ErrUnavailable
	}
	return p.result(ctx, probe, err)
}

func firstError(preferred, fallback error) error {
	if preferred != nil {
		return preferred
	}
	return fallback
}

func (p *Pool) result(caller, probe context.Context, fallback error) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if err := caller.Err(); err != nil {
		return err
	}
	if p.closed {
		return ErrClosed
	}
	if err := probe.Err(); err != nil {
		return err
	}
	return fallback
}

func (p *Pool) Close(ctx context.Context) error {
	if p == nil {
		return ErrClosed
	}
	if ctx == nil {
		return ErrUnavailable
	}
	p.mu.Lock()
	if p.backend == nil {
		p.mu.Unlock()
		return ErrClosed
	}
	if !p.closed {
		p.closed = true
		p.cancel()
		// WaitGroup.Add and the transition to closed share the lock; no operation
		// can be registered after Wait starts. One goroutine owns provider Close.
		go func() {
			p.operations.Wait()
			p.backend.Close()
			close(p.closeDone)
		}()
	}
	p.mu.Unlock()
	bounded, cancel := context.WithTimeout(ctx, p.closeTimeout)
	defer cancel()
	select {
	case <-p.closeDone:
		return bounded.Err()
	case <-bounded.Done():
		// pgx's destructor has a separate 15s budget. A timed-out wait does not
		// claim provider completion; later Close calls observe the same done.
		return bounded.Err()
	}
}
