package health

import (
	"context"
	"errors"
	"sync"
	"testing"

	"github.com/tahackr5/HedefOra-V1/internal/generated/openapi"
	"github.com/tahackr5/HedefOra-V1/internal/platform/telemetry"
)

const testRequestID openapi.RequestID = "7d444840-9dc0-4bb4-9f1d-6a20c3ce090a"

func TestServiceServingAndDrainingResponses(t *testing.T) {
	t.Parallel()

	service, err := NewService(7)
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}
	ctx := telemetry.ContextWithRequestID(context.Background(), testRequestID)
	response, err := service.GetHealthLive(ctx, openapi.GetHealthLiveRequestObject{})
	if err != nil {
		t.Fatalf("GetHealthLive(serving) error = %v", err)
	}
	live, ok := response.(openapi.GetHealthLive200JSONResponse)
	if !ok || live.Body.Status != openapi.HealthLiveStatusLive {
		t.Fatalf("GetHealthLive(serving) = %#v", response)
	}
	if !service.BeginDrain() || service.BeginDrain() || !service.IsDraining() {
		t.Fatal("BeginDrain() is not a one-way idempotent transition")
	}
	response, err = service.GetHealthLive(ctx, openapi.GetHealthLiveRequestObject{})
	if err != nil {
		t.Fatalf("GetHealthLive(draining) error = %v", err)
	}
	draining, ok := response.(openapi.GetHealthLive503JSONResponse)
	if !ok {
		t.Fatalf("GetHealthLive(draining) = %#v", response)
	}
	if draining.Body.Code != openapi.ServiceUnavailableCodeValue ||
		!draining.Body.Retryable ||
		draining.Body.RequestID != testRequestID ||
		draining.Body.RetryAfterSeconds != 7 {
		t.Fatalf("GetHealthLive(draining) body = %#v", draining.Body)
	}
}

func TestServiceRejectsInvalidConstructionAndMissingRequestID(t *testing.T) {
	t.Parallel()

	for _, retryAfter := range []int{0, 61} {
		if _, err := NewService(retryAfter); !errors.Is(err, ErrInvalidRetryAfter) {
			t.Fatalf("NewService(%d) error = %v", retryAfter, err)
		}
	}
	service, _ := NewService(5)
	if _, err := service.GetHealthLive(context.Background(), openapi.GetHealthLiveRequestObject{}); !errors.Is(err, ErrMissingRequestID) {
		t.Fatalf("GetHealthLive(missing request ID) error = %v", err)
	}
}

func TestServiceConcurrentReadAndDrain(t *testing.T) {
	t.Parallel()

	service, _ := NewService(5)
	ctx := telemetry.ContextWithRequestID(context.Background(), testRequestID)
	var group sync.WaitGroup
	for range 128 {
		group.Add(1)
		go func() {
			defer group.Done()
			response, err := service.GetHealthLive(ctx, openapi.GetHealthLiveRequestObject{})
			if err != nil {
				t.Errorf("GetHealthLive() error = %v", err)
				return
			}
			switch response.(type) {
			case openapi.GetHealthLive200JSONResponse, openapi.GetHealthLive503JSONResponse:
			default:
				t.Errorf("GetHealthLive() = %#v", response)
			}
		}()
	}
	service.BeginDrain()
	group.Wait()
}
