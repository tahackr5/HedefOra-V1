package app

import (
	"context"
	"crypto/rand"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"time"

	"github.com/tahackr5/HedefOra-V1/internal/platform/config"
	"github.com/tahackr5/HedefOra-V1/internal/platform/health"
	httpapi "github.com/tahackr5/HedefOra-V1/internal/platform/http"
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

func RunAPI(ctx context.Context, value config.API, logger *slog.Logger) error {
	if ctx == nil || logger == nil {
		return ErrAPIStartup
	}
	if ctx.Err() != nil {
		return nil
	}
	runtime, err := buildAPIRuntime(value, logger, rand.Reader)
	if err != nil {
		return err
	}
	listener, err := net.Listen("tcp", value.ListenAddress)
	if err != nil {
		return ErrAPIListen
	}
	return runAPIOnListener(ctx, value, runtime, listener, logger)
}

func buildAPIRuntime(value config.API, logger *slog.Logger, entropy io.Reader) (*apiRuntime, error) {
	requestIDs, err := telemetry.NewRequestIDGenerator(entropy)
	if err != nil {
		return nil, ErrAPIStartup
	}
	healthService, err := health.NewService(value.RetryAfterSeconds)
	if err != nil {
		return nil, ErrAPIStartup
	}
	handler, err := httpapi.NewHandler(healthService, requestIDs, logger)
	if err != nil {
		return nil, ErrAPIStartup
	}
	server, err := httpapi.NewServer(value, handler, logger)
	if err != nil {
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
