package graph

import (
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestSearch(t *testing.T) {
	g, err := Load(filepath.Join("..", "..", "..", "dataset"))
	if err != nil {
		t.Fatal(err)
	}
	for _, query := range []string{"家", "가정", "household", "가족이"} {
		results := g.Search(query, 60)
		found := false
		for _, word := range results.Words {
			if word.Word == "가정" && word.Hanja == "家庭" {
				found = true
			}
		}
		if !found {
			t.Fatalf("query %q did not find 家庭", query)
		}
	}
	if results := g.Search(" PRICE ", 60); len(results.Words) == 0 || results.Words[0].Word != "가격" {
		t.Fatalf("case folding and trimming: %+v", results)
	}
	if results := g.Search("", 2); len(results.Words) != 2 || len(results.Characters) != 2 || results.WordCount <= 2 || results.CharacterCount <= 2 {
		t.Fatalf("limits and totals: %+v", results)
	}
	if results := g.Search("no-such-word", 60); results.WordCount != 0 || results.CharacterCount != 0 {
		t.Fatalf("empty search: %+v", results)
	}
	if results := g.Search("ga-005", 60); len(results.Characters) != 1 || results.Characters[0].Hanja != "家" {
		t.Fatalf("id lookup: %+v", results)
	}
}

func TestSearchPreservesHomographs(t *testing.T) {
	g, err := Load(writeFixture(t, fixture(t)))
	if err != nil {
		t.Fatal(err)
	}
	if results := g.Search("분수", 60); len(results.Words) != 2 {
		t.Fatalf("homographs lost: %+v", results)
	}
}

func TestSearchSoundExcludesMeaningMatches(t *testing.T) {
	g, err := Load(filepath.Join("..", "..", "..", "dataset"))
	if err != nil {
		t.Fatal(err)
	}
	result := g.SearchSound("하", 10000)
	for _, glyph := range []string{"下", "何", "夏", "河"} {
		found := false
		for _, character := range result.Characters {
			found = found || character.Hanja == glyph
		}
		if !found {
			t.Errorf("missing 하 character %s", glyph)
		}
	}
	for _, character := range result.Characters {
		if character.SoundKo != "하" {
			t.Errorf("meaning or partial reading matched: %+v", character)
		}
	}
	if len(result.Characters) != len(g.FindCharacters("하")) || result.CharacterCount != len(result.Characters) {
		t.Fatal("exact reading results or totals differ")
	}
	found := map[string]bool{}
	for _, word := range result.Words {
		if !strings.Contains(word.Word, "하") {
			t.Errorf("meaning-only word matched: %+v", word)
		}
		found[word.Hanja] = true
	}
	for _, hanja := range []string{"下降", "却下", "閣下", "幾何學"} {
		if !found[hanja] {
			t.Errorf("missing pronounced 하 word %s", hanja)
		}
	}
	if found["家庭"] || found["假說"] || found["作家"] {
		t.Fatal("words matched only because their definitions contain 하")
	}
	if result.WordCount != len(result.Words) || g.Search("하", 10000).CharacterCount <= result.CharacterCount {
		t.Fatal("totals or full-search behavior changed")
	}
	if romanized := g.SearchSound(" HA ", 10000); !reflect.DeepEqual(romanized, result) {
		t.Fatal("romanized reading must match the same Hangul sound, ignoring case and whitespace")
	}
	limited := g.SearchSound("하", 1)
	if len(limited.Words) != 1 || len(limited.Characters) != 1 || limited.WordCount != result.WordCount || limited.CharacterCount != result.CharacterCount {
		t.Fatal("sound search limits must retain full counts")
	}
	if !reflect.DeepEqual(g.SearchSound("하", 0), g.SearchSound("하", 60)) {
		t.Fatal("default limit changed")
	}
	if !reflect.DeepEqual(g.SearchSound("  ", 2), g.Search("", 2)) {
		t.Fatal("clearing sound search must restore browsing")
	}
	for _, query := range []string{"하다", "下", "ha-000", "h", "missing"} {
		if result := g.SearchSound(query, 60); result.WordCount != 0 || result.CharacterCount != 0 || result.Words == nil || result.Characters == nil {
			t.Errorf("%q should not match meanings, IDs, glyphs, or partial readings: %+v", query, result)
		}
	}
}

func TestSearchSoundPreservesHomographsWithoutMatchingOtherGlyphReadings(t *testing.T) {
	g, err := Load(writeFixture(t, fixture(t)))
	if err != nil {
		t.Fatal(err)
	}
	result := g.SearchSound("수", 60)
	if len(result.Words) != 2 || result.Words[0].Hanja != "分數" || result.Words[1].Hanja != "噴水" {
		t.Fatalf("homographs lost or shared-glyph words included: %+v", result)
	}
	result = g.SearchSound("삭", 60)
	if result.CharacterCount != 1 || result.Characters[0].Hanja != "數" || result.WordCount != 0 {
		t.Fatalf("分數 must not match the alternative 삭 reading of 數: %+v", result)
	}
}
