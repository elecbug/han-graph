package graph

import (
	"encoding/json"
	"strings"
	"testing"
)

func russianFixture(t *testing.T) map[string]string {
	t.Helper()
	files := fixture(t)
	files["word.jsonl"] = strings.Replace(files["word.jsonl"], `"meaning_en":"fraction"`, `"meaning_en":"fraction","meaning_ru":"дробь","semantic_hint_en":"A divided number.","semantic_hint_ru":"Число, полученное делением."`, 1)
	files["character.jsonl"] = strings.Replace(files["character.jsonl"], `"meaning_en":["divide"]`, `"meaning_en":["divide"],"meaning_ru":["делить"]`, 1)
	files["example.jsonl"] = `{"word":"분수","hanja":"分數","example_ko":"분수를 배웠어요.","example_en":"I learned fractions.","example_ru":"Я изучал дроби."}` + "\n"
	return files
}

func TestRussianLookupAndSearch(t *testing.T) {
	g, err := Load(writeFixture(t, russianFixture(t)))
	if err != nil {
		t.Fatal(err)
	}
	for _, query := range []string{"дробь", "ДРОБЬ"} {
		result := g.Search(query, 60)
		if result.WordCount != 1 || result.Words[0].Hanja != "分數" {
			t.Fatal("Russian search lost the word identity", result)
		}
	}
	if result := g.Search("ДЕЛИТЬ", 60); result.CharacterCount != 1 {
		t.Fatal(result)
	}
	word := g.FindWords("분수")[0]
	if word.ExampleRu != "Я изучал дроби." || word.Word.SemanticHintEn != "A divided number." || word.Components[0].Readings[0].MeaningRu[0] != "делить" {
		t.Fatal("Russian fields lost in API projection", word)
	}
	data, _ := json.Marshal(word)
	if !strings.Contains(string(data), `"example_ru"`) || !strings.Contains(string(data), `"meaning_ru"`) {
		t.Fatal(string(data))
	}
}

func TestMalformedRussianFields(t *testing.T) {
	for _, tc := range []struct{ file, from, to string }{
		{"word.jsonl", `"meaning_ru":"дробь"`, `"meaning_ru":" "`},
		{"word.jsonl", `"semantic_hint_en":"A divided number."`, `"semantic_hint_en":" bad "`},
		{"character.jsonl", `"meaning_ru":["делить"]`, `"meaning_ru":[]`},
		{"character.jsonl", `"meaning_ru":["делить"]`, `"meaning_ru":["делить","делить"]`},
		{"example.jsonl", `"example_ru":"Я изучал дроби."`, `"example_ru":"Первая.\nВторая."`},
	} {
		t.Run(tc.file+tc.to, func(t *testing.T) {
			files := russianFixture(t)
			files[tc.file] = strings.Replace(files[tc.file], tc.from, tc.to, 1)
			if _, err := Load(writeFixture(t, files)); err == nil || !strings.Contains(err.Error(), tc.file) {
				t.Fatal("expected localized-field validation error", err)
			}
		})
	}
}

func TestPersonalRussianFieldsRoundTrip(t *testing.T) {
	g, err := Load(writeFixture(t, fixture(t)))
	if err != nil {
		t.Fatal(err)
	}
	input := Additions{
		Words:    []Word{{Level: "normal", Word: "수분", Hanja: "水分", MeaningKo: "물기", MeaningEn: "moisture", MeaningRu: "влага", Components: []string{"水", "分"}}},
		Examples: []WordExample{{Word: "수분", Hanja: "水分", ExampleKo: "수분을 보충해요.", ExampleRu: "Восполните запас жидкости."}},
	}
	merged, err := g.WithAdditions(input)
	if err != nil {
		t.Fatal(err)
	}
	if merged.Search("ВЛАГА", 60).WordCount != 1 || merged.FindWords("수분")[0].ExampleRu != input.Examples[0].ExampleRu || g.Search("влага", 60).WordCount != 0 {
		t.Fatal("private Russian dictionary view failed")
	}
	input.Words[0].MeaningRu = "bad\nline"
	if _, err := g.WithAdditions(input); err == nil {
		t.Fatal("invalid private Russian text accepted")
	}
}
