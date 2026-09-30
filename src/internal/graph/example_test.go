package graph

import (
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"
)

func TestWordExamplesKeepHomographIdentity(t *testing.T) {
	files := fixture(t)
	files["example.jsonl"] = `{"word":"분수","hanja":"分數","example_ko":"분수를 더하는 방법을 배웠어요."}` + "\n" + `{"word":"분수","hanja":"噴水","example_ko":"공원의 분수에서 물이 솟아올라요."}` + "\n"
	g, err := Load(writeFixture(t, files))
	if err != nil {
		t.Fatal(err)
	}
	matches := g.FindWords("분수")
	if len(matches) != 2 || !strings.Contains(matches[0].Example, "더하는") || !strings.Contains(matches[1].Example, "공원") {
		t.Fatalf("examples mixed: %+v", matches)
	}
	data, err := json.Marshal(matches)
	if err != nil || !strings.Contains(string(data), `"example":`) {
		t.Fatalf("JSON example missing: %s %v", data, err)
	}
	if g.FindWords("반복테스트")[0].Example != "" {
		t.Fatal("an optional example leaked into another entry")
	}
}

func TestInvalidWordExamples(t *testing.T) {
	good := `{"word":"분수","hanja":"分數","example_ko":"분수를 배웠어요."}`
	cases := map[string]string{
		"duplicate":       good + "\n" + good,
		"unknown word":    strings.Replace(good, "분수", "없는단어", 1),
		"wrong homograph": strings.Replace(good, "分數", "水分", 1),
		"empty":           strings.Replace(good, "분수를 배웠어요.", " ", 1),
		"multiple lines":  strings.Replace(good, "분수를 배웠어요.", `첫 문장\n다음 문장`, 1),
		"too long":        strings.Replace(good, "분수를 배웠어요.", strings.Repeat("가", 501), 1),
		"unknown field":   strings.Replace(good, `"example_ko"`, `"typo"`, 1),
	}
	for name, content := range cases {
		t.Run(name, func(t *testing.T) {
			files := fixture(t)
			files["example.jsonl"] = content
			if _, err := Load(writeFixture(t, files)); err == nil || !strings.Contains(err.Error(), "example.jsonl:") {
				t.Fatalf("wanted example file error, got %v", err)
			}
		})
	}
}

func TestRepositoryExamplesCoverDictionary(t *testing.T) {
	dir := filepath.Join("..", "..", "..", "dataset")
	g, err := Load(dir)
	if err != nil {
		t.Fatal(err)
	}
	rows, err := readJSONL[WordExample](filepath.Join(dir, "example.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != len(g.words) {
		t.Fatalf("%d examples for %d words", len(rows), len(g.words))
	}
	for i, word := range g.words {
		example := rows[i].value
		if example.Word != word.Word || example.Hanja != word.Hanja {
			t.Fatalf("row %d does not follow dictionary order", i+1)
		}
		if strings.TrimSpace(g.examples[[2]string{word.Word, word.Hanja}]) == "" {
			t.Errorf("missing example: %s %s", word.Word, word.Hanja)
		}
	}
}
