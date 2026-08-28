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

func TestChangedPathsPreservesTransientPathFromMergedBranch(t *testing.T) {
	repository := initializeRepository(t)
	writeRepositoryFile(t, repository, "owned/base.txt", "base\n")
	base := commitRepository(t, repository, "base")

	runGit(t, repository, "checkout", "-b", "side")
	writeRepositoryFile(t, repository, "forbidden.txt", "transient on side branch\n")
	commitRepository(t, repository, "add forbidden side path")
	if err := os.Remove(filepath.Join(repository, "forbidden.txt")); err != nil {
		t.Fatalf("remove side-branch forbidden fixture: %v", err)
	}
	commitRepository(t, repository, "remove forbidden side path")

	runGit(t, repository, "checkout", "main")
	writeRepositoryFile(t, repository, "owned/main.txt", "owned\n")
	commitRepository(t, repository, "owned main change")
	runGit(t, repository, "merge", "--no-ff", "side", "-m", "merge side history")
	head := strings.TrimSpace(runGit(t, repository, "rev-parse", "HEAD"))

	paths, err := changedPaths(repository, base, head)
	if err != nil {
		t.Fatalf("changedPaths() error = %v", err)
	}
	if !reflect.DeepEqual(paths, []string{"forbidden.txt", "owned/main.txt"}) {
		t.Fatalf("changedPaths() = %v, want transient side path and owned main path", paths)
	}
}

func TestValidateTaskRejectsMergedHistoryDivergedBeforeBase(t *testing.T) {
	repository := initializeRepository(t)
	writeRepositoryFile(t, repository, "README.md", "common\n")
	commitRepository(t, repository, "common ancestor")

	runGit(t, repository, "checkout", "-b", "pre-base-side")
	writeRepositoryFile(t, repository, "forbidden.txt", "transient pre-base history\n")
	commitRepository(t, repository, "add forbidden pre-base path")
	if err := os.Remove(filepath.Join(repository, "forbidden.txt")); err != nil {
		t.Fatalf("remove pre-base forbidden fixture: %v", err)
	}
	commitRepository(t, repository, "remove forbidden pre-base path")

	runGit(t, repository, "checkout", "main")
	writeRepositoryFile(t, repository, "owned/base.txt", "immutable base\n")
	base := commitRepository(t, repository, "task base")
	writeRepositoryFile(t, repository, "owned/change.txt", "owned task change\n")
	commitRepository(t, repository, "owned task change")
	runGit(t, repository, "merge", "--no-ff", "pre-base-side", "-m", "merge pre-base history")
	head := strings.TrimSpace(runGit(t, repository, "rev-parse", "HEAD"))

	err := validateTask(repository, "pre-base-history", taskSpec{
		Base:         base,
		Head:         head,
		AllowedPaths: []string{"owned/**"},
	}, true)
	if err == nil || !strings.Contains(err.Error(), "not descended from immutable base") {
		t.Fatalf("validateTask() pre-base history error = %v", err)
	}
}

func TestValidateTaskRejectsLeadingSpaceOwnershipAlias(t *testing.T) {
	repository := initializeRepository(t)
	writeRepositoryFile(t, repository, "README.md", "base\n")
	base := commitRepository(t, repository, "base")
	writeRepositoryFile(t, repository, " apps/web/src/Feature.tsx", "export {};\n")
	head := commitRepository(t, repository, "leading-space path")

	err := validateTask(repository, "alias", taskSpec{
		Base:         base,
		Head:         head,
		AllowedPaths: []string{"apps/web/**"},
	}, true)
	if err == nil || !strings.Contains(err.Error(), `" apps/web/src/Feature.tsx"`) {
		t.Fatalf("validateTask() alias error = %v", err)
	}
}

func TestValidateManifestAcceptsContinuousCoverageAndManifestOnlyTrailingCommit(t *testing.T) {
	repository, manifestPath, manifest, start, _ := coverageFixture(t, false)
	writeManifest(t, manifestPath, manifest)

	if err := validateManifest(repository, manifestPath, "", true, start, "HEAD", false); err != nil {
		t.Fatalf("validateManifest() error = %v", err)
	}
}

