package graph

import (
	"errors"
	"reflect"
	"testing"
)

func personalFixture() Additions {
	// Synthetic forms exercise graph structure, not learning content.
	return Additions{
		Meta:       []Meta{{Type: "meta", ID: "han", SoundKo: "한", SoundEn: "han"}},
		Characters: []Character{{Type: "character", ID: "han-9000", Hanja: "漢", MeaningKo: []string{"한"}, MeaningEn: []string{"Han"}}},
		Words:      []Word{{Level: "hard", Word: "분한", Hanja: "分漢", MeaningKo: "개인 테스트", MeaningEn: "private fixture", Components: []string{"分", "漢"}}, {Level: "easy", Word: "분수", Hanja: "分水", MeaningKo: "개인 동음 표제어", MeaningEn: "private homograph", Components: []string{"分", "水"}}},
		Examples:   []WordExample{{Word: "분한", Hanja: "分漢", ExampleKo: "분한의 개인 예문이에요.", ExampleEn: "A private example."}},
	}
}
func TestPersonalGraphBlendsWithoutMutatingPublicGraph(t *testing.T) {
	base, err := Load(writeFixture(t, fixture(t)))
	if err != nil {
		t.Fatal(err)
	}
	original := base.Stats()
	private, err := base.WithAdditions(personalFixture())
	if err != nil {
		t.Fatal(err)
	}
	if len(private.FindWords("분수")) != 3 || len(base.FindWords("분수")) != 2 {
		t.Fatal("homographs were lost or leaked")
	}
	if base.Stats() != original || len(base.FindWords("분한")) != 0 || len(base.FindCharacters("漢")) != 0 {
		t.Fatal("public graph changed")
	}
	word := private.FindWords("분한")[0]
	if word.ExampleEn != "A private example." || word.Components[1].Readings[0].SoundKo != "한" {
		t.Fatalf("missing private detail: %+v", word)
	}
	if got := private.Neighborhood("分"); len(got.Words) != 3 {
		t.Fatalf("mixed neighborhood: %+v", got)
	}
	if got := private.Neighborhood("漢"); len(got.Roots) != 1 || len(got.Words) != 1 {
		t.Fatalf("new character graph: %+v", got)
	}
	if got := private.SearchSoundByLevel("한", 60, "hard"); got.WordCount != 1 || got.CharacterCount != 1 {
		t.Fatalf("sound search: %+v", got)
	}
	if got := private.SearchByLevel("개인", 60, "easy"); got.WordCount != 1 {
		t.Fatalf("level search: %+v", got)
	}
	if got := private.Stats(); got.Words != original.Words+2 || got.Characters != original.Characters+1 {
		t.Fatal(got)
	}
	other, err := base.WithAdditions(Additions{Words: []Word{{Level: "normal", Word: "수분", Hanja: "水分", MeaningKo: "독립", MeaningEn: "independent", Components: []string{"水", "分"}}}})
	if err != nil || len(other.FindWords("분한")) != 0 {
		t.Fatal("account views mixed", err)
	}
	if !reflect.DeepEqual(base.FindWords("분수")[0].Word.Components, []string{"分", "數"}) {
		t.Fatal("base slices changed")
	}
}
func TestPersonalGraphRejectsInvalidRecordsAndPublicOverrides(t *testing.T) {
	base, err := Load(writeFixture(t, fixture(t)))
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		name      string
		edit      func(*Additions)
		duplicate bool
	}{
		{"public word", func(a *Additions) { a.Words[0] = base.FindWords("분수")[0].Word }, true},
		{"unknown component", func(a *Additions) { a.Characters = nil }, false},
		{"unknown sound", func(a *Additions) { a.Meta = nil }, false},
		{"public character id", func(a *Additions) { a.Characters[0].ID = "bun-000" }, true},
		{"public reading", func(a *Additions) { a.Characters[0].ID = "bun-9000"; a.Characters[0].Hanja = "分" }, true},
		{"public sound", func(a *Additions) { a.Meta[0].ID = "bun" }, true},
		{"glyph control", func(a *Additions) { a.Characters[0].Hanja = "\n" }, false},
		{"not a Han glyph", func(a *Additions) { a.Characters[0].Hanja = "가" }, false},
		{"bad form", func(a *Additions) { a.Words[0].Components = []string{"漢", "分"} }, false},
		{"missing level", func(a *Additions) { a.Words[0].Level = "" }, false},
		{"missing components", func(a *Additions) { a.Words[0].Components = nil }, false},
		{"whitespace", func(a *Additions) { a.Words[0].Word = " 분한" }, false},
		{"control character", func(a *Additions) { a.Words[0].MeaningEn = "a\nb" }, false},
		{"example of public word", func(a *Additions) { a.Examples[0].Word = "분수"; a.Examples[0].Hanja = "分數" }, false},
		{"duplicate example", func(a *Additions) { a.Examples = append(a.Examples, a.Examples[0]) }, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			a := personalFixture()
			tc.edit(&a)
			_, err := base.WithAdditions(a)
			var input *InputError
			if !errors.As(err, &input) || input.Duplicate != tc.duplicate {
				t.Fatalf("error=%v", err)
			}
		})
	}
}
func TestNewReadingAndStandaloneCharacterAreSupported(t *testing.T) {
	base, err := Load(writeFixture(t, fixture(t)))
	if err != nil {
		t.Fatal(err)
	}
	merged, err := base.WithAdditions(Additions{Meta: []Meta{{Type: "meta", ID: "han", SoundKo: "한", SoundEn: "han"}}, Characters: []Character{{Type: "character", ID: "han-9000", Hanja: "分", MeaningKo: []string{"독음 테스트"}, MeaningEn: []string{"reading fixture"}}, {Type: "character", ID: "han-9001", Hanja: "漢", MeaningKo: []string{"한"}, MeaningEn: []string{"Han"}}}})
	if err != nil {
		t.Fatal(err)
	}
	if len(merged.FindCharacters("分")) != 2 || len(base.FindCharacters("分")) != 1 {
		t.Fatal("new reading missing or public mutated")
	}
	if got := merged.Neighborhood("漢"); len(got.Roots) != 1 || len(got.Characters) != 1 || len(got.Words) != 0 {
		t.Fatal(got)
	}
}
