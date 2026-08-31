package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"mime"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/tahackr5/HedefOra-V1/internal/generated/openapi"
	"github.com/tahackr5/HedefOra-V1/internal/platform/telemetry"
)

const (
	maximumAcceptBytes   = 4 << 10
	maximumAcceptParts   = 32
	maximumAcceptMembers = 64
)

var (
	ErrInvalidHandlerDependency = errors.New("invalid HTTP handler dependency")
	errStrictHandler            = errors.New("strict handler failed")
)

type RequestIDSource interface {
	Next() openapi.RequestID
}

type handler struct {
	server     openapi.StrictServerInterface
	requestIDs RequestIDSource
	logger     *slog.Logger
}

func NewHandler(
	server openapi.StrictServerInterface,
	requestIDs RequestIDSource,
	logger *slog.Logger,
) (http.Handler, error) {
	if server == nil || requestIDs == nil || logger == nil {
		return nil, ErrInvalidHandlerDependency
	}
	return &handler{server: server, requestIDs: requestIDs, logger: logger}, nil
}

func (handler *handler) ServeHTTP(writer http.ResponseWriter, request *http.Request) {
	started := time.Now()
	requestID := handler.requestIDs.Next()
	status := http.StatusInternalServerError
	operation := "unmatched"
	writeFailed := false
	defer func() {
		requestOutcome := outcome(status)
		if writeFailed {
			requestOutcome = "write_error"
		}
		handler.logger.Info(
			"HTTP request completed",
			slog.String("event_code", "http_request_completed"),
			slog.String("request_id", string(requestID)),
			slog.String("operation", operation),
			slog.String("method_class", methodClass(request.Method)),
			slog.Int("status", status),
			slog.String("outcome", requestOutcome),
			slog.Int64("duration_ms", time.Since(started).Milliseconds()),
		)
	}()

	if !isExactHealthPath(request) {
		status, writeFailed = writeError(writer, http.StatusNotFound, openapi.ErrorCodeRouteNotFound, "İstenen kaynak bulunamadı.", requestID)
		return
	}
	operation = openapi.GetHealthLiveOperationID
	if request.Method != openapi.GetHealthLiveMethod {
		writer.Header().Set("Allow", openapi.GetHealthLiveMethod)
		status, writeFailed = writeError(writer, http.StatusMethodNotAllowed, openapi.ErrorCodeMethodNotAllowed, "Bu istek yöntemi desteklenmiyor.", requestID)
		return
	}
	if request.URL.RawQuery != "" || request.URL.ForceQuery || requestHasBody(request) {
		status, writeFailed = writeError(writer, http.StatusBadRequest, openapi.ErrorCodeInvalidRequest, "İstek işlenemedi.", requestID)
		return
	}

	acceptance := acceptsJSON(request.Header.Values("Accept"))
	if acceptance == acceptInvalid {
		status, writeFailed = writeError(writer, http.StatusBadRequest, openapi.ErrorCodeInvalidRequest, "İstek işlenemedi.", requestID)
		return
	}
	if acceptance == acceptRejected {
		status, writeFailed = writeError(writer, http.StatusNotAcceptable, openapi.ErrorCodeNotAcceptable, "İstenen yanıt biçimi desteklenmiyor.", requestID)
		return
	}

	ctx := telemetry.ContextWithRequestID(request.Context(), requestID)
	response, err := callStrictHandler(handler.server, ctx)
	if err != nil {
		status, writeFailed = writeError(writer, http.StatusInternalServerError, openapi.ErrorCodeInternalError, "İstek işlenirken bir sorun oluştu.", requestID)
		return
	}
	status, writeFailed = writeStrictResponse(writer, response, requestID)
}

func isExactHealthPath(request *http.Request) bool {
	if request == nil || request.URL == nil {
		return false
	}
	if request.URL.RawPath != "" && request.URL.RawPath != openapi.GetHealthLivePath {
		return false
	}
	return request.URL.Path == openapi.GetHealthLivePath &&
		request.URL.EscapedPath() == openapi.GetHealthLivePath
}

