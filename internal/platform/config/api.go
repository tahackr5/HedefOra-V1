package config

import (
	"errors"
	"net"
	"strconv"
	"strings"
	"time"
)

const (
	APIEnvironmentPrefix     = "HEDEFORA_API_"
	APIMaxHeaderBytes        = 64 << 10
	minimumReadHeaderTimeout = 100 * time.Millisecond
	maximumReadHeaderTimeout = 30 * time.Second
	minimumReadTimeout       = 100 * time.Millisecond
	maximumReadTimeout       = 60 * time.Second
	minimumWriteTimeout      = 100 * time.Millisecond
	maximumWriteTimeout      = 60 * time.Second
	minimumIdleTimeout       = time.Second
	maximumIdleTimeout       = 5 * time.Minute
	minimumDrainDelay        = 100 * time.Millisecond
	maximumDrainDelay        = 60 * time.Second
	minimumShutdownTimeout   = time.Second
	maximumShutdownTimeout   = 60 * time.Second
)

var ErrInvalidAPIEnvironment = errors.New("invalid API environment")

type API struct {
	ListenAddress     string
	ReadHeaderTimeout time.Duration
	ReadTimeout       time.Duration
	WriteTimeout      time.Duration
	IdleTimeout       time.Duration
	DrainDelay        time.Duration
	ShutdownTimeout   time.Duration
	RetryAfterSeconds int
	MaxHeaderBytes    int
}

func DefaultAPI() API {
	return API{
		ListenAddress:     "127.0.0.1:8080",
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
		DrainDelay:        2 * time.Second,
		ShutdownTimeout:   10 * time.Second,
		RetryAfterSeconds: 5,
		MaxHeaderBytes:    APIMaxHeaderBytes,
	}
}

func LoadAPI(environ []string) (API, error) {
	result := DefaultAPI()
	seen := make(map[string]struct{}, len(apiEnvironmentNames))
	for _, entry := range environ {
		name, value, hasValue := strings.Cut(entry, "=")
		if !hasAPIPrefix(name) {
			continue
		}
		if !hasValue || !strings.HasPrefix(name, APIEnvironmentPrefix) {
			return API{}, ErrInvalidAPIEnvironment
		}
		if _, allowed := apiEnvironmentNames[name]; !allowed {
			return API{}, ErrInvalidAPIEnvironment
		}
		if _, duplicate := seen[name]; duplicate {
			return API{}, ErrInvalidAPIEnvironment
		}
		seen[name] = struct{}{}
		if err := applyAPIEnvironment(&result, name, value); err != nil {
			return API{}, ErrInvalidAPIEnvironment
		}
	}
	if err := ValidateAPI(result); err != nil {
		return API{}, ErrInvalidAPIEnvironment
	}
	return result, nil
}

var apiEnvironmentNames = map[string]struct{}{
	"HEDEFORA_API_DRAIN_DELAY":         {},
	"HEDEFORA_API_IDLE_TIMEOUT":        {},
	"HEDEFORA_API_LISTEN_ADDRESS":      {},
	"HEDEFORA_API_READ_HEADER_TIMEOUT": {},
	"HEDEFORA_API_READ_TIMEOUT":        {},
	"HEDEFORA_API_RETRY_AFTER_SECONDS": {},
	"HEDEFORA_API_SHUTDOWN_TIMEOUT":    {},
	"HEDEFORA_API_WRITE_TIMEOUT":       {},
}

func hasAPIPrefix(name string) bool {
	return strings.HasPrefix(strings.ToUpper(name), APIEnvironmentPrefix)
}

func applyAPIEnvironment(result *API, name, value string) error {
	switch name {
	case "HEDEFORA_API_LISTEN_ADDRESS":
		result.ListenAddress = value
	case "HEDEFORA_API_READ_HEADER_TIMEOUT":
		result.ReadHeaderTimeout = duration(value, minimumReadHeaderTimeout, maximumReadHeaderTimeout)
	case "HEDEFORA_API_READ_TIMEOUT":
		result.ReadTimeout = duration(value, minimumReadTimeout, maximumReadTimeout)
	case "HEDEFORA_API_WRITE_TIMEOUT":
		result.WriteTimeout = duration(value, minimumWriteTimeout, maximumWriteTimeout)
	case "HEDEFORA_API_IDLE_TIMEOUT":
		result.IdleTimeout = duration(value, minimumIdleTimeout, maximumIdleTimeout)
	case "HEDEFORA_API_DRAIN_DELAY":
		result.DrainDelay = duration(value, minimumDrainDelay, maximumDrainDelay)
	case "HEDEFORA_API_SHUTDOWN_TIMEOUT":
		result.ShutdownTimeout = duration(value, minimumShutdownTimeout, maximumShutdownTimeout)
	case "HEDEFORA_API_RETRY_AFTER_SECONDS":
		result.RetryAfterSeconds = decimal(value, 1, 60)
	default:
		return ErrInvalidAPIEnvironment
	}
	return nil
}

func duration(value string, minimum, maximum time.Duration) time.Duration {
	parsed, err := time.ParseDuration(value)
	if err != nil || parsed < minimum || parsed > maximum {
		return 0
	}
	return parsed
}

func decimal(value string, minimum, maximum int) int {
	if value == "" {
		return 0
	}
	for _, character := range value {
		if character < '0' || character > '9' {
			return 0
		}
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed < minimum || parsed > maximum {
		return 0
	}
	return parsed
}

func ValidateAPI(value API) error {
	host, portText, err := net.SplitHostPort(value.ListenAddress)
	if err != nil || net.ParseIP(host) == nil {
		return ErrInvalidAPIEnvironment
	}
	port, err := strconv.Atoi(portText)
	if err != nil || port < 1 || port > 65535 {
		return ErrInvalidAPIEnvironment
	}
	if !durationWithin(value.ReadHeaderTimeout, minimumReadHeaderTimeout, maximumReadHeaderTimeout) ||
		!durationWithin(value.ReadTimeout, minimumReadTimeout, maximumReadTimeout) ||
		value.ReadTimeout < value.ReadHeaderTimeout {
		return ErrInvalidAPIEnvironment
	}
	if !durationWithin(value.WriteTimeout, minimumWriteTimeout, maximumWriteTimeout) ||
		!durationWithin(value.IdleTimeout, minimumIdleTimeout, maximumIdleTimeout) ||
		!durationWithin(value.DrainDelay, minimumDrainDelay, maximumDrainDelay) {
		return ErrInvalidAPIEnvironment
	}
	if !durationWithin(value.ShutdownTimeout, minimumShutdownTimeout, maximumShutdownTimeout) ||
		value.RetryAfterSeconds < 1 || value.RetryAfterSeconds > 60 {
		return ErrInvalidAPIEnvironment
	}
	if value.MaxHeaderBytes != APIMaxHeaderBytes {
		return ErrInvalidAPIEnvironment
	}
	return nil
}

func durationWithin(value, minimum, maximum time.Duration) bool {
	return value >= minimum && value <= maximum
}
