package main

import (
	"bytes"
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"
)

func TestCLI(t *testing.T) {
	dir := filepath.Join("..", "..", "dataset")
	for _, tc := range []struct {
		name string
		args []string
		code int
		want string
	}{
		{"validate", []string{"-data", dir, "validate"}, 0, "Dataset valid"},
		{"word", []string{"-data", dir, "word", "가격"}, 0, "價格"},
		{"reverse", []string{"-data", dir, "character", "家"}, 0, "작가"},
		{"empty", []string{"-data", dir, "-json", "word", "missing"}, 0, "[]"},
		{"help", []string{"-h"}, 0, "Usage:"},
		{"missing query", []string{"word"}, 2, "Usage:"},
		{"unknown command", []string{"oops"}, 2, "Usage:"},
		{"extra args", []string{"validate", "oops"}, 2, "Usage:"},
		{"missing data", []string{"-data", filepath.Join(t.TempDir(), "missing")}, 1, "meta.jsonl"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var out, stderr bytes.Buffer
			code := run(tc.args, &out, &stderr)
			if code != tc.code || !strings.Contains(out.String()+stderr.String(), tc.want) {
				t.Fatalf("code=%d stdout=%q stderr=%q", code, out.String(), stderr.String())
			}
		})
	}
}

func TestJSONOutput(t *testing.T) {
	for _, command := range [][]string{{"validate"}, {"word", "가격"}, {"character", "家"}} {
		var out, stderr bytes.Buffer
		args := append([]string{"-data", filepath.Join("..", "..", "dataset"), "-json"}, command...)
		if code := run(args, &out, &stderr); code != 0 || stderr.Len() > 0 || !json.Valid(out.Bytes()) {
			t.Fatalf("%v: code=%d stdout=%q stderr=%q", command, code, out.String(), stderr.String())
		}
	}
}
