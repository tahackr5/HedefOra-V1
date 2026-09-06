package config

import (
	"crypto/x509"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	PostgresEnvironmentPrefix = "HEDEFORA_POSTGRES_"
	postgresRedacted          = "[REDACTED PostgreSQL configuration]"
	postgresMaxCAPEMBytes     = 64 << 10
)

var ErrInvalidPostgresEnvironment = errors.New("invalid PostgreSQL environment")

// Postgres contains one explicit, certificate-verified application endpoint.
// Whole-value formatting is redacted; callers must never log individual fields.
type Postgres struct {
	Host           string
	Port           uint16
	Database       string
	User           string
	Password       string
	RootCAPEM      string
	ConnectTimeout time.Duration
	AcquireTimeout time.Duration
	ProbeTimeout   time.Duration
	CloseTimeout   time.Duration
	MaxConnections int32
}

func (Postgres) String() string                 { return postgresRedacted }
func (Postgres) GoString() string               { return postgresRedacted }
func (Postgres) Format(state fmt.State, _ rune) { _, _ = io.WriteString(state, postgresRedacted) }
func (Postgres) LogValue() slog.Value           { return slog.StringValue(postgresRedacted) }

// DefaultPostgres is deliberately invalid until the endpoint, identity, password
// and trust anchor are supplied. It never selects a local socket or OS identity.
func DefaultPostgres() Postgres {
	return Postgres{
		Port:           5432,
		ConnectTimeout: time.Second,
		AcquireTimeout: 500 * time.Millisecond,
		ProbeTimeout:   2 * time.Second,
		CloseTimeout:   5 * time.Second,
		MaxConnections: 4,
	}
}

func LoadPostgres(environ []string) (Postgres, error) {
	result := DefaultPostgres()
	seen := make(map[string]bool)
	for _, entry := range environ {
		name, value, hasValue := strings.Cut(entry, "=")
		upper := strings.ToUpper(name)
		// libpq-compatible ambient defaults, including empty values, are forbidden.
		if strings.HasPrefix(upper, "PG") {
			return Postgres{}, ErrInvalidPostgresEnvironment
		}
		if !strings.HasPrefix(upper, PostgresEnvironmentPrefix) {
			continue
		}
		if !hasValue || name != upper || seen[name] {
			return Postgres{}, ErrInvalidPostgresEnvironment
		}
		seen[name] = true
		switch name {
		case "HEDEFORA_POSTGRES_HOST":
			result.Host = value
		case "HEDEFORA_POSTGRES_PORT":
			result.Port = uint16(decimal(value, 1, 65535))
		case "HEDEFORA_POSTGRES_DATABASE":
			result.Database = value
		case "HEDEFORA_POSTGRES_USER":
			result.User = value
		case "HEDEFORA_POSTGRES_PASSWORD":
			result.Password = value
		case "HEDEFORA_POSTGRES_ROOT_CA_PEM":
			result.RootCAPEM = value
		case "HEDEFORA_POSTGRES_CONNECT_TIMEOUT":
			result.ConnectTimeout = duration(value, 100*time.Millisecond, 5*time.Second)
		case "HEDEFORA_POSTGRES_ACQUIRE_TIMEOUT":
			result.AcquireTimeout = duration(value, 100*time.Millisecond, 5*time.Second)
		case "HEDEFORA_POSTGRES_PROBE_TIMEOUT":
			result.ProbeTimeout = duration(value, 100*time.Millisecond, 5*time.Second)
		case "HEDEFORA_POSTGRES_CLOSE_TIMEOUT":
			result.CloseTimeout = duration(value, time.Second, 10*time.Second)
		case "HEDEFORA_POSTGRES_MAX_CONNECTIONS":
			result.MaxConnections = int32(decimal(value, 1, 8))
		default:
			return Postgres{}, ErrInvalidPostgresEnvironment
		}
	}
	if err := ValidatePostgres(result); err != nil {
		return Postgres{}, err
	}
	return result, nil
}

func ValidatePostgres(value Postgres) error {
	if !postgresHostValid(value.Host) || value.Port == 0 ||
		value.Database != "hedefora_dev" || value.User != "hedefora_app" ||
		value.Password == "" || len(value.Password) > 4096 ||
		!utf8.ValidString(value.Password) || strings.ContainsRune(value.Password, 0) ||
		!postgresCAValid(value.RootCAPEM) ||
		!durationWithin(value.ConnectTimeout, 100*time.Millisecond, 5*time.Second) ||
		!durationWithin(value.AcquireTimeout, 100*time.Millisecond, 5*time.Second) ||
		!durationWithin(value.ProbeTimeout, 100*time.Millisecond, 5*time.Second) ||
		!durationWithin(value.CloseTimeout, time.Second, 10*time.Second) ||
		value.MaxConnections < 1 || value.MaxConnections > 8 {
		return ErrInvalidPostgresEnvironment
	}
	return nil
}

func postgresHostValid(host string) bool {
	if host == "" || len(host) > 253 {
		return false
	}
	if net.ParseIP(host) != nil {
		return true
	}
	// ASCII DNS labels only: no DSN, host:port, socket, multi-host or URL syntax.
	for _, label := range strings.Split(host, ".") {
		if len(label) == 0 || len(label) > 63 || label[0] == '-' || label[len(label)-1] == '-' {
			return false
		}
		for _, c := range label {
			if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '-') {
				return false
			}
		}
	}
	return true
}

func postgresCAValid(value string) bool {
	if len(value) == 0 || len(value) > postgresMaxCAPEMBytes {
		return false
	}
	rest := []byte(strings.TrimSpace(value))
	count := 0
	for len(rest) != 0 {
		// pem.Decode otherwise silently discards arbitrary preceding text.
		if !strings.HasPrefix(string(rest), "-----BEGIN CERTIFICATE-----") {
			return false
		}
		end := strings.Index(string(rest), "-----END CERTIFICATE-----")
		if end < 0 || strings.Count(string(rest[:end]), "-----BEGIN ") != 1 {
			return false
		}
		end += len("-----END CERTIFICATE-----")
		block, tail := pem.Decode(rest[:end])
		if block == nil || block.Type != "CERTIFICATE" || len(block.Headers) != 0 || len(tail) != 0 {
			return false
		}
		cert, err := x509.ParseCertificate(block.Bytes)
		if err != nil || !cert.BasicConstraintsValid || !cert.IsCA ||
			(cert.KeyUsage != 0 && cert.KeyUsage&x509.KeyUsageCertSign == 0) {
			return false
		}
		count++
		rest = []byte(strings.TrimSpace(string(rest[end:])))
	}
	return count > 0
}
