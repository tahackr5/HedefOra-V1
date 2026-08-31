package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/tahackr5/HedefOra-V1/internal/generated/openapi"
	"github.com/tahackr5/HedefOra-V1/internal/platform/health"
	"github.com/tahackr5/HedefOra-V1/internal/platform/telemetry"
)

const handlerRequestID openapi.RequestID = "7d444840-9dc0-4bb4-9f1d-6a20c3ce090a"

func TestHandlerServesExactGeneratedLiveResponse(t *testing.T) {
	t.Parallel()

	service, _ := health.NewService(5)
	handler, logs := newTestHandler(t, service)
	request := httptest.NewRequest(http.MethodGet, "http://example.test/health/live", nil)
	const poison = "fixture-spoofed-request-secret"
	request.Header.Set("X-Request-ID", poison)
	request.Header.Set("Authorization", "Bearer "+poison)
	request.Header.Set("Cookie", "session="+poison)
	request.Header.Set("User-Agent", poison)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	assertResponseHeaders(t, response, http.StatusOK)
	if response.Header().Get("X-Request-ID") != string(handlerRequestID) {
		t.Fatalf("X-Request-ID = %q", response.Header().Get("X-Request-ID"))
	}
	var body openapi.HealthLiveResponse
	decodeJSON(t, response.Body.Bytes(), &body)
	if body.Status != openapi.HealthLiveStatusLive {
		t.Fatalf("body = %#v", body)
	}
	if strings.Contains(logs.String(), poison) {
		t.Fatalf("logs leaked inbound request metadata: %s", logs.String())
	}
	assertRequestLog(t, logs, http.StatusOK, "success", openapi.GetHealthLiveOperationID, "get")
}

func TestHandlerRejectsMethodPathQueryAndBodyVariants(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		method      string
		target      string
		body        io.Reader
		status      int
		code        openapi.ErrorCode
		allowHeader string
	}{
		{name: "head", method: http.MethodHead, target: "/health/live", status: 405, code: openapi.ErrorCodeMethodNotAllowed, allowHeader: "GET"},
		{name: "post", method: http.MethodPost, target: "/health/live", status: 405, code: openapi.ErrorCodeMethodNotAllowed, allowHeader: "GET"},
		{name: "options", method: http.MethodOptions, target: "/health/live", status: 405, code: openapi.ErrorCodeMethodNotAllowed, allowHeader: "GET"},
		{name: "trailing slash", method: http.MethodGet, target: "/health/live/", status: 404, code: openapi.ErrorCodeRouteNotFound},
		{name: "case drift", method: http.MethodGet, target: "/Health/live", status: 404, code: openapi.ErrorCodeRouteNotFound},
		{name: "double slash", method: http.MethodGet, target: "/health//live", status: 404, code: openapi.ErrorCodeRouteNotFound},
		{name: "dot segment", method: http.MethodGet, target: "/health/./live", status: 404, code: openapi.ErrorCodeRouteNotFound},
		{name: "encoded alias", method: http.MethodGet, target: "/health/%6cive", status: 404, code: openapi.ErrorCodeRouteNotFound},
		{name: "backslash", method: http.MethodGet, target: "/health%5Clive", status: 404, code: openapi.ErrorCodeRouteNotFound},
		{name: "suffix", method: http.MethodGet, target: "/health/live.json", status: 404, code: openapi.ErrorCodeRouteNotFound},
		{name: "query", method: http.MethodGet, target: "/health/live?probe=1", status: 400, code: openapi.ErrorCodeInvalidRequest},
		{name: "force query", method: http.MethodGet, target: "/health/live?", status: 400, code: openapi.ErrorCodeInvalidRequest},
		{name: "body", method: http.MethodGet, target: "/health/live", body: strings.NewReader("fixture-body"), status: 400, code: openapi.ErrorCodeInvalidRequest},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			strict := &strictStub{response: liveResponse()}
			handler, _ := newTestHandler(t, strict)
			request := httptest.NewRequest(test.method, "http://example.test"+test.target, test.body)
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			assertErrorResponse(t, response, test.status, test.code)
			if response.Header().Get("Allow") != test.allowHeader {
				t.Fatalf("Allow = %q, want %q", response.Header().Get("Allow"), test.allowHeader)
			}
			if strict.calls.Load() != 0 {
				t.Fatalf("strict calls = %d", strict.calls.Load())
			}
		})
	}
}

