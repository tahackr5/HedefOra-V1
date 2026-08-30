package main

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type testEntry struct {
	name    string
	content string
	mode    os.FileMode
	method  uint16
}

func TestValidateArchiveAcceptsValidZIP(t *testing.T) {
	t.Parallel()

	first := writeTestZIP(t, "first.zip", []testEntry{
		{name: "b/second.json", content: `{"id":2}`, method: zip.Deflate},
		{name: "a-first.json", content: `{"id":1}`, method: zip.Store},
	})
	second := writeTestZIP(t, "second.zip", []testEntry{
		{name: "a-first.json", content: `{"id":1}`, method: zip.Deflate},
		{name: "b/second.json", content: `{"id":2}`, method: zip.Store},
	})

	firstReport, err := validateArchive(first, productionLimits)
	if err != nil {
		t.Fatalf("validate first archive: %v", err)
	}
	secondReport, err := validateArchive(second, productionLimits)
	if err != nil {
		t.Fatalf("validate second archive: %v", err)
	}

	if firstReport.EntryCount != 2 {
		t.Fatalf("entry count = %d, want 2", firstReport.EntryCount)
	}
	if firstReport.UncompressedBytes != uint64(len(`{"id":1}`)+len(`{"id":2}`)) {
		t.Fatalf("uncompressed bytes = %d", firstReport.UncompressedBytes)
	}
	if len(firstReport.ManifestSHA256) != 64 {
		t.Fatalf("manifest hash length = %d, want 64", len(firstReport.ManifestSHA256))
	}
	if firstReport.ManifestSHA256 != secondReport.ManifestSHA256 {
		t.Fatalf("manifest changed with ZIP ordering or compression: %s != %s", firstReport.ManifestSHA256, secondReport.ManifestSHA256)
	}
}

func TestValidateArchiveRejectsCorruptedPayload(t *testing.T) {
	t.Parallel()

	archive := writeTestZIP(t, "corrupt.zip", []testEntry{{
		name:    "record.json",
		content: "unique-payload-for-crc-check",
		method:  zip.Store,
	}})
	raw, err := os.ReadFile(archive)
	if err != nil {
		t.Fatal(err)
	}
	payloadOffset := bytes.Index(raw, []byte("unique-payload-for-crc-check"))
	if payloadOffset < 0 {
		t.Fatal("payload not found in test ZIP")
	}
	raw[payloadOffset] ^= 0xff
	if err := os.WriteFile(archive, raw, 0o600); err != nil {
		t.Fatal(err)
	}

	assertValidationCode(t, archive, productionLimits, "entry_payload")
}

func TestValidateArchiveRejectsTruncatedZIP(t *testing.T) {
	t.Parallel()

	archive := writeTestZIP(t, "truncated.zip", []testEntry{{name: "record.json", content: "{}", method: zip.Deflate}})
	raw, err := os.ReadFile(archive)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(archive, raw[:len(raw)-10], 0o600); err != nil {
		t.Fatal(err)
	}

	assertValidationCode(t, archive, productionLimits, "central_directory")
}

func TestValidateArchiveRejectsUnsafePaths(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		path string
	}{
		{name: "traversal", path: "../escape.json"},
		{name: "absolute", path: "/absolute.json"},
		{name: "backslash", path: `nested\escape.json`},
		{name: "windows drive", path: "C:/escape.json"},
		{name: "non canonical", path: "nested//record.json"},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			archive := writeTestZIP(t, test.name+".zip", []testEntry{{name: test.path, content: "{}", method: zip.Store}})
			assertValidationCode(t, archive, productionLimits, "unsafe_entry_path")
		})
	}
}

func TestValidateArchiveRejectsDuplicatePath(t *testing.T) {
	t.Parallel()

	archive := writeTestZIP(t, "duplicate.zip", []testEntry{
		{name: "record.json", content: "first", method: zip.Store},
		{name: "record.json", content: "second", method: zip.Deflate},
	})
	assertValidationCode(t, archive, productionLimits, "duplicate_entry_path")
}

func TestValidateArchiveRejectsEmptyZIP(t *testing.T) {
	t.Parallel()

	archive := writeTestZIP(t, "empty.zip", nil)
	assertValidationCode(t, archive, productionLimits, "empty_archive")
}

func TestValidateArchiveRejectsNonRegularEntry(t *testing.T) {
	t.Parallel()

	archive := writeTestZIP(t, "symlink.zip", []testEntry{{
		name:    "link.json",
		content: "target.json",
		mode:    os.ModeSymlink | 0o777,
		method:  zip.Store,
	}})
	assertValidationCode(t, archive, productionLimits, "non_regular_entry")
}

