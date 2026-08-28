package repolint

import "testing"

func TestNormalizeRepositoryPath(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		input   string
		want    string
		wantErr bool
	}{
		{name: "slash path", input: "apps/web/src/main.tsx", want: "apps/web/src/main.tsx"},
		{name: "windows separators", input: `apps\web\src\main.tsx`, want: "apps/web/src/main.tsx"},
		{name: "absolute unix", input: "/etc/passwd", wantErr: true},
		{name: "absolute windows", input: `C:\secrets\.env`, wantErr: true},
		{name: "parent traversal", input: "../outside", wantErr: true},
		{name: "empty", input: "", wantErr: true},
	}

	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			got, err := NormalizeRepositoryPath(test.input)
			if test.wantErr {
				if err == nil {
					t.Fatalf("NormalizeRepositoryPath(%q) returned no error", test.input)
				}
				return
			}
			if err != nil {
				t.Fatalf("NormalizeRepositoryPath(%q) error = %v", test.input, err)
			}
			if got != test.want {
				t.Fatalf("NormalizeRepositoryPath(%q) = %q, want %q", test.input, got, test.want)
			}
		})
	}
}

func TestIsOwnedPath(t *testing.T) {
	t.Parallel()

	patterns := []string{"apps/web/**", "README.md"}
	for _, owned := range []string{"apps/web", "apps/web/src/App.tsx", `apps\web\package.json`, "README.md"} {
		if !IsOwnedPath(owned, patterns) {
			t.Errorf("IsOwnedPath(%q) = false, want true", owned)
		}
	}

	for _, forbidden := range []string{"apps/website/package.json", "package.json", "../apps/web/package.json", `C:\apps\web\package.json`} {
		if IsOwnedPath(forbidden, patterns) {
			t.Errorf("IsOwnedPath(%q) = true, want false", forbidden)
		}
	}
}

func TestValidateOwnedPaths(t *testing.T) {
	t.Parallel()

	violations := ValidateOwnedPaths(
		[]string{"state/ACTIVE-WAVE.md", "apps/web/src/App.tsx", "package.json"},
		[]string{"apps/web/**"},
	)
	want := []string{"package.json", "state/ACTIVE-WAVE.md"}
	if len(violations) != len(want) {
		t.Fatalf("ValidateOwnedPaths() = %v, want %v", violations, want)
	}
	for index := range want {
		if violations[index] != want[index] {
			t.Fatalf("ValidateOwnedPaths() = %v, want %v", violations, want)
		}
	}
}