func TestValidateManifestDerivesTrailingPathFromSelectedManifest(t *testing.T) {
	repository, manifestPath, manifest, start, _ := coverageFixtureAt(t, "state/W001-OWNERSHIP.json", false)
	writeManifest(t, manifestPath, manifest)

	if err := validateManifest(repository, manifestPath, "", true, start, "HEAD", false); err != nil {
		t.Fatalf("validateManifest() W001 error = %v", err)
	}

	manifest.TrailingAllowedPaths = []string{"state/W000-OWNERSHIP.json"}
	writeManifest(t, manifestPath, manifest)
	err := validateManifest(repository, manifestPath, "", true, start, "HEAD", false)
	if err == nil || !strings.Contains(err.Error(), `exactly ["state/W001-OWNERSHIP.json"]`) {
		t.Fatalf("validateManifest() mismatched trailing path error = %v", err)
	}
}

func TestValidateManifestRejectsPathOutsideRepository(t *testing.T) {
	repository, _, manifest, start, _ := coverageFixture(t, false)
	outsidePath := filepath.Join(t.TempDir(), "W001-OWNERSHIP.json")
	writeManifest(t, outsidePath, manifest)

	err := validateManifest(repository, outsidePath, "", true, start, "HEAD", false)
	if err == nil || !strings.Contains(err.Error(), "must be inside the repository") {
		t.Fatalf("validateManifest() outside path error = %v", err)
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

		err := validateManifest(repository, manifestPath, "", true, start, "HEAD", false)
		if err == nil || !strings.Contains(err.Error(), "coverage gap") {
			t.Fatalf("validateManifest() gap error = %v", err)
		}
	})

	t.Run("forbidden trailing path", func(t *testing.T) {
		repository, manifestPath, manifest, start, _ := coverageFixture(t, true)
		writeManifest(t, manifestPath, manifest)

		err := validateManifest(repository, manifestPath, "", true, start, "HEAD", false)
		if err == nil || !strings.Contains(err.Error(), "outside trailing ownership") {
			t.Fatalf("validateManifest() trailing error = %v", err)
		}
	})
}

func TestValidateMergeWrapperAcceptsTwoParentContentIdenticalMerge(t *testing.T) {
	repository := initializeRepository(t)
	writeRepositoryFile(t, repository, "README.md", "base\n")
	commitRepository(t, repository, "base")
	runGit(t, repository, "checkout", "-b", "candidate")
	writeRepositoryFile(t, repository, "owned/file.txt", "candidate\n")
	reviewedHead := commitRepository(t, repository, "candidate")
	runGit(t, repository, "checkout", "main")
	runGit(t, repository, "merge", "--no-ff", "candidate", "-m", "merge candidate")

	got, err := validateMergeWrapper(repository, "HEAD")
	if err != nil {
		t.Fatalf("validateMergeWrapper() error = %v", err)
	}
	if got != reviewedHead {
		t.Fatalf("validateMergeWrapper() = %s, want reviewed head %s", got, reviewedHead)
	}
}

