package telemetry

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"io"
	"log/slog"
	"sync/atomic"

	"github.com/tahackr5/HedefOra-V1/internal/generated/openapi"
)

var ErrRequestIDSeed = errors.New("request ID seed unavailable")

type RequestIDGenerator struct {
	key     [sha256.Size]byte
	counter atomic.Uint64
}

func NewRequestIDGenerator(random io.Reader) (*RequestIDGenerator, error) {
	if random == nil {
		return nil, ErrRequestIDSeed
	}
	generator := new(RequestIDGenerator)
	if _, err := io.ReadFull(random, generator.key[:]); err != nil {
		return nil, ErrRequestIDSeed
	}
	return generator, nil
}

func (generator *RequestIDGenerator) Next() openapi.RequestID {
	counter := generator.counter.Add(1)
	if counter == 0 {
		panic("request ID counter exhausted")
	}
	var message [8]byte
	binary.BigEndian.PutUint64(message[:], counter)
	digest := hmac.New(sha256.New, generator.key[:])
	_, _ = digest.Write(message[:])
	bytes := digest.Sum(nil)[:16]
	bytes[6] = (bytes[6] & 0x0f) | 0x40
	bytes[8] = (bytes[8] & 0x3f) | 0x80
	encoded := hex.EncodeToString(bytes)
	return openapi.RequestID(
		encoded[0:8] + "-" +
			encoded[8:12] + "-" +
			encoded[12:16] + "-" +
			encoded[16:20] + "-" +
			encoded[20:32],
	)
}

type requestIDContextKey struct{}

func ContextWithRequestID(ctx context.Context, requestID openapi.RequestID) context.Context {
	return context.WithValue(ctx, requestIDContextKey{}, requestID)
}

func RequestIDFromContext(ctx context.Context) (openapi.RequestID, bool) {
	requestID, ok := ctx.Value(requestIDContextKey{}).(openapi.RequestID)
	return requestID, ok && requestID != ""
}

func NewJSONLogger(output io.Writer) *slog.Logger {
	handler := slog.NewJSONHandler(output, &slog.HandlerOptions{
		Level: slog.LevelInfo,
		ReplaceAttr: func(_ []string, attribute slog.Attr) slog.Attr {
			switch attribute.Key {
			case slog.TimeKey:
				attribute.Key = "timestamp"
			case slog.LevelKey:
				attribute.Key = "severity"
			}
			return attribute
		},
	})
	return slog.New(handler).With(
		slog.String("service", "hedefora"),
		slog.String("process", "api"),
	)
}

type HTTPServerErrorWriter struct {
	logger *slog.Logger
}

func NewHTTPServerErrorWriter(logger *slog.Logger) *HTTPServerErrorWriter {
	return &HTTPServerErrorWriter{logger: logger}
}

func (writer *HTTPServerErrorWriter) Write(message []byte) (int, error) {
	writer.logger.Error(
		"HTTP server error",
		slog.String("event_code", "http_server_error"),
	)
	return len(message), nil
}
