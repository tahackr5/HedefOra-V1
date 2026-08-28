package main

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/tahackr5/HedefOra-V1/tools/repolint"
)

func TestParseNameStatus(t *testing.T) {
	t.Parallel()

	output := []byte("M\x00apps/web/src/App.tsx\x00D\x00apps/web/old.ts\x00R100\x00apps/web/from.ts\x00state/to.ts\x00")
	got, err := parseNameStatus(output)
	if err != nil {
		t.Fatalf("parseNameStatus() error = %v", err)
	}
	want := []string{
		"apps/web/src/App.tsx",
		"apps/web/old.ts",
		"apps/web/from.ts",
		"state/to.ts",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("parseNameStatus() = %v, want %v", got, want)
	}
}

func TestParseNameStatusPreservesNewlinesAndRejectsTruncation(t *testing.T) {
	t.Parallel()

	got, err := parseNameStatus([]byte("A\x00apps/web/line\nbreak.ts\x00"))
	if err != nil {
		t.Fatalf("parseNameStatus() newline error = %v", err)
	}
	if !reflect.DeepEqual(got, []string{"apps/web/line\nbreak.ts"}) {
		t.Fatalf("parseNameStatus() newline result = %q", got)
	}

	if _, err := parseNameStatus([]byte("R100\x00old.ts\x00")); err == nil {
		t.Fatal("parseNameStatus() accepted a truncated rename")
	}
}

func TestChangedPathsIncludesDeletionFromGit(t *testing.T) {
	repository := initializeRepository(t)
	writeRepositoryFile(t, repository, "owned/file.txt", "owned\n")
	writeRepositoryFile(t, repository, "forbidden.txt", "must be visible when deleted\n")
	base := commitRepository(t, repository, "base")

	if err := os.Remove(filepath.Join(repository, "forbidden.txt")); err != nil {
		t.Fatalf("remove forbidden fixture: %v", err)
	}
	head := commitRepository(t, repository, "delete forbidden path")

	paths, err := changedPaths(repository, base, head)
	if err != nil {
		t.Fatalf("changedPaths() error = %v", err)
	}
	if !reflect.DeepEqual(paths, []string{"forbidden.txt"}) {
		t.Fatalf("changedPaths() = %v, want deleted path", paths)
	}
	if violations := repolint.ValidateOwnedPaths(paths, []string{"owned/**"}); !reflect.DeepEqual(violations, []string{"forbidden.txt"}) {
		t.Fatalf("deletion violations = %v, want forbidden.txt", violations)
	}
}

func TestChangedPathsPreservesForbiddenPathAddedThenDeleted(t *testing.T) {
	repository := initializeRepository(t)
	writeRepositoryFile(t, repository, "owned/file.txt", "owned\n")
	base := commitRepository(t, repository, "base")

	writeRepositoryFile(t, repository, "forbidden.txt", "transient but reachable\n")
	commitRepository(t, repository, "add forbidden path")
	if err := os.Remove(filepath.Join(repository, "forbidden.txt")); err != nil {
		t.Fatalf("remove transient forbidden fixture: %v", err)
	}
	head := commitRepository(t, repository, "remove forbidden path")

	paths, err := changedPaths(repository, base, head)
	if err != nil {
		t.Fatalf("changedPaths() error = %v", err)
	}
	if !reflect.DeepEqual(paths, []string{"forbidden.txt"}) {
		t.Fatalf("changedPaths() = %v, want transient forbidden path", paths)
	}
}

func TestValidateManifestAcceptsContinuousCoverageAndManifestOnlyTrailingCommit(t *testing.T) {
	repository, manifestPath, manifest, start, _ := coverageFixture(t, false)
	writeManifest(t, manifestPath, manifest)

	if err := validateManifest(repository, manifestPath, "", true, start, "HEAD"); err != nil {
		t.Fatalf("validateManifest() error = %v", err)
	}
}

func TestValidateManifestRejectsCoverageGapAndForbiddenTrailingPath(t *testing.T) {
	t.Run("gap", func(t *testing.T) {
		repository, manifestPath, manifest, start, trailingHead := coverageFixture(t, false)
		manifest.Tasks = map[string]taskSpec{
			"gap": {
				Base:         manifest.VerifiedThrough,
				Head:         trailingHead,
				AllowedPaths: []string{"state/**"},
			},
		}
		manifest.VerifiedThrough = trailingHead
		writeManifest(t, manifestPath, manifest)

		err := validateManifest(repository, manifestPath, "", true, start, "HEAD")
		if err == nil || !strings.Contains(err.Error(), "coverage gap") {
			t.Fatalf("validateManifest() gap error = %v", err)
		}
	})

	t.Run("forbidden trailing path", func(t *testing.T) {
		repository, manifestPath, manifest, start, _ := coverageFixture(t, true)
		writeManifest(t, manifestPath, manifest)

		err := validateManifest(repository, manifestPath, "", true, start, "HEAD")
		if err == nil || !strings.Contains(err.Error(), "outside trailing ownership") {
			t.Fatalf("validateManifest() trailing error = %v", err)
		}
	})
}

