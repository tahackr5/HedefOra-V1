// tlsfixture creates only ephemeral, synthetic TLS material for the admitted
// PG17 integration runner. It does not start a service or grant image admission.
package main

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"errors"
	"flag"
	"fmt"
	"math/big"
	"net"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

var errFixture = errors.New("invalid temporary TLS fixture request")

func main() {
	flags := flag.NewFlagSet("tlsfixture", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	output := flags.String("output-dir", "", "new absolute directory beneath the private temporary root")
	if flags.Parse(os.Args[1:]) != nil || flags.NArg() != 0 {
		os.Exit(2)
	}
	if err := generate(*output); err != nil {
		// Never echo key material, environment values or low-level filesystem errors.
		fmt.Fprintln(os.Stderr, "TLS_FIXTURE_GENERATION_FAILED")
		os.Exit(1)
	}
}

func generate(output string) error {
	if runtime.GOOS != "linux" || !filepath.IsAbs(output) || filepath.Clean(output) != output {
		return errFixture
	}
	relative, err := filepath.Rel(os.TempDir(), output)
	if err != nil || relative == "." || relative == ".." || strings.HasPrefix(relative, ".."+string(os.PathSeparator)) {
		return errFixture
	}
	// Reject pre-existing output and symbolic links throughout the parent chain.
	// The caller must supply a fresh path inside its private disposable temp root.
	parent, err := os.Lstat(filepath.Dir(output))
	if err != nil || !parent.IsDir() || parent.Mode().Perm() != 0700 {
		return errFixture
	}
	for current := filepath.Dir(output); ; current = filepath.Dir(current) {
		info, err := os.Lstat(current)
		if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
			return errFixture
		}
		if next := filepath.Dir(current); next == current {
			break
		}
	}
	if _, err := os.Lstat(output); !errors.Is(err, os.ErrNotExist) {
		return errFixture
	}
	now := time.Now().UTC()
	ca, caKey, caDER, err := authority(now)
	if err != nil {
		return err
	}
	_, _, wrongCA, err := authority(now)
	if err != nil {
		return err
	}
	serverDER, serverKey, err := server(now, ca, caKey, false)
	if err != nil {
		return err
	}
	mismatchDER, mismatchKey, err := server(now, ca, caKey, true)
	if err != nil {
		return err
	}
	files := []struct {
		name string
		data []byte
	}{
		{"ca.crt", pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: caDER})},
		{"wrong-ca.crt", pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: wrongCA})},
		{"server.crt", pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: serverDER})},
		{"server.key", pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: serverKey})},
		{"server-wrong-host.crt", pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: mismatchDER})},
		{"server-wrong-host.key", pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: mismatchKey})},
	}
	if err := os.Mkdir(output, 0700); err != nil {
		return err
	}
	root, err := os.OpenRoot(output)
	if err != nil {
		return err
	}
	defer root.Close()
	info, err := root.Stat(".")
	if err != nil || !info.IsDir() || info.Mode().Perm() != 0700 {
		return errFixture
	}
	names := make([]string, 0, len(files))
	for _, item := range files {
		file, err := root.OpenFile(item.name, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
		if err != nil {
			return err
		}
		_, writeErr := file.Write(item.data)
		syncErr := file.Sync()
		closeErr := file.Close()
		if writeErr != nil || syncErr != nil || closeErr != nil {
			return errFixture
		}
		info, err := root.Lstat(item.name)
		if err != nil || !info.Mode().IsRegular() || info.Mode().Perm() != 0600 {
			return errFixture
		}
		names = append(names, item.name)
	}
	// No private CA key is persisted. Stdout contains paths/expiry only.
	return json.NewEncoder(os.Stdout).Encode(struct {
		Directory string   `json:"directory"`
		Files     []string `json:"files"`
		ExpiresAt string   `json:"expires_at"`
	}{output, names, now.Add(time.Hour).Format(time.RFC3339)})
}

func serial() (*big.Int, error) {
	value, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return nil, err
	}
	if value.Sign() == 0 {
		value.SetInt64(1)
	}
	return value, nil
}

func authority(now time.Time) (*x509.Certificate, *ecdsa.PrivateKey, []byte, error) {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, nil, nil, err
	}
	number, err := serial()
	if err != nil {
		return nil, nil, nil, err
	}
	certificate := &x509.Certificate{
		SerialNumber: number, IsCA: true, BasicConstraintsValid: true,
		KeyUsage: x509.KeyUsageCertSign, MaxPathLen: 0, MaxPathLenZero: true,
		NotBefore: now.Add(-time.Minute), NotAfter: now.Add(time.Hour),
	}
	der, err := x509.CreateCertificate(rand.Reader, certificate, certificate, &key.PublicKey, key)
	return certificate, key, der, err
}

func server(now time.Time, ca *x509.Certificate, caKey *ecdsa.PrivateKey, mismatch bool) ([]byte, []byte, error) {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, nil, err
	}
	number, err := serial()
	if err != nil {
		return nil, nil, err
	}
	certificate := &x509.Certificate{
		SerialNumber: number, NotBefore: now.Add(-time.Minute), NotAfter: now.Add(time.Hour),
		BasicConstraintsValid: true, KeyUsage: x509.KeyUsageDigitalSignature,
		ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		DNSNames:    []string{"localhost"}, IPAddresses: []net.IP{net.ParseIP("127.0.0.1")},
	}
	if mismatch {
		certificate.DNSNames = []string{"mismatch.hedefora.invalid"}
		certificate.IPAddresses = nil
	}
	der, err := x509.CreateCertificate(rand.Reader, certificate, ca, &key.PublicKey, caKey)
	if err != nil {
		return nil, nil, err
	}
	privateDER, err := x509.MarshalPKCS8PrivateKey(key)
	return der, privateDER, err
}
