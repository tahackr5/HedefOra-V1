package config

import (
	"bytes"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"encoding/pem"
	"errors"
	"fmt"
	"log/slog"
	"math/big"
	"strings"
	"testing"
	"time"
)

func postgresTestCA(t *testing.T, isCA bool) string {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	cert := &x509.Certificate{SerialNumber: big.NewInt(1), IsCA: isCA,
		BasicConstraintsValid: true, KeyUsage: x509.KeyUsageCertSign,
		NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(time.Hour)}
	der, err := x509.CreateCertificate(rand.Reader, cert, cert, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}
	return string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}))
}

func validPostgres(t *testing.T) Postgres {
	t.Helper()
	c := DefaultPostgres()
	c.Host, c.User, c.Database = "db.example.test", "hedefora_app", "hedefora_dev"
	c.Password = "unit-fixture-password-' sslmode=disable ?%=/\\"
	c.RootCAPEM = postgresTestCA(t, true)
	return c
}

func postgresEnvironment(c Postgres) []string {
	return []string{
		"HEDEFORA_POSTGRES_HOST=" + c.Host,
		"HEDEFORA_POSTGRES_USER=" + c.User,
		"HEDEFORA_POSTGRES_DATABASE=" + c.Database,
		"HEDEFORA_POSTGRES_PASSWORD=" + c.Password,
		"HEDEFORA_POSTGRES_ROOT_CA_PEM=" + c.RootCAPEM,
	}
}

func TestPostgresExplicitDefaultsAndOverrides(t *testing.T) {
	t.Parallel()
	if _, err := LoadPostgres(nil); !errors.Is(err, ErrInvalidPostgresEnvironment) {
		t.Fatal("missing configuration accepted")
	}
	if err := ValidatePostgres(DefaultPostgres()); !errors.Is(err, ErrInvalidPostgresEnvironment) {
		t.Fatal("defaults accepted")
	}
	want := validPostgres(t)
	got, err := LoadPostgres(append(postgresEnvironment(want), "PATH=ignored", "HEDEFORA_API_READ_TIMEOUT=ignored"))
	if err != nil || got != want {
		t.Fatal("explicit config did not preserve values")
	}
	environ := append(postgresEnvironment(want), "HEDEFORA_POSTGRES_PORT=6543",
		"HEDEFORA_POSTGRES_CONNECT_TIMEOUT=100ms", "HEDEFORA_POSTGRES_ACQUIRE_TIMEOUT=5s",
		"HEDEFORA_POSTGRES_PROBE_TIMEOUT=300ms", "HEDEFORA_POSTGRES_CLOSE_TIMEOUT=10s",
		"HEDEFORA_POSTGRES_MAX_CONNECTIONS=8")
	got, err = LoadPostgres(environ)
	if err != nil || got.Port != 6543 || got.ConnectTimeout != 100*time.Millisecond ||
		got.AcquireTimeout != 5*time.Second || got.ProbeTimeout != 300*time.Millisecond ||
		got.CloseTimeout != 10*time.Second || got.MaxConnections != 8 {
		t.Fatal("valid overrides rejected")
	}
}