func TestValidateTaskRejectsZeroLengthRange(t *testing.T) {
	repository := initializeRepository(t)
	writeRepositoryFile(t, repository, "README.md", "initial\n")
	commit := commitRepository(t, repository, "initial")

	err := validateTask(repository, "zero", taskSpec{
		Base:         commit,
		Head:         commit,
		AllowedPaths: []string{"README.md"},
	}, true)
	if err == nil || !strings.Contains(err.Error(), "must differ") {
		t.Fatalf("validateTask() error = %v", err)
	}
}

func TestValidateTaskAllowsAdHocZeroLengthRange(t *testing.T) {
	repository := initializeRepository(t)
	writeRepositoryFile(t, repository, "README.md", "initial\n")
	commit := commitRepository(t, repository, "initial")

	err := validateTask(repository, "ad-hoc", taskSpec{
		Base:         commit,
		Head:         commit,
		AllowedPaths: []string{"README.md"},
	}, false)
	if err != nil {
		t.Fatalf("validateTask() ad-hoc zero range error = %v", err)
	}
}

func TestDecodeOwnershipManifestRejectsUnknownFields(t *testing.T) {
	_, err := decodeOwnershipManifest([]byte(`{"schemaVersion":2,"unknown":true}`))
	if err == nil || !strings.Contains(err.Error(), "unknown field") {
		t.Fatalf("decodeOwnershipManifest() error = %v", err)
	}
}

func coverageFixture(t *testing.T, forbiddenTrailingPath bool) (string, string, ownershipManifest, string, string) {
	t.Helper()
	repository := initializeRepository(t)
	writeRepositoryFile(t, repository, "README.md", "initial\n")
	start := commitRepository(t, repository, "wave start")

	writeRepositoryFile(t, repository, "allowed/task.txt", "owned\n")
	verified := commitRepository(t, repository, "owned task")

	writeRepositoryFile(t, repository, "state/W000-OWNERSHIP.json", "{}\n")
	if forbiddenTrailingPath {
		writeRepositoryFile(t, repository, "forbidden.txt", "outside trailing ownership\n")
	}
	trailingHead := commitRepository(t, repository, "manifest trailing commit")

	manifest := ownershipManifest{
		SchemaVersion:        2,
		WaveStart:            start,
		VerifiedThrough:      verified,
		TrailingAllowedPaths: []string{"state/W000-OWNERSHIP.json"},
		Tasks: map[string]taskSpec{
			"owned-task": {
				Base:         start,
				Head:         verified,
				AllowedPaths: []string{"allowed/**"},
			},
		},
	}
	return repository, filepath.Join(repository, "state", "W000-OWNERSHIP.json"), manifest, start, trailingHead
}

func initializeRepository(t *testing.T) string {
	t.Helper()
	repository := t.TempDir()
	runGit(t, repository, "init", "--initial-branch=main")
	runGit(t, repository, "config", "user.name", "HedefOra Test")
	runGit(t, repository, "config", "user.email", "test@hedefora.invalid")
	return repository
}

func writeRepositoryFile(t *testing.T, repository, relativePath, contents string) {
	t.Helper()
	target := filepath.Join(repository, filepath.FromSlash(relativePath))
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		t.Fatalf("create fixture directory: %v", err)
	}
	if err := os.WriteFile(target, []byte(contents), 0o600); err != nil {
		t.Fatalf("write fixture %s: %v", relativePath, err)
	}
}

func writeManifest(t *testing.T, manifestPath string, manifest ownershipManifest) {
	t.Helper()
	document, err := json.Marshal(manifest)
	if err != nil {
		t.Fatalf("marshal manifest: %v", err)
	}
	if err := os.WriteFile(manifestPath, append(document, '\n'), 0o600); err != nil {
		t.Fatalf("write manifest: %v", err)
	}
}

func commitRepository(t *testing.T, repository, message string) string {
	t.Helper()
	runGit(t, repository, "add", "--all")
	runGit(t, repository, "commit", "-m", message)
	return strings.TrimSpace(runGit(t, repository, "rev-parse", "HEAD"))
}

func runGit(t *testing.T, repository string, args ...string) string {
	t.Helper()
	command := exec.Command("git", args...)
	command.Dir = repository
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("git %s failed: %v\n%s", strings.Join(args, " "), err, output)
	}
	return string(output)
}
