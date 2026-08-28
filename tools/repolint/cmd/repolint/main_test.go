package main

import (
	"reflect"
	"testing"
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
