// Command repolint compares task commits with immutable bases and fails when
// a diff contains paths outside assigned ownership patterns.
package main

import (
	"bytes"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"sort"
	"strings"

	"github.com/tahackr5/HedefOra-V1/tools/repolint"
)

type repeatedFlag []string

func (values *repeatedFlag) String() string {
	return strings.Join(*values, ",")
}

func (values *repeatedFlag) Set(value string) error {
	*values = append(*values, value)
	return nil
}

type ownershipManifest struct {
	SchemaVersion        int                 `json:"schemaVersion"`
	WaveStart            string              `json:"waveStart"`
	VerifiedThrough      string              `json:"verifiedThrough"`
	TrailingAllowedPaths []string            `json:"trailingAllowedPaths"`
	Tasks                map[string]taskSpec `json:"tasks"`
}

type taskSpec struct {
	Base         string   `json:"base"`
	Head         string   `json:"head"`
	AllowedPaths []string `json:"allowedPaths"`
}

func main() {
	var allowed repeatedFlag
	base := flag.String("base", "", "immutable base commit")
	head := flag.String("head", "HEAD", "task commit or ref")
	manifestPath := flag.String("manifest", "", "JSON ownership manifest")
	taskID := flag.String("task", "", "task ID from the ownership manifest")
	all := flag.Bool("all", false, "validate every task in the ownership manifest")
	flag.Var(&allowed, "allow", "owned repository path or directory/** pattern; repeatable")
	flag.Parse()

	repository, err := repositoryRoot()
	if err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: %v\n", err)
		os.Exit(1)
	}

	if *manifestPath != "" {
		err = validateManifest(repository, *manifestPath, *taskID, *all, *base, *head)
	} else {
		if *base == "" || len(allowed) == 0 {
			err = errors.New("-base and at least one -allow are required")
		} else {
			err = validateTask(repository, "ad-hoc", taskSpec{
				Base:         *base,
				Head:         *head,
				AllowedPaths: allowed,
			}, false)
		}
	}

	if err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: %v\n", err)
		os.Exit(1)
	}
}

func validateManifest(repository, manifestPath, taskID string, all bool, expectedWaveStart, currentHead string) error {
	document, err := os.ReadFile(manifestPath)
	if err != nil {
		return fmt.Errorf("read ownership manifest: %w", err)
	}
	manifest, err := decodeOwnershipManifest(document)
	if err != nil {
		return err
	}
	if manifest.SchemaVersion != 2 {
		return fmt.Errorf("unsupported ownership manifest schemaVersion %d", manifest.SchemaVersion)
	}
	if len(manifest.Tasks) == 0 {
		return errors.New("ownership manifest has no tasks")
	}

	if all {
		ids := make([]string, 0, len(manifest.Tasks))
		for id := range manifest.Tasks {
			ids = append(ids, id)
		}
		sort.Strings(ids)
		for _, id := range ids {
			if err := validateTask(repository, id, manifest.Tasks[id], true); err != nil {
				return err
			}
		}
		return validateCoverage(repository, manifest, expectedWaveStart, currentHead)
	}

	if taskID == "" {
		return errors.New("-task or -all is required with -manifest")
	}
	spec, ok := manifest.Tasks[taskID]
	if !ok {
		return fmt.Errorf("task %q is absent from ownership manifest", taskID)
	}
	return validateTask(repository, taskID, spec, true)
}

func decodeOwnershipManifest(document []byte) (ownershipManifest, error) {
	decoder := json.NewDecoder(bytes.NewReader(document))
	decoder.DisallowUnknownFields()
	var manifest ownershipManifest
	if err := decoder.Decode(&manifest); err != nil {
		return ownershipManifest{}, fmt.Errorf("parse ownership manifest: %w", err)
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		if err == nil {
			return ownershipManifest{}, errors.New("parse ownership manifest: multiple JSON values")
		}
		return ownershipManifest{}, fmt.Errorf("parse ownership manifest trailing data: %w", err)
	}
	return manifest, nil
}

