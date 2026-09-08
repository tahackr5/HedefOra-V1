package main

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/x509"
	"encoding/pem"
	"errors"
	"log/slog"
	"math/big"
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
		exitCode := execute(context.Background(), arguments, nil, file, func(context.Context, config.API, config.Postgres, *slog.Logger) error {
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
		append(syntheticDatabaseEnvironment(t), "HEDEFORA_API_RETRY_AFTER_SECONDS=7"),
		file,
		func(_ context.Context, value config.API, database config.Postgres, _ *slog.Logger) error {
			called = true
			if database.Host != "localhost" || database.Database != "hedefora_dev" || database.User != "hedefora_app" {
				t.Fatal("database configuration was not passed to runner")
			}
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
		func(context.Context, config.API, config.Postgres, *slog.Logger) error {
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
		syntheticDatabaseEnvironment(t),
		file,
		func(context.Context, config.API, config.Postgres, *slog.Logger) error { return nil },
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

func TestExecuteRequiresValidDatabaseConfigurationWithoutLeakingDetails(t *testing.T) {
	t.Parallel()
	for _, environ := range [][]string{
		nil,
		{"HEDEFORA_POSTGRES_HOST=fixture-database-secret"},
		append(syntheticDatabaseEnvironment(t), "PGPASSWORD=fixture-ambient-secret"),
	} {
		path, file := temporaryErrorFile(t)
		called := false
		exit := execute(context.Background(), []string{"api"}, environ, file, func(context.Context, config.API, config.Postgres, *slog.Logger) error { called = true; return nil })
		_ = file.Close()
		if exit != 2 || called {
			t.Fatalf("invalid database exit=%d called=%v", exit, called)
		}
		if content := readFile(t, path); content != "HedefOra API yapılandırması geçersiz.\n" {
			t.Fatalf("unexpected or unsanitized stderr=%q", content)
		}
	}
}

func syntheticDatabaseEnvironment(t *testing.T) []string {
	t.Helper()
	public, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	template := &x509.Certificate{
		SerialNumber:          big.NewInt(1),
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().Add(time.Hour),
		IsCA:                  true,
		BasicConstraintsValid: true,
		KeyUsage:              x509.KeyUsageCertSign,
	}
	certificate, err := x509.CreateCertificate(rand.Reader, template, template, public, private)
	if err != nil {
		t.Fatal(err)
	}
	root := string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: certificate}))
	return []string{
		"HEDEFORA_POSTGRES_HOST=localhost",
		"HEDEFORA_POSTGRES_DATABASE=hedefora_dev",
		"HEDEFORA_POSTGRES_USER=hedefora_app",
		"HEDEFORA_POSTGRES_PASSWORD=synthetic-only",
		"HEDEFORA_POSTGRES_ROOT_CA_PEM=" + root,
	}
}
