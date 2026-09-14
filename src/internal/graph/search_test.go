package graph

import (
	"path/filepath"
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