func TestValidateArchiveEnforcesBounds(t *testing.T) {
	t.Parallel()

	archive := writeTestZIP(t, "bounds.zip", []testEntry{
		{name: "first.json", content: "1234", method: zip.Store},
		{name: "second.json", content: "56", method: zip.Store},
	})

	entryCountLimits := productionLimits
	entryCountLimits.MaxEntries = 1
	assertValidationCode(t, archive, entryCountLimits, "entry_count_limit")

	entrySizeLimits := productionLimits
	entrySizeLimits.MaxEntryUncompressedBytes = 3
	assertValidationCode(t, archive, entrySizeLimits, "entry_size_limit")

	archiveSizeLimits := productionLimits
	archiveSizeLimits.MaxArchiveUncompressedBytes = 5
	archiveSizeLimits.MaxEntryUncompressedBytes = 5
	assertValidationCode(t, archive, archiveSizeLimits, "archive_size_limit")
}

func TestRunRequiresAllArchivesAndEmitsSafeError(t *testing.T) {
	t.Parallel()

	valid := writeTestZIP(t, "valid.zip", []testEntry{{name: "record.json", content: "{}", method: zip.Store}})
	invalid := writeTestZIP(t, "secret-archive-name.zip", []testEntry{{name: "../secret-entry-name", content: "{}", method: zip.Store}})
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	exitCode := run([]string{valid, invalid}, &stdout, &stderr)
	if exitCode != exitValidationFailed {
		t.Fatalf("exit code = %d, want %d", exitCode, exitValidationFailed)
	}
	if stdout.Len() != 0 {
		t.Fatalf("partial JSON was emitted: %q", stdout.String())
	}
	if strings.Contains(stderr.String(), "secret-archive-name") || strings.Contains(stderr.String(), "secret-entry-name") {
		t.Fatalf("stderr exposed an untrusted path: %q", stderr.String())
	}
	if !strings.Contains(stderr.String(), "archive[1]") || !strings.Contains(stderr.String(), "unsafe_entry_path") {
		t.Fatalf("stderr lacks safe failure context: %q", stderr.String())
	}
}

func TestRunEmitsJSONOnlyAfterAllArchivesPass(t *testing.T) {
	t.Parallel()

	first := writeTestZIP(t, "one.zip", []testEntry{{name: "one.json", content: "1", method: zip.Store}})
	second := writeTestZIP(t, "two.zip", []testEntry{{name: "two.json", content: "22", method: zip.Deflate}})
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	if exitCode := run([]string{"--", first, second}, &stdout, &stderr); exitCode != exitSuccess {
		t.Fatalf("exit code = %d, stderr = %q", exitCode, stderr.String())
	}
	var report commandReport
	if err := json.Unmarshal(stdout.Bytes(), &report); err != nil {
		t.Fatalf("decode report: %v", err)
	}
	if report.SchemaVersion != 1 || len(report.Archives) != 2 {
		t.Fatalf("unexpected report: %+v", report)
	}
	for index, archive := range report.Archives {
		if archive.ArgumentIndex != index {
			t.Fatalf("archive %d argument index = %d", index, archive.ArgumentIndex)
		}
	}
	if stderr.Len() != 0 {
		t.Fatalf("unexpected stderr: %q", stderr.String())
	}
}

func TestRunWithoutArgumentsIsUsageFailure(t *testing.T) {
	t.Parallel()

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	if exitCode := run(nil, &stdout, &stderr); exitCode != exitUsage {
		t.Fatalf("exit code = %d, want %d", exitCode, exitUsage)
	}
	if stdout.Len() != 0 || stderr.Len() == 0 {
		t.Fatalf("stdout = %q, stderr = %q", stdout.String(), stderr.String())
	}
}

func writeTestZIP(t *testing.T, name string, entries []testEntry) string {
	t.Helper()

	archivePath := filepath.Join(t.TempDir(), name)
	file, err := os.OpenFile(archivePath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		t.Fatal(err)
	}
	writer := zip.NewWriter(file)
	for _, entry := range entries {
		header := &zip.FileHeader{Name: entry.name, Method: entry.method}
		mode := entry.mode
		if mode == 0 {
			mode = 0o600
		}
		header.SetMode(mode)
		entryWriter, err := writer.CreateHeader(header)
		if err != nil {
			_ = writer.Close()
			_ = file.Close()
			t.Fatal(err)
		}
		if _, err := io.WriteString(entryWriter, entry.content); err != nil {
			_ = writer.Close()
			_ = file.Close()
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		_ = file.Close()
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	return archivePath
}

func assertValidationCode(t *testing.T, archive string, limits validationLimits, want string) {
	t.Helper()

	_, err := validateArchive(archive, limits)
	if err == nil {
		t.Fatalf("validation succeeded, want %q", want)
	}
	if err.code != want {
		t.Fatalf("validation code = %q, want %q", err.code, want)
	}
}
