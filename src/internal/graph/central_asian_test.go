package graph

import (
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"

	"golang.org/x/text/unicode/norm"
)

func TestPublicTranslationsAreComplete(t *testing.T) {
	g, err := Load(filepath.Join("..", "..", "..", "dataset"))
	if err != nil {
		t.Fatal(err)
	}
	for _, character := range g.characterOrder {
		for _, values := range [][]string{character.MeaningRu, character.MeaningUz, character.MeaningKy, character.MeaningZh, character.MeaningJa, character.MeaningEs, character.MeaningVi} {
			if !meanings(values) {
				t.Fatalf("%s: missing translated character meanings", character.ID)
			}
		}
	}
	for _, word := range g.words {
		if !nonempty(word.MeaningRu, word.MeaningUz, word.MeaningKy, word.MeaningZh, word.MeaningJa, word.MeaningEs, word.MeaningVi) {
			t.Fatalf("%s/%s: missing translated word meaning", word.Word, word.Hanja)
		}
		if word.SemanticHint != "" && !nonempty(word.SemanticHintEn, word.SemanticHintRu, word.SemanticHintUz, word.SemanticHintKy, word.SemanticHintZh, word.SemanticHintJa, word.SemanticHintEs, word.SemanticHintVi) {
			t.Fatalf("%s/%s: missing translated composition hint", word.Word, word.Hanja)
		}
		example := g.examples[[2]string{word.Word, word.Hanja}]
		if !nonempty(example.ExampleEn, example.ExampleRu, example.ExampleUz, example.ExampleKy, example.ExampleZh, example.ExampleJa, example.ExampleEs, example.ExampleVi) {
			t.Fatalf("%s/%s: missing translated example", word.Word, word.Hanja)
		}
	}
}

func centralAsianFixture(t *testing.T) map[string]string {
	t.Helper()
	files := fixture(t)
	files["word.jsonl"] = strings.Replace(files["word.jsonl"], `"meaning_en":"fraction"`, `"meaning_en":"fraction","meaning_uz":"kasr; boʻlingan son","meaning_ky":"бөлчөк","semantic_hint_uz":"Boʻlingan son.","semantic_hint_ky":"Бөлүнгөн сан."`, 1)
	files["character.jsonl"] = strings.Replace(files["character.jsonl"], `"meaning_en":["divide"]`, `"meaning_en":["divide"],"meaning_uz":["boʻlmoq"],"meaning_ky":["бөлүү"]`, 1)
	files["example.jsonl"] = `{"word":"분수","hanja":"分數","example_ko":"분수를 배웠어요.","example_uz":"Men kasrlarni oʻrgandim.","example_ky":"Мен бөлчөктөрдү үйрөндүм."}` + "\n"
	return files
}

func TestCentralAsianSearchAndProjection(t *testing.T) {
	g, err := Load(writeFixture(t, centralAsianFixture(t)))
	if err != nil {
		t.Fatal(err)
	}
	for _, query := range []string{"BO'LINGAN", "bo‘lingan", "boʻlingan", "БӨЛЧӨК"} {
		result := g.Search(query, 60)
		if result.WordCount != 1 || result.Words[0].Hanja != "分數" {
			t.Fatalf("search %q: %+v", query, result)
		}
	}
	for _, query := range []string{"bo'lmoq", "БӨЛҮҮ"} {
		if g.Search(query, 60).CharacterCount != 1 {
			t.Fatal("character translation not searchable", query)
		}
	}
	word := g.FindWords("분수")[0]
	if word.ExampleUz != "Men kasrlarni oʻrgandim." || word.ExampleKy != "Мен бөлчөктөрдү үйрөндүм." || word.Components[0].Readings[0].MeaningKy[0] != "бөлүү" {
		t.Fatal("translated fields lost in projection", word)
	}
	data, _ := json.Marshal(word)
	for _, key := range []string{"meaning_uz", "meaning_ky", "example_uz", "example_ky", "semantic_hint_uz", "semantic_hint_ky"} {
		if !strings.Contains(string(data), `"`+key+`"`) {
			t.Fatal("missing JSON field", key)
		}
	}
}

