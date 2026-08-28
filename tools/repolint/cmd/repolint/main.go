// Command repolint compares task commits with immutable bases and fails when
// a diff contains paths outside assigned ownership patterns.
package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
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
	SchemaVersion int                 `json:"schemaVersion"`
	Tasks         map[string]taskSpec `json:"tasks"`
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

	var err error
	if *manifestPath != "" {
		err = validateManifest(*manifestPath, *taskID, *all)
	} else {
		if *base == "" || len(allowed) == 0 {
			err = errors.New("-base and at least one -allow are required")
		} else {
			err = validateTask("ad-hoc", taskSpec{
				Base:         *base,
				Head:         *head,
				AllowedPaths: allowed,
			})
		}
	}

	if err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: %v\n", err)
		os.Exit(1)
	}
}

func validateManifest(manifestPath, taskID string, all bool) error {
	document, err := os.ReadFile(manifestPath)
	if err != nil {
		return fmt.Errorf("read ownership manifest: %w", err)
	}
	var manifest ownershipManifest
	if err := json.Unmarshal(document, &manifest); err != nil {
		return fmt.Errorf("parse ownership manifest: %w", err)
	}
	if manifest.SchemaVersion != 1 {
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
			if err := validateTask(id, manifest.Tasks[id]); err != nil {
				return err
			}
		}
		return nil
	}

	if taskID == "" {
		return errors.New("-task or -all is required with -manifest")
	}
	spec, ok := manifest.Tasks[taskID]
	if !ok {
		return fmt.Errorf("task %q is absent from ownership manifest", taskID)
	}
	return validateTask(taskID, spec)
}

func validateTask(taskID string, spec taskSpec) error {
	if spec.Base == "" || spec.Head == "" || len(spec.AllowedPaths) == 0 {
		return fmt.Errorf("task %s requires base, head and allowedPaths", taskID)
	}
	paths, err := changedPaths(spec.Base, spec.Head)
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

func changedPaths(base, head string) ([]string, error) {
	command := exec.Command(
		"git",
		"diff",
		"--name-status",
		"-z",
		"--find-renames",
		"--find-copies",
		"--diff-filter=ACMRTUXB",
		base+".."+head,
		"--",
	)
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
