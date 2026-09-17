package graph

import (
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestSearchCategoryBeforeLimit(t *testing.T) {
	g, err := Load(filepath.Join("..", "..", "..", "dataset"))
	if err != nil {
		t.Fatal(err)
	}
	for _, query := range []string{"", "하", "흡연"} {
		for _, sound := range []bool{false, true} {
			search := g.SearchByLevel
			if sound {
				search = g.SearchSoundByLevel
			}
			all := search(query, 10000, "all")
			for _, level := range []string{"normal", "classical"} {
				expected := []Word{}
				for _, word := range all.Words {
					if word.Level == level {
						expected = append(expected, word)
					}
				}
				got := search(query, 1, level)
				if got.WordCount != len(expected) {
					t.Fatalf("%s/%s/%v: count %d != %d", query, level, sound, got.WordCount, len(expected))
				}
				if len(expected) > 1 {
					expected = expected[:1]
				}
				if !reflect.DeepEqual(got.Words, expected) {
					t.Fatalf("category must be applied before limit: %+v", got)
				}
				for _, c := range got.Characters {
					connected := false
					for _, entry := range g.FindCharacters(c.Hanja) {
						for _, word := range entry.Words {
							connected = connected || word.Level == level
						}
					}
					if !connected {
						t.Fatalf("character %s has no %s words", c.Hanja, level)
					}
				}
			}
		}
	}
	for _, level := range []string{"normal", "classical"} {
		got := g.SearchByLevel("흡연", 60, level)
		if got.WordCount != 1 || got.Words[0].Level != level {
			t.Fatalf("homographs must be filtered independently: %+v", got)
		}
	}
}

func TestRandomCategoryAndSingleton(t *testing.T) {
	files := fixture(t)
	files["word.jsonl"] = strings.Replace(files["word.jsonl"], `"level":"normal"`, `"level":"classical"`, 1)
	g, err := Load(writeFixture(t, files))
	if err != nil {
		t.Fatal(err)
	}
	for range 20 {
		word, ok := g.RandomWordByLevel("분수", "分數", "classical")
		if !ok || word.Hanja != "分數" {
			t.Fatalf("singleton category: %+v", word)
		}
		word, ok = g.RandomWordByLevel("분수", "噴水", "normal")
		if !ok || word.Hanja != "水水" {
			t.Fatalf("exclude within category: %+v", word)
		}
	}
	if _, ok := g.RandomWordByLevel("", "", "missing"); ok {
		t.Fatal("empty category returned a word")
	}
}
