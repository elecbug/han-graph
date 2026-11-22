package graph

import (
	"math/rand/v2"
	"slices"
	"strings"
	"unicode"

	"golang.org/x/text/unicode/norm"
)

// ReadingGroups returns the public/account view's registered sound groups.
func (g *Graph) ReadingGroups() []Meta {
	groups := make([]Meta, 0, len(g.meta))
	for _, group := range g.meta {
		groups = append(groups, group)
	}
	slices.SortFunc(groups, func(a, b Meta) int { return strings.Compare(a.SoundKo, b.SoundKo) })
	return groups
}

// Graph is a bipartite graph of hanja glyphs and (word, hanja) entries.
// Reading records remain separate metadata, so a glyph can have several sounds.
type Graph struct {
	meta             map[string]Meta
	characters       map[string][]Character
	characterOrder   []Character
	words            []Word
	wordsByQuery     map[string][]int
	wordsByCharacter map[string][]int
	examples         map[[2]string]WordExample
}

type Stats struct {
	Meta                int `json:"meta"`
	CharacterReadings   int `json:"character_readings"`
	Characters          int `json:"characters"`
	Words               int `json:"words"`
	Edges               int `json:"edges"`
	ConnectedCharacters int `json:"connected_characters"`
}

type Reading struct {
	Character
	SoundKo string `json:"sound_ko"`
	SoundEn string `json:"sound_en"`
}

type Component struct {
	Hanja    string    `json:"hanja"`
	Readings []Reading `json:"readings"`
}

type WordSense struct {
	Example   string `json:"example,omitempty"`
	ExampleEn string `json:"example_en,omitempty"`
	ExampleRu string `json:"example_ru,omitempty"`
	ExampleUz string `json:"example_uz,omitempty"`
	ExampleKy string `json:"example_ky,omitempty"`
	ExampleZh string `json:"example_zh,omitempty"`
	ExampleJa string `json:"example_ja,omitempty"`
	ExampleEs string `json:"example_es,omitempty"`
	ExampleVi string `json:"example_vi,omitempty"`
	ExampleNe string `json:"example_ne,omitempty"`
	ExampleMn string `json:"example_mn,omitempty"`
	ExampleTh string `json:"example_th,omitempty"`
	Word      Word   `json:"word"`
}

type WordResult struct {
	WordSense
	Components []Component `json:"components"`
}

type CharacterResult struct {
	Reading
	Words []Word `json:"words"`
}

func (g *Graph) Stats() Stats {
	edges := 0
	for _, words := range g.wordsByCharacter {
		edges += len(words)
	}
	return Stats{len(g.meta), len(g.characterOrder), len(g.characters), len(g.words), edges, len(g.wordsByCharacter)}
}

// RandomWord samples the entire dataset, excluding the exact current entry when
// another word is available. Words with the same Hangul remain distinct choices.
func (g *Graph) RandomWord(excludeWord, excludeHanja string) (Word, bool) {
	return g.RandomWordByLevel(excludeWord, excludeHanja, "")
}

// RandomWordByLevel samples the selected category before excluding the current
// entry. A singleton category still returns its only word.
func (g *Graph) RandomWordByLevel(excludeWord, excludeHanja, level string) (Word, bool) {
	candidates := make([]int, 0)
	excluded := -1
	for index, word := range g.words {
		if !matchesLevel(word, level) {
			continue
		}
		if word.Word == excludeWord && word.Hanja == excludeHanja {
			excluded = index
		} else {
			candidates = append(candidates, index)
		}
	}
	if len(candidates) > 0 {
		return g.words[candidates[rand.IntN(len(candidates))]], true
	}
	if excluded >= 0 {
		return g.words[excluded], true
	}
	return Word{}, false
}

func matchesLevel(word Word, level string) bool {
	return level == "" || level == "all" || word.Level == level
}

