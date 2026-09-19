package graph

import (
	"path/filepath"
	"reflect"
	"strings"
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
	var wanted []Word
	wantedCharacters := map[string]bool{"感": true, "覺": true}
	// Scan the source words independently of the reverse index used by Neighborhood.
	for _, word := range g.words {
		if strings.ContainsAny(word.Hanja, "感覺") {
			wanted = append(wanted, word)
			for _, glyph := range word.Components {
				wantedCharacters[glyph] = true
			}
		}
	}
	if !reflect.DeepEqual(n.Words, wanted) {
		t.Fatalf("incorrect neighborhood words: got %+v, want %+v", n.Words, wanted)
	}
	characters := map[string]bool{}
	for _, character := range n.Characters {
		if characters[character.Hanja] || len(character.Readings) == 0 {
			t.Fatalf("duplicate or unannotated character: %+v", character)
		}
		characters[character.Hanja] = true
	}
	if !reflect.DeepEqual(characters, wantedCharacters) {
		t.Fatalf("incorrect neighborhood characters: got %+v, want %+v", characters, wantedCharacters)
	}
	if !characters["情"] || !characters["視"] || !characters["慨"] || !characters["激"] || !characters["愧"] || !characters["鈍"] || characters["監"] || characters["勵"] || characters["羞"] || characters["愚"] || !characters["淸"] || !characters["涼"] || !characters["諒"] || !characters["解"] || !characters["書"] || characters["荒"] || characters["恕"] || !characters["銘"] || characters["碑"] || characters["墓"] || !characters["侮"] || !characters["辱"] || !characters["蔑"] || !characters["輕"] || !characters["敏"] || characters["銳"] || characters["機"] {
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
	wanted = nil
	for _, word := range g.words {
		if strings.Contains(word.Hanja, "降") {
			wanted = append(wanted, word)
		}
	}
	for _, query := range []string{"降", "hang-200"} {
		n := g.Neighborhood(query)
		if !reflect.DeepEqual(n.Roots, []string{"降"}) || len(n.Characters) == 0 || len(n.Characters[0].Readings) != 2 || !reflect.DeepEqual(n.Words, wanted) {
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