func TestHandlerAcceptNegotiation(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		accept *string
		status int
		code   openapi.ErrorCode
	}{
		{name: "absent", status: 200},
		{name: "json", accept: text("application/json"), status: 200},
		{name: "application wildcard", accept: text("application/*"), status: 200},
		{name: "global wildcard", accept: text("*/*"), status: 200},
		{name: "list", accept: text("text/plain, application/json;q=0.5"), status: 200},
		{name: "quoted comma extension", accept: text(`text/plain; note="a,b", application/json`), status: 200},
		{name: "bounded empty members", accept: text(", application/json,,"), status: 200},
		{name: "horizontal tab OWS", accept: text("\tapplication/json\t"), status: 200},
		{name: "specific veto", accept: text("application/json;q=0, */*;q=1"), status: 406, code: openapi.ErrorCodeNotAcceptable},
		{name: "specific veto with extension", accept: text("application/json;q=0;foo=bar, */*;q=1"), status: 400, code: openapi.ErrorCodeInvalidRequest},
		{name: "nonmatching", accept: text("application/problem+json"), status: 406, code: openapi.ErrorCodeNotAcceptable},
		{name: "empty", accept: text(""), status: 400, code: openapi.ErrorCodeInvalidRequest},
		{name: "bad q", accept: text("application/json;q=1.1"), status: 400, code: openapi.ErrorCodeInvalidRequest},
		{name: "too precise q", accept: text("application/json;q=0.1234"), status: 400, code: openapi.ErrorCodeInvalidRequest},
		{name: "duplicate q", accept: text("application/json;q=1;q=0"), status: 400, code: openapi.ErrorCodeInvalidRequest},
		{name: "too many list members", accept: text(strings.Repeat(",", maximumAcceptMembers) + "application/json"), status: 400, code: openapi.ErrorCodeInvalidRequest},
		{name: "unclosed quote", accept: text(`application/json; note="fixture`), status: 400, code: openapi.ErrorCodeInvalidRequest},
		{name: "oversized", accept: text(strings.Repeat("a", maximumAcceptBytes+1)), status: 400, code: openapi.ErrorCodeInvalidRequest},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			strict := &strictStub{response: liveResponse()}
			handler, _ := newTestHandler(t, strict)
			request := httptest.NewRequest(http.MethodGet, "http://example.test/health/live", nil)
			if test.accept != nil {
				request.Header.Set("Accept", *test.accept)
			}
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if test.status == http.StatusOK {
				assertResponseHeaders(t, response, test.status)
				if strict.calls.Load() != 1 {
					t.Fatalf("strict calls = %d", strict.calls.Load())
				}
				return
			}
			assertErrorResponse(t, response, test.status, test.code)
			if strict.calls.Load() != 0 {
				t.Fatalf("strict calls = %d", strict.calls.Load())
			}
		})
	}
}

