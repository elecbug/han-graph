package graph

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// The repeated-glyph word is synthetic and exercises graph structure only.
func fixture(t *testing.T) map[string]string {
	t.Helper()
	files := make(map[string]string)
	encode := func(name string, rows ...any) {
		for _, row := range rows {
			data, err := json.Marshal(row)
			if err != nil {
				t.Fatal(err)
			}
			files[name] += string(data) + "\n"
		}
	}
	encode("meta.jsonl", Meta{"meta", "bun", "분", "bun"}, Meta{"meta", "su", "수", "su"}, Meta{"meta", "sak", "삭", "sak"})
	encode("character.jsonl",
		Character{"character", "bun-000", "分", []string{"나누다"}, []string{"divide"}},
		Character{"character", "bun-200", "噴", []string{"뿜다"}, []string{"spray"}},
		Character{"character", "su-000", "數", []string{"수"}, []string{"number"}},
		Character{"character", "su-001", "水", []string{"물"}, []string{"water"}},
		Character{"character", "sak-000", "數", []string{"자주"}, []string{"frequently"}})
	encode("normal_word.jsonl",
		Word{"normal", "분수", "分數", "나눈 수", "fraction", []string{"分", "數"}, "나눈 수"},
		Word{"normal", "분수", "噴水", "물을 뿜음", "fountain", []string{"噴", "水"}, ""},
		Word{"normal", "반복테스트", "水水", "테스트", "test", []string{"水", "水"}, ""})
	return files
}

func writeFixture(t *testing.T, files map[string]string) string {
	t.Helper()
	dir := t.TempDir()
	for name, content := range files {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0600); err != nil {
			t.Fatal(err)
		}
	}
	return dir
}

func TestWordGraph(t *testing.T) {
	g, err := Load(writeFixture(t, fixture(t)))
	if err != nil {
		t.Fatal(err)
	}
	words := g.FindWords("분수")
	if len(words) != 2 || words[0].Word.Hanja != "分數" || words[1].Word.Hanja != "噴水" {
		t.Fatalf("homographs were lost: %+v", words)
	}
	if len(words[0].Components[1].Readings) != 2 {
		t.Fatal("multiple readings of 數 were lost")
	}
	if matches := g.FindWords("噴水"); len(matches) != 1 || matches[0].Word.MeaningEn != "fountain" {
		t.Fatalf("hanja lookup: %+v", matches)
	}
	if parts := g.FindWords("水水")[0].Components; len(parts) != 2 || parts[0].Hanja != "水" || parts[1].Hanja != "水" {
		t.Fatalf("repeated positions were lost: %+v", parts)
	}
	for _, query := range []string{"水", "su-001"} {
		matches := g.FindCharacters(query)
		if len(matches) != 1 || len(matches[0].Words) != 2 {
			t.Fatalf("%s: reverse index duplicated or lost words: %+v", query, matches)
		}
	}
	if matches := g.FindCharacters("수"); len(matches) != 2 {
		t.Fatalf("reading lookup: %+v", matches)
	}
	for _, match := range g.FindCharacters("數") {
		if len(match.Words) != 1 || match.Words[0].Hanja != "分數" {
			t.Fatalf("readings must share glyph edges: %+v", match)
		}
	}
	if stats := g.Stats(); stats.Characters != 4 || stats.CharacterReadings != 5 || stats.Words != 3 || stats.Edges != 5 || stats.ConnectedCharacters != 4 {
		t.Fatalf("incorrect graph statistics: %+v", stats)
	}
	for _, result := range []any{g.FindWords("missing"), g.FindCharacters("missing")} {
		data, _ := json.Marshal(result)
		if string(data) != "[]" {
			t.Fatalf("empty matches must encode as []: %s", data)
		}
	}
}

func TestInvalidDataset(t *testing.T) {
	cases := []struct {
		name, file, want string
		change           func(string) string
	}{
		{"comment", "normal_word.jsonl", ":5:", func(s string) string { return s + "\n// progress\n" }},
		{"trailing object", "meta.jsonl", ":1:", func(s string) string { return strings.Replace(s, "\n", " {}\n", 1) }},
		{"unknown field", "meta.jsonl", "unknown field", func(s string) string { return strings.Replace(s, `"type":`, `"typo":1,"type":`, 1) }},
		{"empty file", "meta.jsonl", "no records", func(string) string { return "\n" }},
		{"invalid UTF8", "meta.jsonl", "invalid UTF-8", func(s string) string { return s + "\xff" }},
		{"duplicate meta", "meta.jsonl", "duplicate meta id", func(s string) string { return s + strings.Split(s, "\n")[0] }},
		{"unknown meta", "character.jsonl", "unknown meta id", func(s string) string { return strings.Replace(s, "bun-000", "unknown-000", 1) }},
		{"duplicate id", "character.jsonl", "duplicate character id", func(s string) string { return strings.Replace(s, "bun-200", "bun-000", 1) }},
		{"duplicate reading", "character.jsonl", "duplicate hanja/reading", func(s string) string { return strings.Replace(s, "噴", "分", 1) }},
		{"bad id", "character.jsonl", "id=<meta>", func(s string) string { return strings.Replace(s, "bun-000", "bun000", 1) }},
		{"missing meaning", "character.jsonl", "nonempty meaning arrays", func(s string) string { return strings.Replace(s, `["divide"]`, `[]`, 1) }},
		{"wrong order", "normal_word.jsonl", "components must reproduce", func(s string) string { return strings.Replace(s, `"分數"`, `"數分"`, 1) }},
		{"unknown component", "normal_word.jsonl", "unknown component", func(s string) string { return strings.ReplaceAll(s, "噴", "火") }},
		{"duplicate word", "normal_word.jsonl", "duplicate word/hanja", func(s string) string { return s + strings.Split(s, "\n")[0] }},
		{"null record", "normal_word.jsonl", "expected level", func(s string) string { return s + "null\n" }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			files := fixture(t)
			files[tc.file] = tc.change(files[tc.file])
			_, err := Load(writeFixture(t, files))
			if err == nil || !strings.Contains(err.Error(), tc.file) || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("wanted %s / %s, got %v", tc.file, tc.want, err)
			}
		})
	}
}

func TestMissingFile(t *testing.T) {
	files := fixture(t)
	delete(files, "character.jsonl")
	_, err := Load(writeFixture(t, files))
	if err == nil || !strings.Contains(err.Error(), "character.jsonl") {
		t.Fatalf("expected missing filename, got %v", err)
	}
}

func TestRepositoryDataset(t *testing.T) {
	g, err := Load(filepath.Join("..", "..", "..", "dataset"))
	if err != nil {
		t.Fatal(err)
	}
	words := g.FindWords("가격")
	if len(words) == 0 || words[0].Word.Hanja != "價格" || len(words[0].Components) != 2 {
		t.Fatalf("expected seed word 가격: %+v", words)
	}
	found := make(map[string]bool)
	for _, match := range g.FindCharacters("家") {
		for _, word := range match.Words {
			found[word.Word] = true
		}
	}
	if !found["가정"] || !found["작가"] {
		t.Fatalf("expected seed connections for 家: %+v", found)
	}
}
