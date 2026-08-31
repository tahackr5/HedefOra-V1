package config

import (
	"errors"
	"strings"
	"testing"
	"time"
)

func TestLoadAPIDefaultsAndOverrides(t *testing.T) {
	t.Parallel()

	defaults, err := LoadAPI([]string{"PATH=ignored", "HEDEFORA_WORKER_MODE=ignored"})
	if err != nil {
		t.Fatalf("LoadAPI(defaults) error = %v", err)
	}
	if defaults != DefaultAPI() {
		t.Fatalf("LoadAPI(defaults) = %#v, want %#v", defaults, DefaultAPI())
	}

	configured, err := LoadAPI([]string{
		"HEDEFORA_API_LISTEN_ADDRESS=[::1]:9090",
		"HEDEFORA_API_READ_HEADER_TIMEOUT=2s",
		"HEDEFORA_API_READ_TIMEOUT=3s",
		"HEDEFORA_API_WRITE_TIMEOUT=4s",
		"HEDEFORA_API_IDLE_TIMEOUT=5s",
		"HEDEFORA_API_DRAIN_DELAY=600ms",
		"HEDEFORA_API_SHUTDOWN_TIMEOUT=6s",
		"HEDEFORA_API_RETRY_AFTER_SECONDS=7",
	})
	if err != nil {
		t.Fatalf("LoadAPI(overrides) error = %v", err)
	}
	want := API{
		ListenAddress:     "[::1]:9090",
		ReadHeaderTimeout: 2 * time.Second,
		ReadTimeout:       3 * time.Second,
		WriteTimeout:      4 * time.Second,
		IdleTimeout:       5 * time.Second,
		DrainDelay:        600 * time.Millisecond,
		ShutdownTimeout:   6 * time.Second,
		RetryAfterSeconds: 7,
		MaxHeaderBytes:    APIMaxHeaderBytes,
	}
	if configured != want {
		t.Fatalf("LoadAPI(overrides) = %#v, want %#v", configured, want)
	}
}

func TestValidateAPIRejectsDirectlyConstructedOutOfBoundsValues(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		mutate func(*API)
	}{
		{name: "read header low", mutate: func(value *API) { value.ReadHeaderTimeout = minimumReadHeaderTimeout - time.Nanosecond }},
		{name: "read header high", mutate: func(value *API) { value.ReadHeaderTimeout = maximumReadHeaderTimeout + time.Nanosecond }},
		{name: "read low", mutate: func(value *API) { value.ReadTimeout = minimumReadTimeout - time.Nanosecond }},
		{name: "read high", mutate: func(value *API) { value.ReadTimeout = maximumReadTimeout + time.Nanosecond }},
		{name: "write low", mutate: func(value *API) { value.WriteTimeout = minimumWriteTimeout - time.Nanosecond }},
		{name: "write high", mutate: func(value *API) { value.WriteTimeout = maximumWriteTimeout + time.Nanosecond }},
		{name: "idle low", mutate: func(value *API) { value.IdleTimeout = minimumIdleTimeout - time.Nanosecond }},
		{name: "idle high", mutate: func(value *API) { value.IdleTimeout = maximumIdleTimeout + time.Nanosecond }},
		{name: "drain low", mutate: func(value *API) { value.DrainDelay = minimumDrainDelay - time.Nanosecond }},
		{name: "drain high", mutate: func(value *API) { value.DrainDelay = maximumDrainDelay + time.Nanosecond }},
		{name: "shutdown low", mutate: func(value *API) { value.ShutdownTimeout = minimumShutdownTimeout - time.Nanosecond }},
		{name: "shutdown high", mutate: func(value *API) { value.ShutdownTimeout = maximumShutdownTimeout + time.Nanosecond }},
		{name: "retry low", mutate: func(value *API) { value.RetryAfterSeconds = 0 }},
		{name: "retry high", mutate: func(value *API) { value.RetryAfterSeconds = 61 }},
		{name: "headers", mutate: func(value *API) { value.MaxHeaderBytes++ }},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			value := DefaultAPI()
			test.mutate(&value)
			if err := ValidateAPI(value); !errors.Is(err, ErrInvalidAPIEnvironment) {
				t.Fatalf("ValidateAPI() error = %v", err)
			}
		})
	}
}

func TestLoadAPIRejectsUnknownDuplicateCaseDriftAndSecretValues(t *testing.T) {
	t.Parallel()

	const poison = "fixture-secret-token"
	cases := [][]string{
		{"HEDEFORA_API_UNKNOWN=value"},
		{"hedefora_api_read_timeout=1s"},
		{"HEDEFORA_API_READ_TIMEOUT=1s", "HEDEFORA_API_READ_TIMEOUT=2s"},
		{"HEDEFORA_API_READ_TIMEOUT"},
		{"HEDEFORA_API_LISTEN_ADDRESS=" + poison},
		{"HEDEFORA_API_RETRY_AFTER_SECONDS=+5"},
	}
	for _, environ := range cases {
		_, err := LoadAPI(environ)
		if !errors.Is(err, ErrInvalidAPIEnvironment) {
			t.Fatalf("LoadAPI(%q) error = %v", environ, err)
		}
		if strings.Contains(err.Error(), poison) {
			t.Fatalf("LoadAPI(%q) leaked poison", environ)
		}
	}
}

func TestLoadAPIRejectsInvalidBoundsAndAddress(t *testing.T) {
	t.Parallel()

	cases := []string{
		"HEDEFORA_API_LISTEN_ADDRESS=localhost:8080",
		"HEDEFORA_API_LISTEN_ADDRESS=127.0.0.1:0",
		"HEDEFORA_API_READ_HEADER_TIMEOUT=99ms",
		"HEDEFORA_API_READ_TIMEOUT=61s",
		"HEDEFORA_API_WRITE_TIMEOUT=0s",
		"HEDEFORA_API_IDLE_TIMEOUT=301s",
		"HEDEFORA_API_DRAIN_DELAY=61s",
		"HEDEFORA_API_SHUTDOWN_TIMEOUT=999ms",
		"HEDEFORA_API_RETRY_AFTER_SECONDS=61",
	}
	for _, entry := range cases {
		if _, err := LoadAPI([]string{entry}); !errors.Is(err, ErrInvalidAPIEnvironment) {
			t.Fatalf("LoadAPI(%q) error = %v", entry, err)
		}
	}
}

func TestLoadAPIRejectsInconsistentReadTimeouts(t *testing.T) {
	t.Parallel()

	_, err := LoadAPI([]string{
		"HEDEFORA_API_READ_HEADER_TIMEOUT=5s",
		"HEDEFORA_API_READ_TIMEOUT=1s",
	})
	if !errors.Is(err, ErrInvalidAPIEnvironment) {
		t.Fatalf("LoadAPI(inconsistent timeouts) error = %v", err)
	}
}
