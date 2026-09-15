package graph

import (
	"path/filepath"
	"reflect"
	"testing"
)

func TestNeighborhood(t *testing.T) {
	g, err := Load(filepath.Join("..", "..", "..", "dataset"))
	if err != nil {
		t.Fatal(err)
	}
	n := g.Neighborhood("感覺")
	if !reflect.DeepEqual(n.Roots, []string{"感", "覺"}) {
		t.Fatalf("missing word components: %+v", n.Roots)
	}
	wanted := map[string]bool{"感覺": true, "感情": true, "感謝": true, "感動": true, "共感": true, "視覺": true, "聽覺": true, "自覺": true, "覺悟": true, "感慨": true, "感慨無量": true, "感激": true, "自愧感": true}
	for _, word := range n.Words {
		if !wanted[word.Hanja] {
			t.Errorf("unexpected or duplicated word: %s", word.Hanja)
		}
		delete(wanted, word.Hanja)
	}
	if len(wanted) > 0 {
		t.Fatalf("truncated neighborhood: %+v", wanted)
	}
	characters := map[string]bool{}
	for _, character := range n.Characters {
		if characters[character.Hanja] || len(character.Readings) == 0 {
			t.Fatalf("duplicate or unannotated character: %+v", character)
		}
		characters[character.Hanja] = true
	}
	if len(characters) != 15 || !characters["情"] || !characters["視"] || !characters["慨"] || !characters["激"] || !characters["愧"] || characters["監"] || characters["勵"] || characters["羞"] {
		t.Fatalf("incorrect one-hop boundary: %+v", characters)
	}
	// A longer word retains all of its components, including more distant
	// positions, but does not expand the neighbors' other words.
	long := g.Neighborhood("敢")
	for _, glyph := range []string{"勇", "無", "雙", "焉", "生", "心"} {
		found := false
		for _, character := range long.Characters {
			found = found || character.Hanja == glyph
		}
		if !found {
			t.Errorf("lost %s from a compound word", glyph)
		}
	}
	for _, query := range []string{"降", "hang-200"} {
		n := g.Neighborhood(query)
		if len(n.Roots) != 1 || len(n.Characters[0].Readings) != 2 || len(n.Words) != 5 {
			t.Errorf("multiple readings duplicated the neighborhood: %+v", n)
		}
	}
	missing := g.Neighborhood("missing")
	if missing.Roots == nil || missing.Characters == nil || missing.Words == nil || len(missing.Roots)+len(missing.Characters)+len(missing.Words) != 0 {
		t.Fatal("missing query must return empty arrays")
	}
}

func TestNeighborhoodPreservesWordIdentityAndRepeatedGlyph(t *testing.T) {
	g, err := Load(writeFixture(t, fixture(t)))
	if err != nil {
		t.Fatal(err)
	}
	n := g.Neighborhood("분수")
	if len(n.Roots) != 4 || len(n.Words) != 3 || len(n.Characters) != 4 {
		t.Fatalf("homographs or repeated glyphs lost: %+v", n)
	}
	if !reflect.DeepEqual(n.Words[2].Components, []string{"水", "水"}) {
		t.Fatal("repeated word positions must remain available for loop rendering")
	}
}
