package main

import (
	"archive/zip"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path"
	"sort"
	"strings"
	"unicode/utf8"
)

const (
	exitSuccess          = 0
	exitValidationFailed = 1
	exitUsage            = 2

	manifestDomain = "HedefOra osvdbcheck manifest v1\x00"
)

// productionLimits bound all work performed on an untrusted advisory database.
var productionLimits = validationLimits{
	MaxEntries:                  300_000,
	MaxEntryPathBytes:           4 << 10,
	MaxEntryUncompressedBytes:   128 << 20,
	MaxArchiveUncompressedBytes: 8 << 30,
}

type validationLimits struct {
	MaxEntries                  uint64 `json:"max_entries"`
	MaxEntryPathBytes           uint64 `json:"max_entry_path_bytes"`
	MaxEntryUncompressedBytes   uint64 `json:"max_entry_uncompressed_bytes"`
	MaxArchiveUncompressedBytes uint64 `json:"max_archive_uncompressed_bytes"`
}

type commandReport struct {
	SchemaVersion int              `json:"schema_version"`
	Limits        validationLimits `json:"limits"`
	Archives      []archiveReport  `json:"archives"`
}

type archiveReport struct {
	ArgumentIndex     int    `json:"argument_index"`
	EntryCount        uint64 `json:"entry_count"`
	UncompressedBytes uint64 `json:"uncompressed_bytes"`
	ManifestSHA256    string `json:"manifest_sha256"`
}

type validationError struct {
	code string
}

func (e *validationError) Error() string {
	return e.code
}

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr))
}

func run(args []string, stdout, stderr io.Writer) int {
	if len(args) > 0 && args[0] == "--" {
		args = args[1:]
	}
	if len(args) == 0 {
		_, _ = io.WriteString(stderr, "osvdbcheck: expected one or more ZIP arguments\n")
		return exitUsage
	}

	report := commandReport{
		SchemaVersion: 1,
		Limits:        productionLimits,
		Archives:      make([]archiveReport, 0, len(args)),
	}
	for argumentIndex, archivePath := range args {
		archive, err := validateArchive(archivePath, productionLimits)
		if err != nil {
			_, _ = fmt.Fprintf(
				stderr,
				"osvdbcheck: archive[%d] validation failed (%s)\n",
				argumentIndex,
				err.code,
			)
			return exitValidationFailed
		}
		archive.ArgumentIndex = argumentIndex
		report.Archives = append(report.Archives, archive)
	}

	encoded, err := json.Marshal(report)
	if err != nil {
		_, _ = io.WriteString(stderr, "osvdbcheck: output encoding failed\n")
		return exitValidationFailed
	}
	encoded = append(encoded, '\n')
	if _, err := stdout.Write(encoded); err != nil {
		_, _ = io.WriteString(stderr, "osvdbcheck: output write failed\n")
		return exitValidationFailed
	}

	return exitSuccess
}