func TestPostgresRejectsAmbientDuplicateUnknownAndCaseDrift(t *testing.T) {
	t.Parallel()
	c := validPostgres(t)
	for _, entry := range []string{
		"PGHOST=", "PGSERVICE=fixture", "PGSERVICEFILE=fixture", "PGPASSFILE=fixture",
		"PGSSLCERT=fixture", "PGSSLROOTCERT=fixture", "PGSSLMODE=disable", "PGPASSWORD=fixture",
		"pguser=fixture", "PgUnknown=fixture", "PG", "PGUNKNOWN=fixture",
		"HEDEFORA_POSTGRES_HOST=duplicate", "HEDEFORA_POSTGRES_HOST", "hedefora_postgres_port=5432",
		"HEDEFORA_POSTGRES_port=5432", "HEDEFORA_POSTGRES_DSN=fixture",
		"HEDEFORA_POSTGRES_PORT=+5432", "HEDEFORA_POSTGRES_PORT=65536", "HEDEFORA_POSTGRES_PORT=0",
		"HEDEFORA_POSTGRES_CONNECT_TIMEOUT=99ms", "HEDEFORA_POSTGRES_ACQUIRE_TIMEOUT=5001ms",
		"HEDEFORA_POSTGRES_PROBE_TIMEOUT=invalid", "HEDEFORA_POSTGRES_CLOSE_TIMEOUT=999ms",
		"HEDEFORA_POSTGRES_CLOSE_TIMEOUT=11s", "HEDEFORA_POSTGRES_MAX_CONNECTIONS=9",
		"HEDEFORA_POSTGRES_MAX_CONNECTIONS=-1",
	} {
		t.Run(strings.SplitN(entry, "=", 2)[0]+fmt.Sprint(len(entry)), func(t *testing.T) {
			got, err := LoadPostgres(append(postgresEnvironment(c), entry))
			if !errors.Is(err, ErrInvalidPostgresEnvironment) || got != (Postgres{}) {
				t.Fatal("invalid entry accepted or partial config exposed")
			}
		})
	}
}

func TestPostgresNumericOverridesPreserveStrictBounds(t *testing.T) {
	t.Parallel()
	base := validPostgres(t)
	withPort := func(value uint16) Postgres { c := base; c.Port = value; return c }
	withConnections := func(value int32) Postgres { c := base; c.MaxConnections = value; return c }
	for _, field := range []struct {
		name     string
		accepted map[string]Postgres
		rejected []string
	}{
		{
			name: "PORT",
			accepted: map[string]Postgres{"1": withPort(1), "5432": withPort(5432), "65535": withPort(65535),
				"0005432": withPort(5432), strings.Repeat("0", 128) + "1": withPort(1)},
			rejected: []string{"0", "65536", "65537", "70968"},
		},
		{
			name: "MAX_CONNECTIONS",
			accepted: map[string]Postgres{"1": withConnections(1), "4": withConnections(4), "8": withConnections(8),
				"0008": withConnections(8), strings.Repeat("0", 128) + "1": withConnections(1)},
			rejected: []string{"0", "9", "2147483648", "4294967297", "4294967304"},
		},
	} {
		t.Run(field.name, func(t *testing.T) {
			for input, want := range field.accepted {
				got, err := LoadPostgres(append(postgresEnvironment(base), PostgresEnvironmentPrefix+field.name+"="+input))
				if err != nil || got != want {
					t.Fatalf("valid numeric form %q changed", input)
				}
			}
			invalid := append(field.rejected, "", "+1", "-1", " 1", "1 ", "1_0", "0x1", "1e0", "１", "\x00",
				"9223372036854775808", "18446744073709551616")
			for _, input := range invalid {
				got, err := LoadPostgres(append(postgresEnvironment(base), PostgresEnvironmentPrefix+field.name+"="+input))
				if !errors.Is(err, ErrInvalidPostgresEnvironment) || got != (Postgres{}) {
					t.Fatalf("invalid numeric form %q accepted or partial configuration exposed", input)
				}
			}
		})
	}
}

