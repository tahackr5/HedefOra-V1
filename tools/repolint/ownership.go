// Package repolint contains repository-governance helpers. It is not product
// runtime code and exists only to make path ownership rules executable.
package repolint

import (
	"fmt"
	"path"
	"sort"
	"strings"
)

// NormalizeRepositoryPath validates a canonical Git repository path without
// rewriting bytes that could alias a different path.
func NormalizeRepositoryPath(value string) (string, error) {
	if value == "" {
		return "", fmt.Errorf("repository path is empty")
	}
	if value != strings.TrimSpace(value) {
		return "", fmt.Errorf("repository path has leading or trailing whitespace: %q", value)
	}
	if strings.Contains(value, "\\") {
		return "", fmt.Errorf("repository path contains a non-canonical backslash: %q", value)
	}
	if strings.HasPrefix(value, "/") || hasWindowsVolume(value) {
		return "", fmt.Errorf("repository path must be relative: %q", value)
	}

	cleaned := path.Clean(value)
	if cleaned == "." || cleaned == ".." || strings.HasPrefix(cleaned, "../") {
		return "", fmt.Errorf("repository path escapes the root: %q", value)
	}
	if cleaned != value {
		return "", fmt.Errorf("repository path is not canonical: %q", value)
	}

	return cleaned, nil
}

// IsOwnedPath reports whether value is covered by an exact pattern or a
// directory pattern ending in /**. Invalid paths and patterns fail closed.
func IsOwnedPath(value string, patterns []string) bool {
	normalized, err := NormalizeRepositoryPath(value)
	if err != nil {
		return false
	}

	for _, pattern := range patterns {
		if strings.HasSuffix(pattern, "/**") {
			prefix, prefixErr := NormalizeRepositoryPath(strings.TrimSuffix(pattern, "/**"))
			if prefixErr == nil && (normalized == prefix || strings.HasPrefix(normalized, prefix+"/")) {
				return true
			}
			continue
		}

		exact, exactErr := NormalizeRepositoryPath(pattern)
		if exactErr == nil && normalized == exact {
			return true
		}
	}

	return false
}

// ValidateOwnedPaths returns a stable, sorted list of paths that are not
// covered by any assigned ownership pattern.
func ValidateOwnedPaths(values, patterns []string) []string {
	violations := make([]string, 0)
	for _, value := range values {
		if !IsOwnedPath(value, patterns) {
			violations = append(violations, value)
		}
	}
	sort.Strings(violations)
	return violations
}

func hasWindowsVolume(value string) bool {
	return len(value) >= 2 && ((value[0] >= 'a' && value[0] <= 'z') || (value[0] >= 'A' && value[0] <= 'Z')) && value[1] == ':'
}