func (g *Graph) hasLevelWords(glyph, level string) bool {
	if level == "" || level == "all" {
		return true
	}
	for _, index := range g.wordsByCharacter[glyph] {
		if matchesLevel(g.words[index], level) {
			return true
		}
	}
	return false
}

func (g *Graph) reading(c Character) Reading {
	m := g.meta[c.ID[:strings.LastIndexByte(c.ID, '-')]]
	return Reading{c, m.SoundKo, m.SoundEn}
}

func (g *Graph) wordWithExample(w Word) WordSense {
	example := g.examples[[2]string{w.Word, w.Hanja}]
	return WordSense{
		Word: w, Example: example.ExampleKo, ExampleEn: example.ExampleEn, ExampleRu: example.ExampleRu,
		ExampleUz: example.ExampleUz, ExampleKy: example.ExampleKy, ExampleZh: example.ExampleZh,
		ExampleJa: example.ExampleJa, ExampleEs: example.ExampleEs, ExampleVi: example.ExampleVi,
		ExampleNe: example.ExampleNe, ExampleMn: example.ExampleMn, ExampleTh: example.ExampleTh,
	}
}

// FindWords returns every exact Hangul or hanja match, preserving homographs.
func (g *Graph) FindWords(query string) []WordResult {
	results := make([]WordResult, 0)
	for _, index := range g.wordsByQuery[query] {
		w := g.words[index]
		result := WordResult{WordSense: g.wordWithExample(w), Components: make([]Component, 0, len(w.Components))}
		for _, hanja := range w.Components {
			component := Component{Hanja: hanja, Readings: make([]Reading, 0)}
			for _, c := range g.characters[hanja] {
				component.Readings = append(component.Readings, g.reading(c))
			}
			result.Components = append(result.Components, component)
		}
		results = append(results, result)
	}
	return results
}

// FindCharacters accepts a glyph, character ID, or Korean reading.
// All readings of a glyph share its word edges; no pronunciation is guessed.
func (g *Graph) FindCharacters(query string) []CharacterResult {
	results := make([]CharacterResult, 0)
	for _, c := range g.characterOrder {
		r := g.reading(c)
		if c.Hanja != query && c.ID != query && r.SoundKo != query {
			continue
		}
		result := CharacterResult{Reading: r, Words: make([]Word, 0)}
		for _, index := range g.wordsByCharacter[c.Hanja] {
			result.Words = append(result.Words, g.words[index])
		}
		results = append(results, result)
	}
	return results
}

type SearchResult struct {
	Homonyms       []WordSense `json:"homonyms,omitempty"`
	Words          []Word      `json:"words"`
	Characters     []Reading   `json:"characters"`
	WordCount      int         `json:"word_count"`
	CharacterCount int         `json:"character_count"`
}

// Search matches written forms and meanings. Counts include results beyond limit.
func (g *Graph) Search(query string, limit int) SearchResult {
	return g.SearchByLevel(query, limit, "")
}