func validateTask(repository, taskID string, spec taskSpec, requireChange bool) error {
	if spec.Base == "" || spec.Head == "" || len(spec.AllowedPaths) == 0 {
		return fmt.Errorf("task %s requires base, head and allowedPaths", taskID)
	}
	resolvedBase, err := resolveCommit(repository, spec.Base)
	if err != nil {
		return fmt.Errorf("task %s base: %w", taskID, err)
	}
	resolvedHead, err := resolveCommit(repository, spec.Head)
	if err != nil {
		return fmt.Errorf("task %s head: %w", taskID, err)
	}
	if requireChange && resolvedBase == resolvedHead {
		return fmt.Errorf("task %s base and head must differ", taskID)
	}
	ancestor, err := isAncestor(repository, resolvedBase, resolvedHead)
	if err != nil {
		return fmt.Errorf("task %s ancestry: %w", taskID, err)
	}
	if !ancestor {
		return fmt.Errorf("task %s base is not an ancestor of head", taskID)
	}
	paths, err := changedPaths(repository, resolvedBase, resolvedHead)
	if err != nil {
		return fmt.Errorf("task %s: %w", taskID, err)
	}
	violations := repolint.ValidateOwnedPaths(paths, spec.AllowedPaths)
	if len(violations) > 0 {
		quoted := make([]string, 0, len(violations))
		for _, violation := range violations {
			quoted = append(quoted, fmt.Sprintf("%q", violation))
		}
		return fmt.Errorf("task %s has paths outside ownership: %s", taskID, strings.Join(quoted, ", "))
	}
	fmt.Printf("PASS: %s has %d changed path endpoint(s) within ownership.\n", taskID, len(paths))
	return nil
}

func validateCoverage(repository string, manifest ownershipManifest, expectedWaveStart, currentHead string) error {
	if expectedWaveStart == "" {
		return errors.New("-base is required with -manifest -all")
	}
	if err := validateFullCommitID("expected wave start", expectedWaveStart); err != nil {
		return err
	}
	if err := validateFullCommitID("manifest waveStart", manifest.WaveStart); err != nil {
		return err
	}
	if manifest.WaveStart != expectedWaveStart {
		return fmt.Errorf("manifest waveStart %s does not match expected base %s", manifest.WaveStart, expectedWaveStart)
	}
	if err := validateFullCommitID("manifest verifiedThrough", manifest.VerifiedThrough); err != nil {
		return err
	}
	if len(manifest.TrailingAllowedPaths) != 1 || manifest.TrailingAllowedPaths[0] != "state/W000-OWNERSHIP.json" {
		return errors.New("trailingAllowedPaths must be exactly [\"state/W000-OWNERSHIP.json\"]")
	}

	byBase := make(map[string]string, len(manifest.Tasks))
	for id, spec := range manifest.Tasks {
		if err := validateFullCommitID("task "+id+" base", spec.Base); err != nil {
			return err
		}
		if err := validateFullCommitID("task "+id+" head", spec.Head); err != nil {
			return err
		}
		if previous, exists := byBase[spec.Base]; exists {
			return fmt.Errorf("coverage forks at %s between tasks %s and %s", spec.Base, previous, id)
		}
		byBase[spec.Base] = id
	}

	visited := make(map[string]bool, len(manifest.Tasks))
	cursor := manifest.WaveStart
	for cursor != manifest.VerifiedThrough {
		id, exists := byBase[cursor]
		if !exists {
			return fmt.Errorf("coverage gap after commit %s", cursor)
		}
		if visited[id] {
			return fmt.Errorf("coverage cycle at task %s", id)
		}
		visited[id] = true
		cursor = manifest.Tasks[id].Head
	}
	if len(visited) != len(manifest.Tasks) {
		unused := make([]string, 0)
		for id := range manifest.Tasks {
			if !visited[id] {
				unused = append(unused, id)
			}
		}
		sort.Strings(unused)
		return fmt.Errorf("coverage contains disconnected task(s): %s", strings.Join(unused, ", "))
	}

	resolvedHead, err := resolveCommit(repository, currentHead)
	if err != nil {
		return fmt.Errorf("resolve current head: %w", err)
	}
	ancestor, err := isAncestor(repository, manifest.VerifiedThrough, resolvedHead)
	if err != nil {
		return fmt.Errorf("verifiedThrough ancestry: %w", err)
	}
	if !ancestor {
		return fmt.Errorf("verifiedThrough %s is not an ancestor of current head %s", manifest.VerifiedThrough, resolvedHead)
	}
	paths, err := changedPaths(repository, manifest.VerifiedThrough, resolvedHead)
	if err != nil {
		return fmt.Errorf("trailing coverage: %w", err)
	}
	violations := repolint.ValidateOwnedPaths(paths, manifest.TrailingAllowedPaths)
	if len(violations) > 0 {
		quoted := make([]string, 0, len(violations))
		for _, violation := range violations {
			quoted = append(quoted, fmt.Sprintf("%q", violation))
		}
		return fmt.Errorf("current head has paths outside trailing ownership: %s", strings.Join(quoted, ", "))
	}
	if len(paths) == 0 && resolvedHead != manifest.VerifiedThrough {
		return errors.New("trailing commits do not change the required ownership manifest")
	}

	fmt.Printf(
		"PASS: ownership coverage is continuous from %s through %s; %d trailing path endpoint(s) reach %s.\n",
		manifest.WaveStart,
		manifest.VerifiedThrough,
		len(paths),
		resolvedHead,
	)
	return nil
}