func TestHandlerServesExactDrainingResponse(t *testing.T) {
	t.Parallel()

	service, _ := health.NewService(7)
	service.BeginDrain()
	handler, _ := newTestHandler(t, service)
	request := httptest.NewRequest(http.MethodGet, "http://example.test/health/live", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	assertResponseHeaders(t, response, http.StatusServiceUnavailable)
	if response.Header().Get("Retry-After") != "7" {
		t.Fatalf("Retry-After = %q", response.Header().Get("Retry-After"))
	}
	var body openapi.ServiceUnavailableError
	decodeJSON(t, response.Body.Bytes(), &body)
	if body.Code != openapi.ServiceUnavailableCodeValue || !body.Retryable ||
		body.RequestID != handlerRequestID || body.RetryAfterSeconds != 7 {
		t.Fatalf("body = %#v", body)
	}
}

func TestHandlerLogsStructuredOutcomeClasses(t *testing.T) {
	t.Parallel()

	draining, _ := health.NewService(5)
	draining.BeginDrain()
	tests := []struct {
		name        string
		strict      openapi.StrictServerInterface
		method      string
		status      int
		outcome     string
		methodClass string
	}{
		{name: "success", strict: &strictStub{response: liveResponse()}, method: http.MethodGet, status: 200, outcome: "success", methodClass: "get"},
		{name: "client error", strict: &strictStub{response: liveResponse()}, method: http.MethodPost, status: 405, outcome: "client_error", methodClass: "other"},
		{name: "unavailable", strict: draining, method: http.MethodGet, status: 503, outcome: "unavailable", methodClass: "get"},
		{name: "server error", strict: &strictStub{err: errors.New("fixture-safe")}, method: http.MethodGet, status: 500, outcome: "server_error", methodClass: "get"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			handler, logs := newTestHandler(t, test.strict)
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, httptest.NewRequest(test.method, "http://example.test/health/live", nil))
			if response.Code != test.status {
				t.Fatalf("status = %d, want %d", response.Code, test.status)
			}
			assertRequestLog(t, logs, test.status, test.outcome, openapi.GetHealthLiveOperationID, test.methodClass)
		})
	}
}

func TestHandlerMapsStrictFailuresWithoutLeakingDetails(t *testing.T) {
	t.Parallel()

	const poison = "fixture-internal-provider-secret"
	tests := []struct {
		name   string
		strict *strictStub
	}{
		{name: "error", strict: &strictStub{err: errors.New(poison)}},
		{name: "nil response", strict: &strictStub{}},
		{name: "panic", strict: &strictStub{panicValue: poison}},
		{name: "invalid 200", strict: &strictStub{response: openapi.GetHealthLive200JSONResponse{}}},
		{name: "invalid 503", strict: &strictStub{response: openapi.GetHealthLive503JSONResponse{}}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			handler, logs := newTestHandler(t, test.strict)
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "http://example.test/health/live", nil))
			assertErrorResponse(t, response, http.StatusInternalServerError, openapi.ErrorCodeInternalError)
			if strings.Contains(response.Body.String(), poison) || strings.Contains(logs.String(), poison) {
				t.Fatalf("strict detail leaked: response=%s log=%s", response.Body.String(), logs.String())
			}
		})
	}
}

func TestHandlerRecordsSanitizedResponseWriteFailure(t *testing.T) {
	t.Parallel()

	const poison = "fixture-response-writer-secret"
	strict := &strictStub{response: liveResponse()}
	handler, logs := newTestHandler(t, strict)
	writer := &failingResponseWriter{writeError: errors.New(poison)}
	handler.ServeHTTP(writer, httptest.NewRequest(http.MethodGet, "http://example.test/health/live", nil))

	if writer.status != http.StatusOK {
		t.Fatalf("status = %d, want %d", writer.status, http.StatusOK)
	}
	if !strings.Contains(logs.String(), `"outcome":"write_error"`) {
		t.Fatalf("logs missing write_error outcome: %s", logs.String())
	}
	if strings.Contains(logs.String(), poison) {
		t.Fatalf("logs leaked response writer detail: %s", logs.String())
	}
	assertRequestLog(t, logs, http.StatusOK, "write_error", openapi.GetHealthLiveOperationID, "get")
}

func TestNewHandlerRejectsMissingDependencies(t *testing.T) {
	t.Parallel()

	strict := &strictStub{response: liveResponse()}
	logger := telemetry.NewJSONLogger(io.Discard)
	for _, build := range []func() (http.Handler, error){
		func() (http.Handler, error) { return NewHandler(nil, fixedRequestIDs{}, logger) },
		func() (http.Handler, error) { return NewHandler(strict, nil, logger) },
		func() (http.Handler, error) { return NewHandler(strict, fixedRequestIDs{}, nil) },
	} {
		if _, err := build(); !errors.Is(err, ErrInvalidHandlerDependency) {
			t.Fatalf("NewHandler() error = %v", err)
		}
	}
}