func TestMalformedCentralAsianTranslations(t *testing.T) {
	for _, tc := range []struct{ file, from, to string }{
		{"word.jsonl", `"meaning_ky":"бөлчөк"`, `"meaning_ky":" "`},
		{"word.jsonl", `"semantic_hint_uz":"Boʻlingan son."`, `"semantic_hint_uz":" bad "`},
		{"character.jsonl", `"meaning_uz":["boʻlmoq"]`, `"meaning_uz":[]`},
		{"character.jsonl", `"meaning_ky":["бөлүү"]`, `"meaning_ky":["бөлүү","бөлүү"]`},
		{"example.jsonl", `"example_ky":"Мен бөлчөктөрдү үйрөндүм."`, `"example_ky":"Бир.\nЭки."`},
	} {
		t.Run(tc.file+tc.to, func(t *testing.T) {
			files := centralAsianFixture(t)
			files[tc.file] = strings.Replace(files[tc.file], tc.from, tc.to, 1)
			if _, err := Load(writeFixture(t, files)); err == nil {
				t.Fatal("malformed translated field accepted")
			}
		})
	}
}

func TestPrivateCentralAsianTranslations(t *testing.T) {
	g, err := Load(writeFixture(t, fixture(t)))
	if err != nil {
		t.Fatal(err)
	}
	input := Additions{
		Words: []Word{{
			Level: "normal", Word: "수분", Hanja: "水分", Components: []string{"水", "分"},
			MeaningKo: "물기", MeaningEn: "moisture", MeaningUz: "namlik", MeaningKy: "нымдуулук",
			MeaningZh: "水分；湿气", MeaningJa: "水分・みずけ", MeaningEs: "humedad", MeaningVi: "độ ẩm",
		}},
		Examples: []WordExample{{
			Word: "수분", Hanja: "水分", ExampleKo: "수분을 보충해요.", ExampleUz: "Suv iching.", ExampleKy: "Суу ичиңиз.",
			ExampleZh: "补充水分。", ExampleJa: "水分を補給します。", ExampleEs: "Me hidrato.", ExampleVi: "Tôi bổ sung nước.",
		}},
	}
	view, err := g.WithAdditions(input)
	if err != nil {
		t.Fatal(err)
	}
	if view.Search("NYMLIK", 60).WordCount != 0 || view.Search("NAMLIK", 60).WordCount != 1 || view.Search("НЫМДУУЛУК", 60).WordCount != 1 || g.Search("namlik", 60).WordCount != 0 {
		t.Fatal("private translations not isolated/searchable")
	}
	for _, query := range []string{"湿气", "みずけ", "HUMEDAD", norm.NFD.String("ĐỘ ẨM")} {
		if view.Search(query, 60).WordCount != 1 || g.Search(query, 60).WordCount != 0 {
			t.Fatalf("private translation search for %q", query)
		}
	}
	result := view.FindWords("수분")[0]
	if result.ExampleKy != "Суу ичиңиз." || result.ExampleZh != "补充水分。" || result.ExampleJa != "水分を補給します。" || result.ExampleEs != "Me hidrato." || result.ExampleVi != "Tôi bổ sung nước." {
		t.Fatal("private translated example lost")
	}
}

func TestTranslatedCharacterSearch(t *testing.T) {
	files := fixture(t)
	files["character.jsonl"] = strings.Replace(files["character.jsonl"], `"meaning_en":["divide"]`, `"meaning_en":["divide"],"meaning_zh":["划分"],"meaning_ja":["分ける"],"meaning_es":["división"],"meaning_vi":["phân chia"]`, 1)
	g, err := Load(writeFixture(t, files))
	if err != nil {
		t.Fatal(err)
	}
	for _, query := range []string{"划分", "分ける", norm.NFD.String("DIVISIÓN"), norm.NFD.String("PHÂN CHIA")} {
		if result := g.Search(query, 60); result.CharacterCount != 1 {
			t.Fatalf("expected one character for %q, got %d", query, result.CharacterCount)
		}
	}
}
