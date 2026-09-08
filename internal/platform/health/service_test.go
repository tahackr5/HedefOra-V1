package health

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/tahackr5/HedefOra-V1/internal/generated/openapi"
	"github.com/tahackr5/HedefOra-V1/internal/platform/telemetry"
)

const testRequestID openapi.RequestID = "7d444840-9dc0-4bb4-9f1d-6a20c3ce090a"

func TestServiceServingAndDrainingResponses(t *testing.T) {
	t.Parallel()

	service, err := NewService(7, readinessFunc(func(context.Context) error { return nil }), time.Second)
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
		if _, err := NewService(retryAfter, readinessFunc(func(context.Context) error { return nil }), time.Second); !errors.Is(err, ErrInvalidRetryAfter) {
			t.Fatalf("NewService(%d) error = %v", retryAfter, err)
		}
	}
	service, _ := NewService(5, readinessFunc(func(context.Context) error { return nil }), time.Second)
	if _, err := service.GetHealthLive(context.Background(), openapi.GetHealthLiveRequestObject{}); !errors.Is(err, ErrMissingRequestID) {
		t.Fatalf("GetHealthLive(missing request ID) error = %v", err)
	}
}

func TestServiceConcurrentReadAndDrain(t *testing.T) {
	t.Parallel()

	service, _ := NewService(5, readinessFunc(func(context.Context) error { return nil }), time.Second)
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

type readinessFunc func(context.Context) error

func (probe readinessFunc) Check(ctx context.Context) error { return probe(ctx) }

func TestReadinessRejectsMissingDependencyAndInvalidTimeout(t *testing.T) {
	t.Parallel()
	var typedNil readinessFunc
	for _, probe := range []Readiness{nil, typedNil} {
		if _, err := NewService(5, probe, time.Second); !errors.Is(err, ErrInvalidReadiness) {
			t.Fatalf("NewService(nil readiness) error = %v", err)
		}
	}
	for _, timeout := range []time.Duration{0, -time.Second, 5*time.Second + time.Nanosecond} {
		if _, err := NewService(5, readinessFunc(func(context.Context) error { return nil }), timeout); !errors.Is(err, ErrInvalidReadiness) {
			t.Fatalf("NewService(timeout) error = %v", err)
		}
	}
	service, _ := NewService(5, readinessFunc(func(context.Context) error { t.Fatal("probe called without request ID"); return nil }), time.Second)
	if _, err := service.GetHealthReady(context.Background(), openapi.GetHealthReadyRequestObject{}); !errors.Is(err, ErrMissingRequestID) {
		t.Fatalf("GetHealthReady(missing request ID) error = %v", err)
	}
}

func TestReadinessChecksEachRequestAndLivenessIsIndependent(t *testing.T) {
	t.Parallel()
	var calls atomic.Int32
	service, _ := NewService(7, readinessFunc(func(ctx context.Context) error {
		deadline, ok := ctx.Deadline()
		if !ok || time.Until(deadline) > time.Second {
			t.Error("probe has no bounded deadline")
		}
		if calls.Add(1) == 1 {
			return errors.New("fixture-database-password-host-query")
		}
		return nil
	}), time.Second)
	ctx := telemetry.ContextWithRequestID(context.Background(), testRequestID)
	if calls.Load() != 0 {
		t.Fatal("construction must not perform a readiness probe")
	}
	live, err := service.GetHealthLive(ctx, openapi.GetHealthLiveRequestObject{})
	if _, ok := live.(openapi.GetHealthLive200JSONResponse); err != nil || !ok || calls.Load() != 0 {
		t.Fatalf("liveness called readiness or failed: %v", err)
	}
	first, err := service.GetHealthReady(ctx, openapi.GetHealthReadyRequestObject{})
	if err != nil {
		t.Fatal(err)
	}
	assertUnavailable(t, first, 7)
	second, err := service.GetHealthReady(ctx, openapi.GetHealthReadyRequestObject{})
	ready, ok := second.(openapi.GetHealthReady200JSONResponse)
	if err != nil || !ok || ready.Body.Status != openapi.HealthReadyStatusReady || calls.Load() != 2 {
		t.Fatalf("recovery readiness = %#v, calls=%d, error=%v", second, calls.Load(), err)
	}
}

func TestReadinessDoesNotStartAfterCancellationOrDrain(t *testing.T) {
	t.Parallel()
	for _, drain := range []bool{false, true} {
		service, _ := NewService(5, readinessFunc(func(context.Context) error { t.Error("probe called"); return nil }), time.Second)
		ctx, cancel := context.WithCancel(telemetry.ContextWithRequestID(context.Background(), testRequestID))
		if drain {
			service.BeginDrain()
		} else {
			cancel()
		}
		response, err := service.GetHealthReady(ctx, openapi.GetHealthReadyRequestObject{})
		cancel()
		if err != nil {
			t.Fatal(err)
		}
		assertUnavailable(t, response, 5)
	}
}

func TestReadinessRechecksCancellationTimeoutAndDrainAfterProbe(t *testing.T) {
	t.Parallel()
	for _, reason := range []string{"cancel", "timeout", "drain"} {
		t.Run(reason, func(t *testing.T) {
			t.Parallel()
			started := make(chan struct{})
			ctx, cancel := context.WithCancel(telemetry.ContextWithRequestID(context.Background(), testRequestID))
			defer cancel()
			service, _ := NewService(5, readinessFunc(func(ctx context.Context) error {
				close(started)
				<-ctx.Done()
				return nil // Deliberately late success must be rejected by the caller.
			}), 100*time.Millisecond)
			result := make(chan openapi.GetHealthReadyResponseObject, 1)
			go func() {
				response, err := service.GetHealthReady(ctx, openapi.GetHealthReadyRequestObject{})
				if err != nil {
					t.Error(err)
				}
				result <- response
			}()
			select {
			case <-started:
			case <-time.After(time.Second):
				t.Fatal("probe did not start")
			}
			switch reason {
			case "cancel":
				cancel()
			case "drain":
				service.BeginDrain()
			}
			select {
			case response := <-result:
				assertUnavailable(t, response, 5)
			case <-time.After(time.Second):
				t.Fatal("probe cancellation did not finish within budget")
			}
		})
	}
}

func TestReadinessConcurrentDrainNeverReturnsLateSuccess(t *testing.T) {
	t.Parallel()
	var started sync.WaitGroup
	started.Add(64)
	service, _ := NewService(5, readinessFunc(func(ctx context.Context) error {
		started.Done()
		<-ctx.Done()
		return nil
	}), time.Second)
	ctx := telemetry.ContextWithRequestID(context.Background(), testRequestID)
	var finished sync.WaitGroup
	for range 64 {
		finished.Go(func() {
			response, err := service.GetHealthReady(ctx, openapi.GetHealthReadyRequestObject{})
			if err != nil {
				t.Error(err)
				return
			}
			assertUnavailable(t, response, 5)
		})
	}
	started.Wait()
	service.BeginDrain()
	finished.Wait()
}

func assertUnavailable(t *testing.T, response openapi.GetHealthReadyResponseObject, retry int) {
	t.Helper()
	unavailable, ok := response.(openapi.GetHealthReady503JSONResponse)
	if !ok || unavailable.Body.Code != openapi.ServiceUnavailableCodeValue ||
		unavailable.Body.Message != serviceUnavailableMessage || unavailable.Body.RequestID != testRequestID ||
		!unavailable.Body.Retryable || unavailable.Body.RetryAfterSeconds != retry {
		t.Fatalf("unavailable response = %#v", response)
	}
}
