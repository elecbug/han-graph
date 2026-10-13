package graph

import (
	"fmt"
	"maps"
	"slices"
	"strings"
	"unicode"
	"unicode/utf8"
)

// Additions uses the same records as the public JSONL files. It never changes
// the public graph; each account receives a separate, immutable view.
type Additions struct {
	Meta       []Meta        `json:"meta"`
	Characters []Character   `json:"characters"`
	Words      []Word        `json:"words"`
	Examples   []WordExample `json:"examples"`
}

func (a Additions) Empty() bool {
	return len(a.Meta)+len(a.Characters)+len(a.Words)+len(a.Examples) == 0
}
func (a Additions) Arrays() Additions {
	if a.Meta == nil {
		a.Meta = []Meta{}
	}
	if a.Characters == nil {
		a.Characters = []Character{}
	}
	if a.Words == nil {
		a.Words = []Word{}
	}
	if a.Examples == nil {
		a.Examples = []WordExample{}
	}
	return a
}

type InputError struct {
	Field     string
	Index     int
	Message   string
	Duplicate bool
}

func (e *InputError) Error() string { return fmt.Sprintf("%s[%d]: %s", e.Field, e.Index+1, e.Message) }
func personalText(s string, max int, required bool) bool {
	return utf8.ValidString(s) && strings.TrimSpace(s) == s && (!required || s != "") && utf8.RuneCountInString(s) <= max && strings.IndexFunc(s, unicode.IsControl) == -1
}
func personalMeanings(values []string) bool {
	if len(values) == 0 || len(values) > 20 {
		return false
	}
	seen := map[string]bool{}
	for _, v := range values {
		if !personalText(v, 200, true) || seen[v] {
			return false
		}
		seen[v] = true
	}
	return true
}

// WithAdditions validates all references before building the merged indexes.
// Existing public identities cannot be replaced, including their examples.
func (g *Graph) WithAdditions(a Additions) (*Graph, error) {
	if a.Empty() {
		return g, nil
	}
	next := &Graph{meta: maps.Clone(g.meta), characters: make(map[string][]Character, len(g.characters)), characterOrder: slices.Clone(g.characterOrder), words: slices.Clone(g.words), examples: maps.Clone(g.examples), wordsByQuery: make(map[string][]int), wordsByCharacter: make(map[string][]int)}
	if next.examples == nil {
		next.examples = make(map[[2]string]WordExample)
	}
	for glyph, cs := range g.characters {
		next.characters[glyph] = slices.Clone(cs)
	}
	fail := func(field string, index int, message string, duplicate bool) (*Graph, error) {
		return nil, &InputError{field, index, message, duplicate}
	}
	for i, m := range a.Meta {
		if m.Type != "meta" || !metaID.MatchString(m.ID) || len(m.ID) > 32 || !personalText(m.SoundKo, 10, true) || !personalText(m.SoundEn, 32, true) {
			return fail("meta", i, "use type=meta, a lowercase Latin id, sound_ko and sound_en", false)
		}
		if _, ok := next.meta[m.ID]; ok {
			return fail("meta", i, "id already exists: "+m.ID, true)
		}
		next.meta[m.ID] = m
	}
	ids := map[string]bool{}
	readings := map[[2]string]bool{}
	for _, c := range g.characterOrder {
		ids[c.ID] = true
		readings[[2]string{c.Hanja, c.ID[:strings.LastIndexByte(c.ID, '-')]}] = true
	}
	for i, c := range a.Characters {
		parts := characterID.FindStringSubmatch(c.ID)
		glyph := []rune(c.Hanja)
		if c.Type != "character" || parts == nil || len(c.ID) > 48 || len(glyph) != 1 || !unicode.Is(unicode.Han, glyph[0]) || !personalMeanings(c.MeaningKo) || !personalMeanings(c.MeaningEn) {
			return fail("characters", i, "use type=character, id=<meta>-<3+ digits>, one Han character and nonempty meaning arrays", false)
		}
		if _, ok := next.meta[parts[1]]; !ok {
			return fail("characters", i, "unknown sound group: "+parts[1]+"; add it in meta", false)
		}
		if ids[c.ID] {
			return fail("characters", i, "id already exists: "+c.ID, true)
		}
		key := [2]string{c.Hanja, parts[1]}
		if readings[key] {
			return fail("characters", i, "character/reading already exists: "+c.Hanja+"/"+parts[1], true)
		}
		ids[c.ID] = true
		readings[key] = true
		next.characters[c.Hanja] = append(next.characters[c.Hanja], c)
		next.characterOrder = append(next.characterOrder, c)
	}
	refs := map[[2]string]bool{}
	privateRefs := map[[2]string]bool{}
	for _, w := range g.words {
		refs[[2]string{w.Word, w.Hanja}] = true
	}
	for i, w := range a.Words {
		if !ValidWordLevel(w.Level) || !personalText(w.Word, 100, true) || !personalText(w.Hanja, 100, false) || !personalText(w.MeaningKo, 2000, true) || !personalText(w.MeaningEn, 2000, true) || !personalText(w.SemanticHint, 2000, false) || w.Components == nil {
			return fail("words", i, "use a valid level, word, Korean/English meanings and a components array", false)
		}
		if err := validateWordForm(w); err != nil {
			return fail("words", i, err.Error(), false)
		}
		key := [2]string{w.Word, w.Hanja}
		if refs[key] {
			return fail("words", i, "word/hanja already exists: "+w.Word+"/"+w.Hanja, true)
		}
		for _, c := range w.Components {
			if len(next.characters[c]) == 0 {
				return fail("words", i, "unknown component: "+c+"; add it in characters", false)
			}
		}
		refs[key] = true
		privateRefs[key] = true
		next.words = append(next.words, w)
	}
	for i, e := range a.Examples {
		key := [2]string{e.Word, e.Hanja}
		if !privateRefs[key] {
			return fail("examples", i, "examples must reference a word in your personal dictionary", false)
		}
		if _, ok := next.examples[key]; ok {
			return fail("examples", i, "word example already exists: "+e.Word+"/"+e.Hanja, true)
		}
		if !personalText(e.ExampleKo, 500, true) || !personalText(e.ExampleEn, 500, false) {
			return fail("examples", i, "use a single Korean sentence and optional English translation, each at most 500 characters", false)
		}
		next.examples[key] = e
	}
	// Stable sorting keeps public homograph order while merging private entries.
	slices.SortStableFunc(next.words, func(a, b Word) int { return strings.Compare(a.Word, b.Word) })
	for i, w := range next.words {
		next.wordsByQuery[w.Word] = append(next.wordsByQuery[w.Word], i)
		if w.Hanja != "" && w.Hanja != w.Word {
			next.wordsByQuery[w.Hanja] = append(next.wordsByQuery[w.Hanja], i)
		}
		seen := map[string]bool{}
		for _, c := range w.Components {
			if !seen[c] {
				next.wordsByCharacter[c] = append(next.wordsByCharacter[c], i)
				seen[c] = true
			}
		}
	}
	return next, nil
}