func newTestHandler(t *testing.T, strict openapi.StrictServerInterface) (http.Handler, *bytes.Buffer) {
	t.Helper()
	logs := new(bytes.Buffer)
	handler, err := NewHandler(strict, fixedRequestIDs{}, telemetry.NewJSONLogger(logs))
	if err != nil {
		t.Fatalf("NewHandler() error = %v", err)
	}
	return handler, logs
}

func assertResponseHeaders(t *testing.T, response *httptest.ResponseRecorder, status int) {
	t.Helper()
	if response.Code != status {
		t.Fatalf("status = %d, want %d; body=%s", response.Code, status, response.Body.String())
	}
	for name, expected := range map[string]string{
		"Cache-Control":          "no-store",
		"Content-Type":           "application/json",
		"Vary":                   "Accept",
		"X-Content-Type-Options": "nosniff",
		"X-Request-ID":           string(handlerRequestID),
	} {
		if actual := response.Header().Get(name); actual != expected {
			t.Fatalf("%s = %q, want %q", name, actual, expected)
		}
	}
}

func assertErrorResponse(t *testing.T, response *httptest.ResponseRecorder, status int, code openapi.ErrorCode) {
	t.Helper()
	assertResponseHeaders(t, response, status)
	var body openapi.ErrorEnvelope
	decodeJSON(t, response.Body.Bytes(), &body)
	if body.Code != code || body.RequestID != handlerRequestID || body.Message == "" || body.Retryable || body.RetryAfterSeconds != nil {
		t.Fatalf("error body = %#v", body)
	}
}

func decodeJSON(t *testing.T, document []byte, destination any) {
	t.Helper()
	decoder := json.NewDecoder(bytes.NewReader(document))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		t.Fatalf("Decode() error = %v; document=%s", err, document)
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		t.Fatalf("Decode() trailing value error = %v; document=%s", err, document)
	}
}

func assertRequestLog(
	t *testing.T,
	logs *bytes.Buffer,
	status int,
	expectedOutcome string,
	operation string,
	methodClass string,
) {
	t.Helper()
	var entry map[string]any
	decodeJSON(t, logs.Bytes(), &entry)
	for name, expected := range map[string]any{
		"event_code":   "http_request_completed",
		"request_id":   string(handlerRequestID),
		"operation":    operation,
		"method_class": methodClass,
		"status":       float64(status),
		"outcome":      expectedOutcome,
		"service":      "hedefora",
		"process":      "api",
	} {
		if actual := entry[name]; actual != expected {
			t.Fatalf("log %s = %#v, want %#v; log=%s", name, actual, expected, logs.String())
		}
	}
	duration, ok := entry["duration_ms"].(float64)
	if !ok || duration < 0 {
		t.Fatalf("log duration_ms = %#v; log=%s", entry["duration_ms"], logs.String())
	}
	if timestamp, ok := entry["timestamp"].(string); !ok || timestamp == "" {
		t.Fatalf("log timestamp = %#v; log=%s", entry["timestamp"], logs.String())
	}
}

func text(value string) *string {
	return &value
}

func liveResponse() openapi.GetHealthLiveResponseObject {
	return openapi.GetHealthLive200JSONResponse{
		Body: openapi.HealthLiveResponse{Status: openapi.HealthLiveStatusLive},
	}
}

type fixedRequestIDs struct{}

func (fixedRequestIDs) Next() openapi.RequestID {
	return handlerRequestID
}

type strictStub struct {
	calls      atomic.Int32
	response   openapi.GetHealthLiveResponseObject
	err        error
	panicValue any
}

type failingResponseWriter struct {
	header     http.Header
	status     int
	writeError error
}

func (writer *failingResponseWriter) Header() http.Header {
	if writer.header == nil {
		writer.header = make(http.Header)
	}
	return writer.header
}

func (writer *failingResponseWriter) WriteHeader(status int) {
	writer.status = status
}

func (writer *failingResponseWriter) Write([]byte) (int, error) {
	return 0, writer.writeError
}

func (stub *strictStub) GetHealthLive(context.Context, openapi.GetHealthLiveRequestObject) (openapi.GetHealthLiveResponseObject, error) {
	stub.calls.Add(1)
	if stub.panicValue != nil {
		panic(stub.panicValue)
	}
	return stub.response, stub.err
}
