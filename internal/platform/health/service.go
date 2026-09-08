package health

import (
	"context"
	"errors"
	"reflect"
	"sync/atomic"
	"time"

	"github.com/tahackr5/HedefOra-V1/internal/generated/openapi"
	"github.com/tahackr5/HedefOra-V1/internal/platform/telemetry"
)

const serviceUnavailableMessage = "Hizmet geçici olarak kullanılamıyor. Lütfen yeniden deneyin."

var (
	ErrInvalidRetryAfter = errors.New("invalid retry-after value")
	ErrMissingRequestID  = errors.New("request ID is missing from context")
	ErrInvalidReadiness  = errors.New("invalid readiness dependency or timeout")
)

// Readiness checks dependency availability without exposing provider details.
// Implementations must honor cancellation and must not retain the context.
type Readiness interface {
	Check(context.Context) error
}

type Service struct {
	draining          atomic.Bool
	retryAfterSeconds int
	readiness         Readiness
	readinessTimeout  time.Duration
	drainContext      context.Context
	cancelProbes      context.CancelFunc
}

var _ openapi.StrictServerInterface = (*Service)(nil)

func NewService(retryAfterSeconds int, readiness Readiness, timeout time.Duration) (*Service, error) {
	if retryAfterSeconds < 1 || retryAfterSeconds > 60 {
		return nil, ErrInvalidRetryAfter
	}
	if readiness == nil || isNilReadiness(readiness) || timeout <= 0 || timeout > 5*time.Second {
		return nil, ErrInvalidReadiness
	}
	drainContext, cancelProbes := context.WithCancel(context.Background())
	return &Service{
		retryAfterSeconds: retryAfterSeconds,
		readiness:         readiness,
		readinessTimeout:  timeout,
		drainContext:      drainContext,
		cancelProbes:      cancelProbes,
	}, nil
}

func isNilReadiness(readiness Readiness) bool {
	value := reflect.ValueOf(readiness)
	switch value.Kind() {
	case reflect.Chan, reflect.Func, reflect.Interface, reflect.Map, reflect.Pointer, reflect.Slice:
		return value.IsNil()
	default:
		return false
	}
}

func (service *Service) BeginDrain() bool {
	if !service.draining.CompareAndSwap(false, true) {
		return false
	}
	service.cancelProbes()
	return true
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
			Body: service.unavailable(requestID),
		}, nil
	}
	return openapi.GetHealthLive200JSONResponse{
		Body: openapi.HealthLiveResponse{Status: openapi.HealthLiveStatusLive},
	}, nil
}

func (service *Service) GetHealthReady(
	ctx context.Context,
	_ openapi.GetHealthReadyRequestObject,
) (openapi.GetHealthReadyResponseObject, error) {
	requestID, ok := telemetry.RequestIDFromContext(ctx)
	if !ok {
		return nil, ErrMissingRequestID
	}
	unavailable := openapi.GetHealthReady503JSONResponse{Body: service.unavailable(requestID)}
	if service.draining.Load() || ctx.Err() != nil {
		return unavailable, nil
	}
	probeContext, cancel := context.WithTimeout(ctx, service.readinessTimeout)
	defer cancel()
	stopDrainCancellation := context.AfterFunc(service.drainContext, cancel)
	defer stopDrainCancellation()
	if service.draining.Load() || probeContext.Err() != nil {
		return unavailable, nil
	}
	err := service.readiness.Check(probeContext)
	// A probe completing after cancellation or drain cannot restore readiness.
	if err != nil || probeContext.Err() != nil || ctx.Err() != nil || service.draining.Load() {
		return unavailable, nil
	}
	return openapi.GetHealthReady200JSONResponse{
		Body: openapi.HealthReadyResponse{Status: openapi.HealthReadyStatusReady},
	}, nil
}

func (service *Service) unavailable(requestID openapi.RequestID) openapi.ServiceUnavailableError {
	return openapi.ServiceUnavailableError{
		Code:              openapi.ServiceUnavailableCodeValue,
		Message:           serviceUnavailableMessage,
		RequestID:         requestID,
		Retryable:         true,
		RetryAfterSeconds: service.retryAfterSeconds,
	}
}