func requestHasBody(request *http.Request) bool {
	return request.ContentLength != 0 ||
		len(request.TransferEncoding) != 0 ||
		(request.Body != nil && request.Body != http.NoBody)
}

type acceptResult uint8

const (
	acceptAllowed acceptResult = iota
	acceptInvalid
	acceptRejected
)

func acceptsJSON(values []string) acceptResult {
	if len(values) == 0 {
		return acceptAllowed
	}
	joined := strings.Join(values, ",")
	if len(joined) == 0 || len(joined) > maximumAcceptBytes {
		return acceptInvalid
	}
	parts, ok := splitAccept(joined)
	if !ok || len(parts) == 0 || len(parts) > maximumAcceptParts {
		return acceptInvalid
	}
	bestSpecificity := -1
	bestQuality := -1
	for _, part := range parts {
		mediaType, parameters, err := mime.ParseMediaType(part)
		if err != nil {
			return acceptInvalid
		}
		specificity := jsonSpecificity(mediaType)
		if specificity < 0 {
			continue
		}
		quality := 1000
		if value, exists := parameters["q"]; exists {
			quality, ok = parseQuality(value)
			if !ok {
				return acceptInvalid
			}
			delete(parameters, "q")
		}
		if len(parameters) != 0 {
			return acceptInvalid
		}
		if specificity > bestSpecificity ||
			(specificity == bestSpecificity && quality > bestQuality) {
			bestSpecificity = specificity
			bestQuality = quality
		}
	}
	if bestSpecificity < 0 || bestQuality == 0 {
		return acceptRejected
	}
	return acceptAllowed
}

func splitAccept(value string) ([]string, bool) {
	parts := make([]string, 0, 4)
	start := 0
	members := 0
	inQuotes := false
	escaped := false
	for index := range len(value) {
		character := value[index]
		if (character < 0x20 && character != '\t') || character == 0x7f {
			return nil, false
		}
		if escaped {
			escaped = false
			continue
		}
		if inQuotes && character == '\\' {
			escaped = true
			continue
		}
		if character == '"' {
			inQuotes = !inQuotes
			continue
		}
		if character == ',' && !inQuotes {
			members++
			if members > maximumAcceptMembers {
				return nil, false
			}
			part := strings.Trim(value[start:index], " \t")
			if part != "" {
				parts = append(parts, part)
				if len(parts) > maximumAcceptParts {
					return nil, false
				}
			}
			start = index + 1
		}
	}
	if inQuotes || escaped {
		return nil, false
	}
	members++
	if members > maximumAcceptMembers {
		return nil, false
	}
	part := strings.Trim(value[start:], " \t")
	if part != "" {
		parts = append(parts, part)
	}
	return parts, true
}

func parseQuality(value string) (int, bool) {
	if value == "0" {
		return 0, true
	}
	if value == "1" {
		return 1000, true
	}
	integer, fraction, found := strings.Cut(value, ".")
	if !found || (integer != "0" && integer != "1") || len(fraction) < 1 || len(fraction) > 3 {
		return 0, false
	}
	quality := 0
	for _, digit := range fraction {
		if digit < '0' || digit > '9' {
			return 0, false
		}
		quality = quality*10 + int(digit-'0')
	}
	for range 3 - len(fraction) {
		quality *= 10
	}
	if integer == "1" {
		if quality != 0 {
			return 0, false
		}
		return 1000, true
	}
	return quality, true
}

func jsonSpecificity(mediaType string) int {
	switch strings.ToLower(mediaType) {
	case "application/json":
		return 2
	case "application/*":
		return 1
	case "*/*":
		return 0
	default:
		return -1
	}
}

