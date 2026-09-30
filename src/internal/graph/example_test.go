package graph

import (
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"
)

func TestWordExamplesKeepHomographIdentity(t *testing.T) {
	files := fixture(t)
	files["example.jsonl"] = `{"word":"분수","hanja":"分數","example_ko":"분수를 더하는 방법을 배웠어요.","example_en":"I learned how to add fractions."}` + "\n" + `{"word":"분수","hanja":"噴水","example_ko":"공원의 분수에서 물이 솟아올라요.","example_en":"Water rises from the fountain in the park."}` + "\n"
	g, err := Load(writeFixture(t, files))
	if err != nil {
		t.Fatal(err)
	}
	matches := g.FindWords("분수")
	if len(matches) != 2 || !strings.Contains(matches[0].Example, "더하는") || !strings.Contains(matches[1].Example, "공원") {
		t.Fatalf("examples mixed: %+v", matches)
	}
	if matches[0].ExampleEn != "I learned how to add fractions." || matches[1].ExampleEn != "Water rises from the fountain in the park." {
		t.Fatalf("English examples mixed: %+v", matches)
	}
	data, err := json.Marshal(matches)
	if err != nil || !strings.Contains(string(data), `"example":`) || !strings.Contains(string(data), `"example_en":`) {
		t.Fatalf("JSON example missing: %s %v", data, err)
	}
	if match := g.FindWords("반복테스트")[0]; match.Example != "" || match.ExampleEn != "" {
		t.Fatal("an optional example leaked into another entry")
	}
}

func TestInvalidWordExamples(t *testing.T) {
	good := `{"word":"분수","hanja":"分數","example_ko":"분수를 배웠어요."}`
	cases := map[string]string{
		"duplicate":         good + "\n" + good,
		"unknown word":      strings.Replace(good, "분수", "없는단어", 1),
		"wrong homograph":   strings.Replace(good, "分數", "水分", 1),
		"empty":             strings.Replace(good, "분수를 배웠어요.", " ", 1),
		"multiple lines":    strings.Replace(good, "분수를 배웠어요.", `첫 문장\n다음 문장`, 1),
		"too long":          strings.Replace(good, "분수를 배웠어요.", strings.Repeat("가", 501), 1),
		"blank English":     strings.Replace(good, "}", `,"example_en":" "}`, 1),
		"multiline English": strings.Replace(good, "}", `,"example_en":"First.\nSecond."}`, 1),
		"long English":      strings.Replace(good, "}", `,"example_en":"`+strings.Repeat("a", 501)+`"}`, 1),
		"unknown field":     strings.Replace(good, `"example_ko"`, `"typo"`, 1),
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
		if stored := g.examples[[2]string{word.Word, word.Hanja}]; strings.TrimSpace(stored.ExampleKo) == "" || strings.TrimSpace(stored.ExampleEn) == "" {
			t.Errorf("missing example: %s %s", word.Word, word.Hanja)
		}
	}
}

func TestLegacyWordExampleWithoutEnglish(t *testing.T) {
	files := fixture(t)
	files["example.jsonl"] = `{"word":"분수","hanja":"分數","example_ko":"분수를 배웠어요."}`
	g, err := Load(writeFixture(t, files))
	if err != nil {
		t.Fatal(err)
	}
	match := g.FindWords("분수")[0]
	if match.Example != "분수를 배웠어요." || match.ExampleEn != "" {
		t.Fatalf("legacy example changed: %+v", match)
	}
	data, err := json.Marshal(match)
	if err != nil || strings.Contains(string(data), `"example_en"`) {
		t.Fatalf("missing translation must be omitted: %s %v", data, err)
	}
}
