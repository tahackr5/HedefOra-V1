package health

import (
	"context"
	"errors"
	"sync/atomic"

	"github.com/tahackr5/HedefOra-V1/internal/generated/openapi"
	"github.com/tahackr5/HedefOra-V1/internal/platform/telemetry"
)

const serviceUnavailableMessage = "Hizmet geçici olarak kullanılamıyor. Lütfen yeniden deneyin."

var (
	ErrInvalidRetryAfter = errors.New("invalid retry-after value")
	ErrMissingRequestID  = errors.New("request ID is missing from context")
)

type Service struct {
	draining          atomic.Bool
	retryAfterSeconds int
}

var _ openapi.StrictServerInterface = (*Service)(nil)

func NewService(retryAfterSeconds int) (*Service, error) {
	if retryAfterSeconds < 1 || retryAfterSeconds > 60 {
		return nil, ErrInvalidRetryAfter
	}
	return &Service{retryAfterSeconds: retryAfterSeconds}, nil
}

func (service *Service) BeginDrain() bool {
	return service.draining.CompareAndSwap(false, true)
}

func (service *Service) IsDraining() bool {
	return service.draining.Load()
}

func (service *Service) GetHealthLive(
	ctx context.Context,
	_ openapi.GetHealthLiveRequestObject,
) (openapi.GetHealthLiveResponseObject, error) {
	requestID, ok := telemetry.RequestIDFromContext(ctx)
	if !ok {
		return nil, ErrMissingRequestID
	}
	if service.draining.Load() {
		return openapi.GetHealthLive503JSONResponse{
			Body: openapi.ServiceUnavailableError{
				Code:              openapi.ServiceUnavailableCodeValue,
				Message:           serviceUnavailableMessage,
				RequestID:         requestID,
				Retryable:         true,
				RetryAfterSeconds: service.retryAfterSeconds,
			},
		}, nil
	}
	return openapi.GetHealthLive200JSONResponse{
		Body: openapi.HealthLiveResponse{Status: openapi.HealthLiveStatusLive},
	}, nil
}