func callStrictHandler(
	server openapi.StrictServerInterface,
	ctx context.Context,
) (response openapi.GetHealthLiveResponseObject, err error) {
	defer func() {
		if recover() != nil {
			response = nil
			err = errStrictHandler
		}
	}()
	response, err = server.GetHealthLive(ctx, openapi.GetHealthLiveRequestObject{})
	return response, err
}

func writeStrictResponse(
	writer http.ResponseWriter,
	response openapi.GetHealthLiveResponseObject,
	requestID openapi.RequestID,
) (int, bool) {
	switch typed := response.(type) {
	case openapi.GetHealthLive200JSONResponse:
		if typed.Body.Status != openapi.HealthLiveStatusLive {
			break
		}
		return writeJSON(writer, http.StatusOK, requestID, typed.Body)
	case *openapi.GetHealthLive200JSONResponse:
		if typed != nil && typed.Body.Status == openapi.HealthLiveStatusLive {
			return writeJSON(writer, http.StatusOK, requestID, typed.Body)
		}
	case openapi.GetHealthLive503JSONResponse:
		if validServiceUnavailable(typed.Body, requestID) {
			writer.Header().Set("Retry-After", strconv.Itoa(typed.Body.RetryAfterSeconds))
			return writeJSON(writer, http.StatusServiceUnavailable, requestID, typed.Body)
		}
	case *openapi.GetHealthLive503JSONResponse:
		if typed != nil && validServiceUnavailable(typed.Body, requestID) {
			writer.Header().Set("Retry-After", strconv.Itoa(typed.Body.RetryAfterSeconds))
			return writeJSON(writer, http.StatusServiceUnavailable, requestID, typed.Body)
		}
	}
	return writeError(writer, http.StatusInternalServerError, openapi.ErrorCodeInternalError, "İstek işlenirken bir sorun oluştu.", requestID)
}

func validServiceUnavailable(body openapi.ServiceUnavailableError, requestID openapi.RequestID) bool {
	return body.Code == openapi.ServiceUnavailableCodeValue &&
		body.RequestID == requestID &&
		body.Retryable &&
		body.Message != "" &&
		len(body.Message) <= 200 &&
		body.RetryAfterSeconds >= 1 &&
		body.RetryAfterSeconds <= 60
}

func writeError(
	writer http.ResponseWriter,
	status int,
	code openapi.ErrorCode,
	message string,
	requestID openapi.RequestID,
) (int, bool) {
	return writeJSON(writer, status, requestID, openapi.ErrorEnvelope{
		Code:      code,
		Message:   message,
		RequestID: requestID,
		Retryable: false,
	})
}

func writeJSON(writer http.ResponseWriter, status int, requestID openapi.RequestID, body any) (int, bool) {
	encoded, err := json.Marshal(body)
	if err != nil {
		encoded, _ = json.Marshal(openapi.ErrorEnvelope{
			Code:      openapi.ErrorCodeInternalError,
			Message:   "İstek işlenirken bir sorun oluştu.",
			RequestID: requestID,
			Retryable: false,
		})
		writer.Header().Del("Retry-After")
		status = http.StatusInternalServerError
	}
	headers := writer.Header()
	headers.Set("Cache-Control", "no-store")
	headers.Set("Content-Type", "application/json")
	headers.Set("Vary", "Accept")
	headers.Set("X-Content-Type-Options", "nosniff")
	headers.Set("X-Request-ID", string(requestID))
	writer.WriteHeader(status)
	payload := append(encoded, '\n')
	written, err := writer.Write(payload)
	return status, err != nil || written != len(payload)
}

func methodClass(method string) string {
	if method == http.MethodGet {
		return "get"
	}
	return "other"
}

func outcome(status int) string {
	switch {
	case status < 400:
		return "success"
	case status == http.StatusServiceUnavailable:
		return "unavailable"
	case status < 500:
		return "client_error"
	default:
		return "server_error"
	}
}