func TestPostgresDirectValidation(t *testing.T) {
	t.Parallel()
	base := validPostgres(t)
	for _, host := range []string{"127.0.0.1", "::1", "2001:db8::1", "db", "DB-1.example.test"} {
		c := base
		c.Host = host
		if err := ValidatePostgres(c); err != nil {
			t.Fatal("valid single host rejected")
		}
	}
	for _, host := range []string{"", "db:5432", "[::1]", "localhost,other", "/tmp", "C:\\socket", "postgres://db", "db user=postgres", "db\n", "db.", ".db", "-db", "db-", "db..test", "db_1", "é.test", strings.Repeat("a", 64) + ".test"} {
		c := base
		c.Host = host
		if err := ValidatePostgres(c); !errors.Is(err, ErrInvalidPostgresEnvironment) {
			t.Fatal("invalid host accepted")
		}
	}
	mutations := []func(*Postgres){
		func(c *Postgres) { c.User = "postgres" }, func(c *Postgres) { c.Database = "postgres" },
		func(c *Postgres) { c.Password = "" }, func(c *Postgres) { c.Password = "nul\x00fixture" },
		func(c *Postgres) { c.Password = string([]byte{0xff}) }, func(c *Postgres) { c.Password = strings.Repeat("x", 4097) },
		func(c *Postgres) { c.Port = 0 }, func(c *Postgres) { c.RootCAPEM = "" },
		func(c *Postgres) { c.ConnectTimeout = 99 * time.Millisecond }, func(c *Postgres) { c.ConnectTimeout = 5*time.Second + 1 },
		func(c *Postgres) { c.AcquireTimeout = 99 * time.Millisecond }, func(c *Postgres) { c.AcquireTimeout = 5*time.Second + 1 },
		func(c *Postgres) { c.ProbeTimeout = 99 * time.Millisecond }, func(c *Postgres) { c.ProbeTimeout = 5*time.Second + 1 },
		func(c *Postgres) { c.CloseTimeout = time.Second - 1 }, func(c *Postgres) { c.CloseTimeout = 10*time.Second + 1 },
		func(c *Postgres) { c.MaxConnections = 0 }, func(c *Postgres) { c.MaxConnections = 9 },
	}
	for i, mutate := range mutations {
		c := base
		mutate(&c)
		if err := ValidatePostgres(c); !errors.Is(err, ErrInvalidPostgresEnvironment) {
			t.Fatalf("mutation %d accepted", i)
		}
	}
}

func TestPostgresStrictCABundle(t *testing.T) {
	t.Parallel()
	c := validPostgres(t)
	valid := c.RootCAPEM
	for _, invalid := range []string{"fixture", "junk\n" + valid, valid + "junk", strings.Repeat("x", 65537),
		postgresTestCA(t, false), "-----BEGIN CERTIFICATE-----\n@@\n-----END CERTIFICATE-----\n",
		strings.Replace(valid, "CERTIFICATE", "PRIVATE KEY", 2),
		strings.Replace(valid, "-----BEGIN CERTIFICATE-----", "-----BEGIN CERTIFICATE-----\nComment: fixture\n", 1),
		"-----BEGIN CERTIFICATE-----\ninvalid\n" + valid,
	} {
		c.RootCAPEM = invalid
		if err := ValidatePostgres(c); !errors.Is(err, ErrInvalidPostgresEnvironment) {
			t.Fatal("invalid CA accepted")
		}
	}
	c.RootCAPEM = valid + "\n" + postgresTestCA(t, true)
	if err := ValidatePostgres(c); err != nil {
		t.Fatal("CA bundle rejected")
	}
}

func TestPostgresWholeValueRedaction(t *testing.T) {
	t.Parallel()
	c := validPostgres(t)
	for _, format := range []string{"%v", "%+v", "%#v", "%s", "%q", "%x", "%X", "%20.10v"} {
		for _, value := range []any{c, &c, []Postgres{c}, struct{ DB Postgres }{c}, map[string]any{"db": c}} {
			got := fmt.Sprintf(format, value)
			for _, poison := range []string{c.Host, c.Password, c.RootCAPEM, "BEGIN CERTIFICATE"} {
				if strings.Contains(got, poison) {
					t.Fatal("format leaked configuration")
				}
			}
		}
	}
	for _, jsonHandler := range []bool{false, true} {
		var output bytes.Buffer
		var handler slog.Handler = slog.NewTextHandler(&output, nil)
		if jsonHandler {
			handler = slog.NewJSONHandler(&output, nil)
		}
		slog.New(handler).Info("fixture", "db", c, "pointer", &c)
		if strings.Contains(output.String(), c.Password) || strings.Contains(output.String(), "CERTIFICATE") ||
			!strings.Contains(output.String(), "REDACTED") {
			t.Fatal("slog redaction failed")
		}
	}
}