func validateFullCommitID(label, value string) error {
	if len(value) != 40 {
		return fmt.Errorf("%s must be a full 40-character commit SHA", label)
	}
	if _, err := hex.DecodeString(value); err != nil {
		return fmt.Errorf("%s must be a hexadecimal commit SHA", label)
	}
	return nil
}

func repositoryRoot() (string, error) {
	output, err := exec.Command("git", "rev-parse", "--show-toplevel").Output()
	if err != nil {
		return "", fmt.Errorf("resolve repository root: %w", err)
	}
	return strings.TrimSpace(string(output)), nil
}

func resolveCommit(repository, ref string) (string, error) {
	command := exec.Command("git", "rev-parse", "--verify", ref+"^{commit}")
	command.Dir = repository
	output, err := command.Output()
	if err != nil {
		return "", fmt.Errorf("git rev-parse failed: %w", err)
	}
	return strings.TrimSpace(string(output)), nil
}

func isAncestor(repository, base, head string) (bool, error) {
	command := exec.Command("git", "merge-base", "--is-ancestor", base, head)
	command.Dir = repository
	err := command.Run()
	if err == nil {
		return true, nil
	}
	var exitError *exec.ExitError
	if errors.As(err, &exitError) && exitError.ExitCode() == 1 {
		return false, nil
	}
	return false, fmt.Errorf("git merge-base failed: %w", err)
}

func changedPaths(repository, base, head string) ([]string, error) {
	commits, err := commitsInRange(repository, base, head)
	if err != nil {
		return nil, err
	}
	uniquePaths := make(map[string]struct{})
	for _, commit := range commits {
		parent, parentErr := resolveCommit(repository, commit+"^1")
		if parentErr != nil {
			return nil, fmt.Errorf("resolve first parent for %s: %w", commit, parentErr)
		}
		paths, diffErr := changedPathsForCommit(repository, parent, commit)
		if diffErr != nil {
			return nil, diffErr
		}
		for _, changedPath := range paths {
			uniquePaths[changedPath] = struct{}{}
		}
	}
	paths := make([]string, 0, len(uniquePaths))
	for changedPath := range uniquePaths {
		paths = append(paths, changedPath)
	}
	sort.Strings(paths)
	return paths, nil
}

func commitsInRange(repository, base, head string) ([]string, error) {
	command := exec.Command(
		"git",
		"rev-list",
		"--reverse",
		"--topo-order",
		"--first-parent",
		"--ancestry-path",
		base+".."+head,
	)
	command.Dir = repository
	output, err := command.Output()
	if err != nil {
		return nil, fmt.Errorf("git rev-list failed: %w", err)
	}
	return strings.Fields(string(output)), nil
}

func changedPathsForCommit(repository, base, head string) ([]string, error) {
	command := exec.Command(
		"git",
		"diff",
		"--name-status",
		"-z",
		"--find-renames",
		"--find-copies",
		"--diff-filter=ACDMRTUXB",
		base+".."+head,
		"--",
	)
	command.Dir = repository
	output, err := command.Output()
	if err != nil {
		return nil, fmt.Errorf("git diff failed: %w", err)
	}
	return parseNameStatus(output)
}

func parseNameStatus(output []byte) ([]string, error) {
	fields := bytes.Split(output, []byte{0})
	if len(fields) > 0 && len(fields[len(fields)-1]) == 0 {
		fields = fields[:len(fields)-1]
	}
	paths := make([]string, 0, len(fields)/2)
	for index := 0; index < len(fields); {
		status := string(fields[index])
		index++
		if status == "" {
			return nil, errors.New("git name-status contains an empty status")
		}
		pathCount := 1
		if status[0] == 'R' || status[0] == 'C' {
			pathCount = 2
		}
		if index+pathCount > len(fields) {
			return nil, fmt.Errorf("git name-status is truncated after status %q", status)
		}
		for range pathCount {
			paths = append(paths, string(fields[index]))
			index++
		}
	}
	return paths, nil
}
