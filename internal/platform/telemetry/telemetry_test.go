package telemetry

import (
	"bytes"
	"context"
	"errors"
	"regexp"
	"strings"
	"sync"
	"testing"

	"github.com/tahackr5/HedefOra-V1/internal/generated/openapi"
)

func TestRequestIDGeneratorProducesUniqueUUIDv4ValuesConcurrently(t *testing.T) {
	t.Parallel()

	generator, err := NewRequestIDGenerator(bytes.NewReader(bytes.Repeat([]byte{0x5a}, 32)))
	if err != nil {
		t.Fatalf("NewRequestIDGenerator() error = %v", err)
	}
	pattern := regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
	const count = 256
	values := make(chan openapi.RequestID, count)
	var group sync.WaitGroup
	for range count {
		group.Add(1)
		go func() {
			defer group.Done()
			values <- generator.Next()
		}()
	}
	group.Wait()
	close(values)

	unique := make(map[openapi.RequestID]struct{}, count)
	for value := range values {
		if !pattern.MatchString(string(value)) {
			t.Fatalf("Next() = %q", value)
		}
		if _, duplicate := unique[value]; duplicate {
			t.Fatalf("Next() duplicate = %q", value)
		}
		unique[value] = struct{}{}
	}
}

func TestRequestIDGeneratorDerivesValuesFromStartupEntropy(t *testing.T) {
	t.Parallel()

	first, err := NewRequestIDGenerator(bytes.NewReader(bytes.Repeat([]byte{0x11}, 32)))
	if err != nil {
		t.Fatalf("NewRequestIDGenerator(first) error = %v", err)
	}
	second, err := NewRequestIDGenerator(bytes.NewReader(bytes.Repeat([]byte{0x22}, 32)))
	if err != nil {
		t.Fatalf("NewRequestIDGenerator(second) error = %v", err)
	}
	if first.Next() == second.Next() {
		t.Fatal("distinct startup entropy produced the same first request ID")
	}
}

func TestRequestIDGeneratorFailsBeforeServingWithoutSeed(t *testing.T) {
	t.Parallel()

	for _, reader := range []interface{ Read([]byte) (int, error) }{
		bytes.NewReader(nil),
		errorReader{},
	} {
		if _, err := NewRequestIDGenerator(reader); !errors.Is(err, ErrRequestIDSeed) {
			t.Fatalf("NewRequestIDGenerator() error = %v", err)
		}
	}
}

func TestRequestIDContextRoundTrip(t *testing.T) {
	t.Parallel()

	const requestID openapi.RequestID = "7d444840-9dc0-4bb4-9f1d-6a20c3ce090a"
	if _, ok := RequestIDFromContext(context.Background()); ok {
		t.Fatal("RequestIDFromContext(background) unexpectedly succeeded")
	}
	actual, ok := RequestIDFromContext(ContextWithRequestID(context.Background(), requestID))
	if !ok || actual != requestID {
		t.Fatalf("RequestIDFromContext() = %q, %v", actual, ok)
	}
}

func TestJSONLoggerAndHTTPServerWriterDoNotCopyRawErrorBytes(t *testing.T) {
	t.Parallel()

	var output bytes.Buffer
	logger := NewJSONLogger(&output)
	const poison = "fixture-authorization-secret"
	writer := NewHTTPServerErrorWriter(logger)
	if count, err := writer.Write([]byte(poison)); err != nil || count != len(poison) {
		t.Fatalf("Write() = %d, %v", count, err)
	}
	logged := output.String()
	for _, expected := range []string{
		`"timestamp"`,
		`"severity":"ERROR"`,
		`"service":"hedefora"`,
		`"process":"api"`,
		`"event_code":"http_server_error"`,
	} {
		if !strings.Contains(logged, expected) {
			t.Fatalf("log missing %q: %s", expected, logged)
		}
	}
	if strings.Contains(logged, poison) {
		t.Fatalf("log leaked raw server error: %s", logged)
	}
}

type errorReader struct{}

func (errorReader) Read([]byte) (int, error) {
	return 0, errors.New("fixture entropy detail")
}
