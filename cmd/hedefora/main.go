package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/tahackr5/HedefOra-V1/internal/platform/app"
	"github.com/tahackr5/HedefOra-V1/internal/platform/config"
	"github.com/tahackr5/HedefOra-V1/internal/platform/telemetry"
)

type apiRunner func(context.Context, config.API, *slog.Logger) error

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	restoreSignalDefaultsAfterCancellation(ctx, stop)
	exitCode := execute(ctx, os.Args[1:], os.Environ(), os.Stderr, app.RunAPI)
	stop()
	os.Exit(exitCode)
}

func restoreSignalDefaultsAfterCancellation(ctx context.Context, stop context.CancelFunc) {
	go func() {
		<-ctx.Done()
		stop()
	}()
}

func execute(
	ctx context.Context,
	arguments []string,
	environ []string,
	standardError *os.File,
	runAPI apiRunner,
) int {
	if len(arguments) != 1 || arguments[0] != "api" {
		_, _ = fmt.Fprintln(standardError, "Kullanım: hedefora api")
		return 2
	}
	value, err := config.LoadAPI(environ)
	if err != nil {
		_, _ = fmt.Fprintln(standardError, "HedefOra API yapılandırması geçersiz.")
		return 2
	}
	logger := telemetry.NewJSONLogger(standardError)
	if err := runAPI(ctx, value, logger); err != nil {
		logger.Error(
			"API process failed",
			slog.String("event_code", "api_process_failed"),
		)
		return 1
	}
	return 0
}