func TestValidateMergeWrapperRejectsInvalidTopologyAndTree(t *testing.T) {
	t.Run("single parent", func(t *testing.T) {
		repository := initializeRepository(t)
		writeRepositoryFile(t, repository, "README.md", "single\n")
		commitRepository(t, repository, "single")
		_, err := validateMergeWrapper(repository, "HEAD")
		if err == nil || !strings.Contains(err.Error(), "exactly two parents") {
			t.Fatalf("validateMergeWrapper() single-parent error = %v", err)
		}
	})

	t.Run("diverged main", func(t *testing.T) {
		repository := initializeRepository(t)
		writeRepositoryFile(t, repository, "README.md", "base\n")
		commitRepository(t, repository, "base")
		runGit(t, repository, "checkout", "-b", "candidate")
		writeRepositoryFile(t, repository, "candidate.txt", "candidate\n")
		commitRepository(t, repository, "candidate")
		runGit(t, repository, "checkout", "main")
		writeRepositoryFile(t, repository, "main.txt", "main\n")
		commitRepository(t, repository, "main advanced")
		runGit(t, repository, "merge", "--no-ff", "candidate", "-m", "merge diverged candidate")

		_, err := validateMergeWrapper(repository, "HEAD")
		if err == nil || !strings.Contains(err.Error(), "is not an ancestor") {
			t.Fatalf("validateMergeWrapper() diverged error = %v", err)
		}
	})

	t.Run("wrapper tree drift", func(t *testing.T) {
		repository := initializeRepository(t)
		writeRepositoryFile(t, repository, "README.md", "base\n")
		commitRepository(t, repository, "base")
		runGit(t, repository, "checkout", "-b", "candidate")
		writeRepositoryFile(t, repository, "candidate.txt", "candidate\n")
		commitRepository(t, repository, "candidate")
		runGit(t, repository, "checkout", "main")
		runGit(t, repository, "merge", "--no-ff", "candidate", "-m", "merge candidate")
		writeRepositoryFile(t, repository, "wrapper-only.txt", "not reviewed\n")
		runGit(t, repository, "add", "--all")
		runGit(t, repository, "commit", "--amend", "--no-edit")

		_, err := validateMergeWrapper(repository, "HEAD")
		if err == nil || !strings.Contains(err.Error(), "tree differs") {
			t.Fatalf("validateMergeWrapper() tree-drift error = %v", err)
		}
	})

	t.Run("octopus merge", func(t *testing.T) {
		repository := initializeRepository(t)
		writeRepositoryFile(t, repository, "README.md", "base\n")
		commitRepository(t, repository, "base")
		runGit(t, repository, "checkout", "-b", "candidate-one")
		writeRepositoryFile(t, repository, "one.txt", "one\n")
		commitRepository(t, repository, "candidate one")
		runGit(t, repository, "checkout", "main")
		runGit(t, repository, "checkout", "-b", "candidate-two")
		writeRepositoryFile(t, repository, "two.txt", "two\n")
		commitRepository(t, repository, "candidate two")
		runGit(t, repository, "checkout", "main")
		runGit(t, repository, "merge", "--no-ff", "candidate-one", "candidate-two", "-m", "octopus merge")

		_, err := validateMergeWrapper(repository, "HEAD")
		if err == nil || !strings.Contains(err.Error(), "exactly two parents") {
			t.Fatalf("validateMergeWrapper() octopus error = %v", err)
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
	return coverageFixtureAt(t, "state/W000-OWNERSHIP.json", forbiddenTrailingPath)
}

func coverageFixtureAt(t *testing.T, manifestRepositoryPath string, forbiddenTrailingPath bool) (string, string, ownershipManifest, string, string) {
	t.Helper()
	repository := initializeRepository(t)
	writeRepositoryFile(t, repository, "README.md", "initial\n")
	start := commitRepository(t, repository, "wave start")

	writeRepositoryFile(t, repository, "allowed/task.txt", "owned\n")
	verified := commitRepository(t, repository, "owned task")

	writeRepositoryFile(t, repository, manifestRepositoryPath, "{}\n")
	if forbiddenTrailingPath {
		writeRepositoryFile(t, repository, "forbidden.txt", "outside trailing ownership\n")
	}
	trailingHead := commitRepository(t, repository, "manifest trailing commit")

	manifest := ownershipManifest{
		SchemaVersion:        2,
		WaveStart:            start,
		VerifiedThrough:      verified,
		TrailingAllowedPaths: []string{manifestRepositoryPath},
		Tasks: map[string]taskSpec{
			"owned-task": {
				Base:         start,
				Head:         verified,
				AllowedPaths: []string{"allowed/**"},
			},
		},
	}
	return repository, filepath.Join(repository, filepath.FromSlash(manifestRepositoryPath)), manifest, start, trailingHead
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
