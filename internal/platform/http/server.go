package httpapi

import (
	"errors"
	"log"
	"log/slog"
	"net/http"

	"github.com/tahackr5/HedefOra-V1/internal/platform/config"
	"github.com/tahackr5/HedefOra-V1/internal/platform/telemetry"
)

var ErrInvalidServerDependency = errors.New("invalid HTTP server dependency")

func NewServer(value config.API, handler http.Handler, logger *slog.Logger) (*http.Server, error) {
	if handler == nil || logger == nil || config.ValidateAPI(value) != nil {
		return nil, ErrInvalidServerDependency
	}
	return &http.Server{
		Addr:              value.ListenAddress,
		Handler:           handler,
		ReadHeaderTimeout: value.ReadHeaderTimeout,
		ReadTimeout:       value.ReadTimeout,
		WriteTimeout:      value.WriteTimeout,
		IdleTimeout:       value.IdleTimeout,
		MaxHeaderBytes:    value.MaxHeaderBytes,
		ErrorLog: log.New(
			telemetry.NewHTTPServerErrorWriter(logger),
			"",
			0,
		),
	}, nil
}
