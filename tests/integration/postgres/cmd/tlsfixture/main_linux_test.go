package main

import (
	"bytes"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/x509"
	"encoding/pem"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func readFixture(t *testing.T, directory, name, kind string) []byte {
	t.Helper()
	file := filepath.Join(directory, name)
	info, err := os.Lstat(file)
	if err != nil || !info.Mode().IsRegular() || info.Mode().Perm() != 0600 {
		t.Fatal("fixture file must be private and regular")
	}
	data, err := os.ReadFile(file)
	if err != nil {
		t.Fatal("fixture read failed")
	}
	block, rest := pem.Decode(data)
	if block == nil || block.Type != kind || len(bytes.TrimSpace(rest)) != 0 {
		t.Fatal("fixture PEM must contain exactly one expected block")
	}
	return block.Bytes
}

func TestGeneratePrivateBoundedTLSFixtures(t *testing.T) {
	parent := t.TempDir()
	if err := os.Chmod(parent, 0700); err != nil {
		t.Fatal(err)
	}
	directory := filepath.Join(parent, "tls")
	started := time.Now()
	if err := generate(directory); err != nil {
		t.Fatal("valid private fixture rejected")
	}
	info, err := os.Stat(directory)
	if err != nil || info.Mode().Perm() != 0700 {
		t.Fatal("fixture directory must be private")
	}
	entries, err := os.ReadDir(directory)
	if err != nil || len(entries) != 6 {
		t.Fatal("unexpected fixture inventory")
	}
	ca, err := x509.ParseCertificate(readFixture(t, directory, "ca.crt", "CERTIFICATE"))
	if err != nil || !ca.IsCA || ca.KeyUsage != x509.KeyUsageCertSign || !ca.MaxPathLenZero {
		t.Fatal("invalid root authority constraints")
	}
	if ca.Subject.CommonName == "" || len(ca.SubjectKeyId) == 0 || !bytes.Equal(ca.RawIssuer, ca.RawSubject) {
		t.Fatal("root authority must have a nonempty issuer identity and key identifier")
	}
	wrongCA, err := x509.ParseCertificate(readFixture(t, directory, "wrong-ca.crt", "CERTIFICATE"))
	if err != nil || bytes.Equal(ca.Raw, wrongCA.Raw) {
		t.Fatal("wrong CA must be independent")
	}
	if ca.Subject.CommonName == wrongCA.Subject.CommonName || bytes.Equal(ca.SubjectKeyId, wrongCA.SubjectKeyId) {
		t.Fatal("independent authorities must have distinct names and key identifiers")
	}
	roots, wrongRoots := x509.NewCertPool(), x509.NewCertPool()
	roots.AddCert(ca)
	wrongRoots.AddCert(wrongCA)
	for _, item := range []struct{ certificate, key, hostname string }{
		{"server.crt", "server.key", "127.0.0.1"},
		{"server-wrong-host.crt", "server-wrong-host.key", "mismatch.hedefora.invalid"},
	} {
		leaf, err := x509.ParseCertificate(readFixture(t, directory, item.certificate, "CERTIFICATE"))
		if err != nil {
			t.Fatal("invalid leaf")
		}
		if !bytes.Equal(leaf.RawIssuer, ca.RawSubject) || !bytes.Equal(leaf.AuthorityKeyId, ca.SubjectKeyId) {
			t.Fatal("leaf issuer and authority key identifier must bind the actual root")
		}
		if leaf.NotAfter.Before(started.Add(59*time.Minute)) || leaf.NotAfter.After(time.Now().Add(61*time.Minute)) ||
			leaf.NotBefore.After(started) || leaf.NotBefore.Before(started.Add(-2*time.Minute)) ||
			leaf.KeyUsage != x509.KeyUsageDigitalSignature || len(leaf.ExtKeyUsage) != 1 || leaf.ExtKeyUsage[0] != x509.ExtKeyUsageServerAuth {
			t.Fatal("leaf lifetime or usage exceeded the fixture contract")
		}
		if _, err := leaf.Verify(x509.VerifyOptions{Roots: roots, DNSName: item.hostname}); err != nil {
			t.Fatal("verified leaf chain failed")
		}
		if _, err := leaf.Verify(x509.VerifyOptions{Roots: wrongRoots, DNSName: item.hostname}); err == nil {
			t.Fatal("wrong authority accepted")
		}
		if item.certificate == "server.crt" {
			if leaf.VerifyHostname("localhost") != nil || leaf.VerifyHostname("mismatch.hedefora.invalid") == nil {
				t.Fatal("positive SAN boundary failed")
			}
		} else if leaf.VerifyHostname("127.0.0.1") == nil {
			t.Fatal("wrong-host leaf matched endpoint")
		}
		key, err := x509.ParsePKCS8PrivateKey(readFixture(t, directory, item.key, "PRIVATE KEY"))
		if err != nil {
			t.Fatal("invalid fixture key")
		}
		private, ok := key.(*ecdsa.PrivateKey)
		if !ok || private.Curve != elliptic.P256() || !private.PublicKey.Equal(leaf.PublicKey) {
			t.Fatal("key/leaf mismatch")
		}
	}
	before := readFixture(t, directory, "server.key", "PRIVATE KEY")
	if generate(directory) == nil {
		t.Fatal("existing output accepted")
	}
	if !bytes.Equal(before, readFixture(t, directory, "server.key", "PRIVATE KEY")) {
		t.Fatal("existing fixture changed")
	}
}

func TestGenerateRejectsUnsafeTemporaryPaths(t *testing.T) {
	parent := t.TempDir()
	if err := os.Chmod(parent, 0700); err != nil {
		t.Fatal(err)
	}
	for _, output := range []string{"", "relative", "/var/hedefora-unowned-fixture", parent, parent + "/../escape"} {
		if generate(output) == nil {
			t.Fatal("invalid output accepted")
		}
	}
	openParent := filepath.Join(parent, "open")
	if err := os.Mkdir(openParent, 0755); err != nil {
		t.Fatal(err)
	}
	if generate(filepath.Join(openParent, "tls")) == nil {
		t.Fatal("non-private parent accepted")
	}
	link := filepath.Join(parent, "linked")
	if err := os.Symlink(parent, link); err != nil {
		t.Fatal(err)
	}
	if generate(filepath.Join(link, "tls")) == nil {
		t.Fatal("symbolic parent accepted")
	}
	for _, output := range []string{filepath.Join(parent, "tls"), filepath.Join(openParent, "tls")} {
		if _, err := os.Lstat(output); !os.IsNotExist(err) {
			t.Fatal("rejected path created an output")
		}
	}
}