func validateArchive(archivePath string, limits validationLimits) (archiveReport, *validationError) {
	if err := limits.validate(); err != nil {
		return archiveReport{}, err
	}

	reader, err := zip.OpenReader(archivePath)
	if err != nil {
		return archiveReport{}, invalid("central_directory")
	}
	defer func() {
		_ = reader.Close()
	}()

	entryCount := uint64(len(reader.File))
	if entryCount == 0 {
		return archiveReport{}, invalid("empty_archive")
	}
	if entryCount > limits.MaxEntries {
		return archiveReport{}, invalid("entry_count_limit")
	}

	seen := make(map[string]struct{}, len(reader.File))
	files := make([]*zip.File, 0, len(reader.File))
	var declaredTotal uint64
	for _, file := range reader.File {
		if !safeEntryPath(file) {
			return archiveReport{}, invalid("unsafe_entry_path")
		}
		if _, exists := seen[file.Name]; exists {
			return archiveReport{}, invalid("duplicate_entry_path")
		}
		seen[file.Name] = struct{}{}

		if !file.Mode().IsRegular() {
			return archiveReport{}, invalid("non_regular_entry")
		}
		if uint64(len(file.Name)) > limits.MaxEntryPathBytes {
			return archiveReport{}, invalid("entry_path_limit")
		}
		if file.UncompressedSize64 > limits.MaxEntryUncompressedBytes {
			return archiveReport{}, invalid("entry_size_limit")
		}
		if file.UncompressedSize64 > limits.MaxArchiveUncompressedBytes-declaredTotal {
			return archiveReport{}, invalid("archive_size_limit")
		}
		declaredTotal += file.UncompressedSize64
		files = append(files, file)
	}

	sort.Slice(files, func(i, j int) bool {
		return files[i].Name < files[j].Name
	})

	manifest := sha256.New()
	// Length-prefixing makes the content manifest unambiguous and independent of
	// ZIP entry ordering, timestamps, compression method, and other metadata.
	_, _ = io.WriteString(manifest, manifestDomain)
	writeUint64(manifest, entryCount)

	buffer := make([]byte, 64<<10)
	var actualTotal uint64
	for _, file := range files {
		contentHash, actualSize, err := hashEntry(file, limits.MaxEntryUncompressedBytes, buffer)
		if err != nil {
			return archiveReport{}, err
		}
		if actualSize != file.UncompressedSize64 {
			return archiveReport{}, invalid("entry_size_mismatch")
		}
		if actualSize > limits.MaxArchiveUncompressedBytes-actualTotal {
			return archiveReport{}, invalid("archive_size_limit")
		}
		actualTotal += actualSize

		writeUint64(manifest, uint64(len(file.Name)))
		_, _ = io.WriteString(manifest, file.Name)
		writeUint64(manifest, actualSize)
		_, _ = manifest.Write(contentHash[:])
	}
	if actualTotal != declaredTotal {
		return archiveReport{}, invalid("archive_size_mismatch")
	}

	return archiveReport{
		EntryCount:        entryCount,
		UncompressedBytes: actualTotal,
		ManifestSHA256:    hex.EncodeToString(manifest.Sum(nil)),
	}, nil
}

func (limits validationLimits) validate() *validationError {
	if limits.MaxEntries == 0 ||
		limits.MaxEntryPathBytes == 0 ||
		limits.MaxEntryUncompressedBytes == 0 ||
		limits.MaxArchiveUncompressedBytes == 0 ||
		limits.MaxEntryUncompressedBytes > uint64(1<<63-2) ||
		limits.MaxEntryUncompressedBytes > limits.MaxArchiveUncompressedBytes {
		return invalid("invalid_limits")
	}
	return nil
}

func safeEntryPath(file *zip.File) bool {
	name := file.Name
	if name == "" || file.NonUTF8 || !utf8.ValidString(name) {
		return false
	}
	if strings.ContainsRune(name, '\\') || strings.ContainsRune(name, '\x00') {
		return false
	}
	for _, character := range name {
		if character < 0x20 || character == 0x7f {
			return false
		}
	}
	if strings.HasPrefix(name, "/") || windowsDrivePath(name) {
		return false
	}
	if !fs.ValidPath(name) || path.Clean(name) != name || name == "." {
		return false
	}
	return true
}

func windowsDrivePath(name string) bool {
	if len(name) < 2 || name[1] != ':' {
		return false
	}
	first := name[0]
	return first >= 'A' && first <= 'Z' || first >= 'a' && first <= 'z'
}

func hashEntry(file *zip.File, maxBytes uint64, buffer []byte) ([sha256.Size]byte, uint64, *validationError) {
	reader, err := file.Open()
	if err != nil {
		return [sha256.Size]byte{}, 0, invalid("entry_open")
	}

	hasher := sha256.New()
	limited := &io.LimitedReader{R: reader, N: int64(maxBytes) + 1}
	written, copyErr := io.CopyBuffer(hasher, limited, buffer)
	closeErr := reader.Close()
	if copyErr != nil || closeErr != nil {
		return [sha256.Size]byte{}, 0, invalid("entry_payload")
	}
	if written < 0 || uint64(written) > maxBytes {
		return [sha256.Size]byte{}, 0, invalid("entry_size_limit")
	}

	var digest [sha256.Size]byte
	copy(digest[:], hasher.Sum(nil))
	return digest, uint64(written), nil
}

func writeUint64(writer io.Writer, value uint64) {
	var encoded [8]byte
	binary.BigEndian.PutUint64(encoded[:], value)
	_, _ = writer.Write(encoded[:])
}

func invalid(code string) *validationError {
	return &validationError{code: code}
}
