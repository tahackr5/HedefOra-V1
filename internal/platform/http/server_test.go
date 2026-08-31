package httpapi

import (
	"bytes"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/tahackr5/HedefOra-V1/internal/platform/config"
	"github.com/tahackr5/HedefOra-V1/internal/platform/telemetry"
)

func TestNewServerAppliesBoundedConfigurationAndRedactedErrorLog(t *testing.T) {
	t.Parallel()

	value := config.DefaultAPI()
	var output bytes.Buffer
	logger := telemetry.NewJSONLogger(&output)
	server, err := NewServer(value, http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}), logger)
	if err != nil {
		t.Fatalf("NewServer() error = %v", err)
	}
	if server.Addr != value.ListenAddress ||
		server.ReadHeaderTimeout != value.ReadHeaderTimeout ||
		server.ReadTimeout != value.ReadTimeout ||
		server.WriteTimeout != value.WriteTimeout ||
		server.IdleTimeout != value.IdleTimeout ||
		server.MaxHeaderBytes != config.APIMaxHeaderBytes {
		t.Fatalf("server = %#v", server)
	}
	const poison = "fixture-raw-http-error-secret"
	server.ErrorLog.Print(poison)
	if strings.Contains(output.String(), poison) {
		t.Fatalf("server ErrorLog leaked raw bytes: %s", output.String())
	}
	if !strings.Contains(output.String(), `"event_code":"http_server_error"`) {
		t.Fatalf("server ErrorLog missing event code: %s", output.String())
	}
}

func TestNewServerRejectsMissingOrInvalidDependencies(t *testing.T) {
	t.Parallel()

	value := config.DefaultAPI()
	handler := http.HandlerFunc(func(http.ResponseWriter, *http.Request) {})
	logger := telemetry.NewJSONLogger(io.Discard)
	for _, build := range []func() (*http.Server, error){
		func() (*http.Server, error) { return NewServer(value, nil, logger) },
		func() (*http.Server, error) { return NewServer(value, handler, nil) },
		func() (*http.Server, error) {
			invalid := value
			invalid.ReadHeaderTimeout = 0
			return NewServer(invalid, handler, logger)
		},
		func() (*http.Server, error) {
			invalid := value
			invalid.ReadTimeout = 0
			return NewServer(invalid, handler, logger)
		},
		func() (*http.Server, error) {
			invalid := value
			invalid.WriteTimeout = 0
			return NewServer(invalid, handler, logger)
		},
		func() (*http.Server, error) {
			invalid := value
			invalid.IdleTimeout = 0
			return NewServer(invalid, handler, logger)
		},
		func() (*http.Server, error) {
			invalid := value
			invalid.MaxHeaderBytes = 0
			return NewServer(invalid, handler, logger)
		},
	} {
		if _, err := build(); !errors.Is(err, ErrInvalidServerDependency) {
			t.Fatalf("NewServer() error = %v", err)
		}
	}
}
