package app

import (
	"context"
	"crypto/rand"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"reflect"
	"time"

	"github.com/tahackr5/HedefOra-V1/internal/platform/config"
	"github.com/tahackr5/HedefOra-V1/internal/platform/health"
	httpapi "github.com/tahackr5/HedefOra-V1/internal/platform/http"
	"github.com/tahackr5/HedefOra-V1/internal/platform/postgres"
	"github.com/tahackr5/HedefOra-V1/internal/platform/telemetry"
)

var (
	ErrAPIStartup  = errors.New("API startup failed")
	ErrAPIListen   = errors.New("API listener failed")
	ErrAPIServe    = errors.New("API server failed")
	ErrAPIShutdown = errors.New("API shutdown failed")
)

type apiRuntime struct {
	health *health.Service
	server *http.Server
}

type databasePool interface {
	health.Readiness
	Close(context.Context) error
}

type apiDependencies struct {
	newPool func(context.Context, config.Postgres) (databasePool, error)
	listen  func(string, string) (net.Listener, error)
	entropy io.Reader
}

func RunAPI(ctx context.Context, value config.API, database config.Postgres, logger *slog.Logger) error {
	if config.ValidatePostgres(database) != nil {
		return ErrAPIStartup
	}
	return runAPI(ctx, value, database, logger, apiDependencies{
		newPool: func(ctx context.Context, database config.Postgres) (databasePool, error) {
			pool, err := postgres.New(ctx, database)
			if err != nil {
				return nil, err
			}
			return pool, nil
		},
		listen:  net.Listen,
		entropy: rand.Reader,
	})
}

func runAPI(ctx context.Context, value config.API, database config.Postgres, logger *slog.Logger, dependencies apiDependencies) (result error) {
	if ctx == nil || logger == nil || config.ValidateAPI(value) != nil || dependencies.newPool == nil || dependencies.listen == nil {
		return ErrAPIStartup
	}
	if ctx.Err() != nil {
		return nil
	}
	pool, err := dependencies.newPool(ctx, database)
	if err != nil || isNilPool(pool) {
		return ErrAPIStartup
	}
	defer func() {
		closeContext, cancel := context.WithTimeout(context.Background(), value.ShutdownTimeout)
		defer cancel()
		if err := pool.Close(closeContext); err != nil {
			result = errors.Join(result, ErrAPIShutdown)
		}
	}()
	runtime, err := buildAPIRuntime(value, logger, dependencies.entropy, pool)
	if err != nil {
		return err
	}
	defer runtime.health.BeginDrain()
	listener, err := dependencies.listen("tcp", value.ListenAddress)
	if err != nil {
		return ErrAPIListen
	}
	return runAPIOnListener(ctx, value, runtime, listener, logger)
}

func isNilPool(pool databasePool) bool {
	if pool == nil {
		return true
	}
	value := reflect.ValueOf(pool)
	switch value.Kind() {
	case reflect.Chan, reflect.Func, reflect.Interface, reflect.Map, reflect.Pointer, reflect.Slice:
		return value.IsNil()
	default:
		return false
	}
}

func buildAPIRuntime(value config.API, logger *slog.Logger, entropy io.Reader, readiness health.Readiness) (*apiRuntime, error) {
	if logger == nil || config.ValidateAPI(value) != nil {
		return nil, ErrAPIStartup
	}
	requestIDs, err := telemetry.NewRequestIDGenerator(entropy)
	if err != nil {
		return nil, ErrAPIStartup
	}
	healthService, err := health.NewService(value.RetryAfterSeconds, readiness, value.ReadinessTimeout)
	if err != nil {
		return nil, ErrAPIStartup
	}
	handler, err := httpapi.NewHandler(healthService, requestIDs, logger)
	if err != nil {
		healthService.BeginDrain()
		return nil, ErrAPIStartup
	}
	server, err := httpapi.NewServer(value, handler, logger)
	if err != nil {
		healthService.BeginDrain()
		return nil, ErrAPIStartup
	}
	return &apiRuntime{health: healthService, server: server}, nil
}

func runAPIOnListener(
	ctx context.Context,
	value config.API,
	runtime *apiRuntime,
	listener net.Listener,
	logger *slog.Logger,
) error {
	defer runtime.server.Close()
	defer runtime.health.BeginDrain()
	serveResult := make(chan error, 1)
	go func() {
		serveResult <- runtime.server.Serve(listener)
	}()

	select {
	case err := <-serveResult:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return ErrAPIServe
	case <-ctx.Done():
	}

	runtime.health.BeginDrain()
	logger.Info(
		"API drain started",
		slog.String("event_code", "api_drain_started"),
		slog.Int("retry_after_seconds", value.RetryAfterSeconds),
	)
	stopped, err := waitDrainDelay(value.DrainDelay, serveResult)
	if err != nil {
		return err
	}
	if stopped {
		return nil
	}

	runtime.server.SetKeepAlivesEnabled(false)
	shutdownContext, cancel := context.WithTimeout(context.Background(), value.ShutdownTimeout)
	defer cancel()
	if err := runtime.server.Shutdown(shutdownContext); err != nil {
		_ = runtime.server.Close()
		<-serveResult
		return ErrAPIShutdown
	}
	if err := <-serveResult; err != nil && !errors.Is(err, http.ErrServerClosed) {
		return ErrAPIServe
	}
	logger.Info(
		"API stopped",
		slog.String("event_code", "api_stopped"),
	)
	return nil
}

func waitDrainDelay(delay time.Duration, serveResult <-chan error) (bool, error) {
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-timer.C:
		return false, nil
	case err := <-serveResult:
		if errors.Is(err, http.ErrServerClosed) {
			return true, nil
		}
		return true, ErrAPIServe
	}
}