// SearchByLevel filters before counting and limiting. Characters remain visible
// when at least one connected word belongs to the selected category.
func (g *Graph) SearchByLevel(query string, limit int, level string) SearchResult {
	result := SearchResult{Words: []Word{}, Characters: []Reading{}}
	query = foldSearch(strings.TrimSpace(query))
	if limit < 1 {
		limit = 60
	}
	matches := func(values ...string) bool {
		for _, value := range values {
			if strings.Contains(foldSearch(value), query) {
				return true
			}
		}
		return false
	}
	// Keep exact headwords visible even when hundreds of definitions match.
	// Preserve source order within the exact and partial groups.
	for _, exactPass := range []bool{true, false} {
		for _, word := range g.words {
			exact := query != "" && (strings.EqualFold(word.Word, query) || strings.EqualFold(word.Hanja, query))
			if exact != exactPass || !matchesLevel(word, level) || !matches(
				word.Word, word.Hanja, word.MeaningKo, word.MeaningEn, word.MeaningRu, word.MeaningUz, word.MeaningKy,
				word.MeaningZh, word.MeaningJa, word.MeaningEs, word.MeaningVi, word.MeaningNe, word.MeaningMn, word.MeaningTh,
			) {
				continue
			}
			result.WordCount++
			if word.Word == query && len(g.wordsByQuery[query]) > 1 {
				result.Homonyms = append(result.Homonyms, g.wordWithExample(word))
			}
			if len(result.Words) < limit {
				result.Words = append(result.Words, word)
			}
		}
	}
	if len(result.Homonyms) < 2 {
		result.Homonyms = nil
	}
	for _, character := range g.characterOrder {
		reading := g.reading(character)
		if g.hasLevelWords(character.Hanja, level) && matches(
			character.Hanja, character.ID, reading.SoundKo, reading.SoundEn,
			strings.Join(character.MeaningKo, " "), strings.Join(character.MeaningEn, " "),
			strings.Join(character.MeaningRu, " "), strings.Join(character.MeaningUz, " "),
			strings.Join(character.MeaningKy, " "), strings.Join(character.MeaningZh, " "),
			strings.Join(character.MeaningJa, " "), strings.Join(character.MeaningEs, " "),
			strings.Join(character.MeaningVi, " "), strings.Join(character.MeaningNe, " "),
			strings.Join(character.MeaningMn, " "), strings.Join(character.MeaningTh, " "),
		) {
			result.CharacterCount++
			if len(result.Characters) < limit {
				result.Characters = append(result.Characters, reading)
			}
		}
	}
	return result
}

// SearchSound matches one exact registered reading in Hangul or romanization.
// Words must contain that Hangul sound in their written form; sharing a glyph
// with another reading is not enough. Meanings do not participate in this search.
func (g *Graph) SearchSound(query string, limit int) SearchResult {
	return g.SearchSoundByLevel(query, limit, "")
}

func (g *Graph) SearchSoundByLevel(query string, limit int, level string) SearchResult {
	query = strings.ToLower(strings.TrimSpace(query))
	if query == "" {
		return g.SearchByLevel("", limit, level)
	}
	if limit < 1 {
		limit = 60
	}
	result := SearchResult{Words: []Word{}, Characters: []Reading{}}
	sounds := make(map[rune]bool)
	for _, character := range g.characterOrder {
		reading := g.reading(character)
		if reading.SoundKo != query && strings.ToLower(reading.SoundEn) != query {
			continue
		}
		for _, sound := range reading.SoundKo {
			sounds[sound] = true
		}
		if !g.hasLevelWords(character.Hanja, level) {
			continue
		}
		result.CharacterCount++
		if len(result.Characters) < limit {
			result.Characters = append(result.Characters, reading)
		}
	}
	for _, word := range g.words {
		if !matchesLevel(word, level) {
			continue
		}
		form := []rune(word.Hanja)
		for i, sound := range []rune(strings.Join(strings.Fields(word.Word), "")) {
			if i >= len(form) || !unicode.Is(unicode.Han, form[i]) || !sounds[sound] {
				continue
			}
			result.WordCount++
			if len(result.Words) < limit {
				result.Words = append(result.Words, word)
			}
			break
		}
	}
	return result
}

// Thai keyboards and imported text may encode sara am as nikhahit and sara aa,
// with a tone mark on either side of the nikhahit.
var searchEquivalents = strings.NewReplacer(
	"ʻ", "'", "ʼ", "'", "‘", "'", "’", "'",
	"ํา", "ำ", "ํ่า", "่ำ", "ํ้า", "้ำ", "ํ๊า", "๊ำ", "ํ๋า", "๋ำ",
)

func foldSearch(value string) string {
	// Compose input from keyboards that enter accents or kana voicing marks separately.
	// Keep registered single-codepoint Hanja spellings intact.
	if strings.IndexFunc(value, unicode.IsMark) >= 0 {
		value = norm.NFC.String(value)
	}
	return strings.ToLower(searchEquivalents.Replace(value))
}
