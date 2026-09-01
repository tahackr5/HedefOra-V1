package main

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/tahackr5/HedefOra-V1/internal/platform/config"
)

func TestRestoreSignalDefaultsAfterCancellation(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithCancel(context.Background())
	called := make(chan struct{})
	var calls atomic.Int32
	restoreSignalDefaultsAfterCancellation(ctx, func() {
		if calls.Add(1) == 1 {
			close(called)
		}
	})
	cancel()
	select {
	case <-called:
	case <-time.After(time.Second):
		t.Fatal("signal defaults were not restored after cancellation")
	}
	if calls.Load() != 1 {
		t.Fatalf("stop calls = %d, want 1", calls.Load())
	}
}

func TestExecuteRequiresExactAPIProcessMode(t *testing.T) {
	t.Parallel()

	for _, arguments := range [][]string{nil, {"worker"}, {"api", "extra"}} {
		output, file := temporaryErrorFile(t)
		called := false
		exitCode := execute(context.Background(), arguments, nil, file, func(context.Context, config.API, *slog.Logger) error {
			called = true
			return nil
		})
		_ = file.Close()
		if exitCode != 2 || called {
			t.Fatalf("execute(%q) = %d, called=%v", arguments, exitCode, called)
		}
		if content := readFile(t, output); content != "Kullanım: hedefora api\n" {
			t.Fatalf("stderr = %q", content)
		}
	}
}

func TestExecuteLoadsConfigAndReturnsRunnerStatusWithoutDetailLeak(t *testing.T) {
	t.Parallel()

	output, file := temporaryErrorFile(t)
	called := false
	exitCode := execute(
		context.Background(),
		[]string{"api"},
		[]string{"HEDEFORA_API_RETRY_AFTER_SECONDS=7"},
		file,
		func(_ context.Context, value config.API, _ *slog.Logger) error {
			called = true
			if value.RetryAfterSeconds != 7 {
				t.Fatalf("RetryAfterSeconds = %d", value.RetryAfterSeconds)
			}
			return errors.New("fixture-provider-secret")
		},
	)
	_ = file.Close()
	if exitCode != 1 || !called {
		t.Fatalf("execute(api) = %d, called=%v", exitCode, called)
	}
	content := readFile(t, output)
	if strings.Contains(content, "fixture-provider-secret") {
		t.Fatalf("stderr leaked runner detail: %s", content)
	}
	if !strings.Contains(content, `"event_code":"api_process_failed"`) {
		t.Fatalf("stderr missing event code: %s", content)
	}
}

func TestExecuteRejectsInvalidConfigWithoutValueLeak(t *testing.T) {
	t.Parallel()

	output, file := temporaryErrorFile(t)
	exitCode := execute(
		context.Background(),
		[]string{"api"},
		[]string{"HEDEFORA_API_LISTEN_ADDRESS=fixture-secret"},
		file,
		func(context.Context, config.API, *slog.Logger) error {
			t.Fatal("runner called")
			return nil
		},
	)
	_ = file.Close()
	if exitCode != 2 {
		t.Fatalf("execute(invalid config) = %d", exitCode)
	}
	content := readFile(t, output)
	if content != "HedefOra API yapılandırması geçersiz.\n" || strings.Contains(content, "fixture-secret") {
		t.Fatalf("stderr = %q", content)
	}
}

func TestExecuteReturnsSuccess(t *testing.T) {
	t.Parallel()

	_, file := temporaryErrorFile(t)
	exitCode := execute(
		context.Background(),
		[]string{"api"},
		nil,
		file,
		func(context.Context, config.API, *slog.Logger) error { return nil },
	)
	_ = file.Close()
	if exitCode != 0 {
		t.Fatalf("execute(api) = %d", exitCode)
	}
}

func temporaryErrorFile(t *testing.T) (string, *os.File) {
	t.Helper()
	file, err := os.CreateTemp(t.TempDir(), "stderr-*.log")
	if err != nil {
		t.Fatalf("CreateTemp() error = %v", err)
	}
	return file.Name(), file
}

func readFile(t *testing.T, path string) string {
	t.Helper()
	document, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile() error = %v", err)
	}
	return string(document)
}
