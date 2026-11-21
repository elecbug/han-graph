// Package graph loads and indexes the word-centred HAN-GRAPH dataset.
package graph

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"
)

type Meta struct {
	Type    string `json:"type"`
	ID      string `json:"id"`
	SoundKo string `json:"sound_ko"`
	SoundEn string `json:"sound_en"`
}

type Character struct {
	Type      string   `json:"type"`
	ID        string   `json:"id"`
	Hanja     string   `json:"hanja"`
	MeaningKo []string `json:"meaning_ko"`
	MeaningEn []string `json:"meaning_en"`
	MeaningRu []string `json:"meaning_ru,omitempty"`
	MeaningUz []string `json:"meaning_uz,omitempty"`
	MeaningKy []string `json:"meaning_ky,omitempty"`
	MeaningZh []string `json:"meaning_zh,omitempty"`
	MeaningJa []string `json:"meaning_ja,omitempty"`
	MeaningEs []string `json:"meaning_es,omitempty"`
	MeaningVi []string `json:"meaning_vi,omitempty"`
	MeaningNe []string `json:"meaning_ne,omitempty"`
	MeaningMn []string `json:"meaning_mn,omitempty"`
	MeaningTh []string `json:"meaning_th,omitempty"`
}

type WordExample struct {
	Word      string `json:"word"`
	Hanja     string `json:"hanja"`
	ExampleKo string `json:"example_ko"`
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
}

type Word struct {
	Level          string   `json:"level"`
	Word           string   `json:"word"`
	Hanja          string   `json:"hanja"`
	MeaningKo      string   `json:"meaning_ko"`
	MeaningEn      string   `json:"meaning_en"`
	MeaningRu      string   `json:"meaning_ru,omitempty"`
	MeaningUz      string   `json:"meaning_uz,omitempty"`
	MeaningKy      string   `json:"meaning_ky,omitempty"`
	MeaningZh      string   `json:"meaning_zh,omitempty"`
	MeaningJa      string   `json:"meaning_ja,omitempty"`
	MeaningEs      string   `json:"meaning_es,omitempty"`
	MeaningVi      string   `json:"meaning_vi,omitempty"`
	MeaningNe      string   `json:"meaning_ne,omitempty"`
	MeaningMn      string   `json:"meaning_mn,omitempty"`
	MeaningTh      string   `json:"meaning_th,omitempty"`
	Components     []string `json:"components"`
	SemanticHint   string   `json:"semantic_hint,omitempty"`
	SemanticHintEn string   `json:"semantic_hint_en,omitempty"`
	SemanticHintRu string   `json:"semantic_hint_ru,omitempty"`
	SemanticHintUz string   `json:"semantic_hint_uz,omitempty"`
	SemanticHintKy string   `json:"semantic_hint_ky,omitempty"`
	SemanticHintZh string   `json:"semantic_hint_zh,omitempty"`
	SemanticHintJa string   `json:"semantic_hint_ja,omitempty"`
	SemanticHintEs string   `json:"semantic_hint_es,omitempty"`
	SemanticHintVi string   `json:"semantic_hint_vi,omitempty"`
	SemanticHintNe string   `json:"semantic_hint_ne,omitempty"`
	SemanticHintMn string   `json:"semantic_hint_mn,omitempty"`
	SemanticHintTh string   `json:"semantic_hint_th,omitempty"`
}

// ValidWordLevel reports whether level is a supported vocabulary category.
func ValidWordLevel(level string) bool {
	switch level {
	case "easy", "normal", "hard", "classical":
		return true
	default:
		return false
	}
}

type located[T any] struct {
	value T
	line  int
}

var characterID = regexp.MustCompile(`^([a-z]+)-([0-9]{3,})$`)
var metaID = regexp.MustCompile(`^[a-z]+$`)

// Load validates dictionary JSONL and optional word examples before indexing them.
// Errors carry the source filename and physical line number.
func Load(dir string) (*Graph, error) {
	metas, err := readJSONL[Meta](filepath.Join(dir, "meta.jsonl"))
	if err != nil {
		return nil, err
	}
	characters, err := readJSONL[Character](filepath.Join(dir, "character.jsonl"))
	if err != nil {
		return nil, err
	}
	words, err := readJSONL[Word](filepath.Join(dir, "word.jsonl"))
	if err != nil {
		return nil, err
	}
	g := &Graph{
		meta:             make(map[string]Meta),
		characters:       make(map[string][]Character),
		wordsByQuery:     make(map[string][]int),
		wordsByCharacter: make(map[string][]int),
	}
	fail := func(file string, line int, message string) (*Graph, error) {
		return nil, fmt.Errorf("%s:%d: %s", filepath.Join(dir, file), line, message)
	}
	for _, row := range metas {
		m := row.value
		if m.Type != "meta" || !metaID.MatchString(m.ID) || !nonempty(m.SoundKo, m.SoundEn) {
			return fail("meta.jsonl", row.line, "expected type=meta, a lowercase Latin id, sound_ko and sound_en")
		}
		if _, exists := g.meta[m.ID]; exists {
			return fail("meta.jsonl", row.line, "duplicate meta id: "+m.ID)
		}
		g.meta[m.ID] = m
	}
	seenIDs := make(map[string]bool)
	seenReadings := make(map[[2]string]bool)
	for _, row := range characters {
		c := row.value
		parts := characterID.FindStringSubmatch(c.ID)
		if c.Type != "character" || parts == nil || utf8.RuneCountInString(c.Hanja) != 1 || !nonempty(c.Hanja) || !meanings(c.MeaningKo) || !meanings(c.MeaningEn) || !c.validTranslations() {
			return fail("character.jsonl", row.line, "expected type=character, id=<meta>-<3+ digits>, one hanja character and nonempty meaning arrays")
		}
		if _, exists := g.meta[parts[1]]; !exists {
			return fail("character.jsonl", row.line, "unknown meta id: "+parts[1])
		}
		if seenIDs[c.ID] {
			return fail("character.jsonl", row.line, "duplicate character id: "+c.ID)
		}
		reading := [2]string{c.Hanja, parts[1]}
		if seenReadings[reading] {
			return fail("character.jsonl", row.line, "duplicate hanja/reading: "+c.Hanja+"/"+parts[1])
		}
		seenIDs[c.ID], seenReadings[reading] = true, true
		g.characters[c.Hanja] = append(g.characters[c.Hanja], c)
		g.characterOrder = append(g.characterOrder, c)
	}
	seenWords := make(map[[2]string]bool)
	for _, row := range words {
		w := row.value
		if !nonempty(w.Level, w.Word, w.MeaningKo, w.MeaningEn) || !w.validTranslations() || w.Components == nil {
			return fail("word.jsonl", row.line, "expected level, word, Korean/English meanings and a components array")
		}
		if !ValidWordLevel(w.Level) {
			return fail("word.jsonl", row.line, "level must be easy, normal, hard or classical: "+w.Level)
		}
		if err := validateWordForm(w); err != nil {
			return fail("word.jsonl", row.line, err.Error()+": "+w.Word)
		}
		key := [2]string{w.Word, w.Hanja}
		if seenWords[key] {
			return fail("word.jsonl", row.line, "duplicate word/hanja: "+w.Word+"/"+w.Hanja)
		}
		seenWords[key] = true
		seenComponents := make(map[string]bool)
		for _, component := range w.Components {
			if _, exists := g.characters[component]; !exists {
				return fail("word.jsonl", row.line, "unknown component: "+component+" ("+w.Word+")")
			}
			// A repeated character keeps its positions in the word, but has one edge.
			if !seenComponents[component] {
				g.wordsByCharacter[component] = append(g.wordsByCharacter[component], len(g.words))
				seenComponents[component] = true
			}
		}
		g.wordsByQuery[w.Word] = append(g.wordsByQuery[w.Word], len(g.words))
		if w.Hanja != "" && w.Word != w.Hanja {
			g.wordsByQuery[w.Hanja] = append(g.wordsByQuery[w.Hanja], len(g.words))
		}
		g.words = append(g.words, w)
	}

	examplesPath := filepath.Join(dir, "example.jsonl")
	examples, err := readJSONL[WordExample](examplesPath)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	g.examples = make(map[[2]string]WordExample)
	for _, row := range examples {
		e := row.value
		key := [2]string{e.Word, e.Hanja}
		if !seenWords[key] {
			return fail("example.jsonl", row.line, "unknown word/hanja: "+e.Word+"/"+e.Hanja)
		}
		if _, exists := g.examples[key]; exists {
			return fail("example.jsonl", row.line, "duplicate word example: "+e.Word+"/"+e.Hanja)
		}
		if strings.TrimSpace(e.ExampleKo) != e.ExampleKo || e.ExampleKo == "" || utf8.RuneCountInString(e.ExampleKo) > 500 || strings.ContainsAny(e.ExampleKo, "\r\n") {
			return fail("example.jsonl", row.line, "example_ko must be a single nonempty line of at most 500 characters")
		}
		if e.ExampleEn != "" && (strings.TrimSpace(e.ExampleEn) != e.ExampleEn || utf8.RuneCountInString(e.ExampleEn) > 500 || strings.ContainsAny(e.ExampleEn, "\r\n")) {
			return fail("example.jsonl", row.line, "example_en must be a single nonempty line of at most 500 characters")
		}
		if !e.validTranslations() {
			return fail("example.jsonl", row.line, "translated examples must be a single nonempty line of at most 500 characters")
		}
		g.examples[key] = e
	}
	return g, nil
}

// Hanja may contain literal Hangul in a mixed word, such as 工夫하다.
// Only actual Han glyphs become graph components; an empty form has no edges.
func validateWordForm(w Word) error {
	if w.Hanja == "" {
		if len(w.Components) != 0 {
			return fmt.Errorf("empty hanja requires empty components")
		}
		return nil
	}
	var glyphs strings.Builder
	syllables := []rune(strings.Join(strings.Fields(w.Word), ""))
	form := []rune(w.Hanja)
	for i, glyph := range form {
		if unicode.Is(unicode.Han, glyph) {
			glyphs.WriteRune(glyph)
		} else if glyph < '가' || glyph > '힣' || len(form) != len(syllables) || glyph != syllables[i] {
			return fmt.Errorf("mixed hanja must preserve the Korean spelling")
		}
	}
	if glyphs.Len() == 0 || strings.Join(w.Components, "") != glyphs.String() {
		return fmt.Errorf("components must reproduce hanja glyphs in order")
	}
	return nil
}

func nonempty(values ...string) bool {
	for _, value := range values {
		if strings.TrimSpace(value) == "" {
			return false
		}
	}
	return true
}

func meanings(values []string) bool { return len(values) > 0 && nonempty(values...) }

func readJSONL[T any](filename string) ([]located[T], error) {
	file, err := os.Open(filename)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	rows := make([]located[T], 0)
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 4096), 1024*1024)
	line := 0
	for scanner.Scan() {
		line++
		data := bytes.TrimSpace(scanner.Bytes())
		if len(data) == 0 {
			continue
		}
		if !utf8.Valid(data) {
			return nil, fmt.Errorf("%s:%d: invalid UTF-8", filename, line)
		}
		var value T
		decoder := json.NewDecoder(bytes.NewReader(data))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&value); err != nil {
			return nil, fmt.Errorf("%s:%d: %w", filename, line, err)
		}
		if err := decoder.Decode(new(any)); err != io.EOF {
			return nil, fmt.Errorf("%s:%d: expected one JSON object per line", filename, line)
		}
		rows = append(rows, located[T]{value, line})
	}
	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("%s:%d: %w", filename, line+1, err)
	}
	if len(rows) == 0 {
		return nil, fmt.Errorf("%s: no records", filename)
	}
	return rows, nil
}

// Additional languages use the same field limits in public and personal dictionaries.
func (w Word) validTranslations() bool {
	return optionalTexts(2000,
		w.MeaningRu, w.MeaningUz, w.MeaningKy, w.MeaningZh, w.MeaningJa,
		w.MeaningEs, w.MeaningVi, w.MeaningNe, w.MeaningMn, w.MeaningTh,
		w.SemanticHintEn, w.SemanticHintRu, w.SemanticHintUz, w.SemanticHintKy,
		w.SemanticHintZh, w.SemanticHintJa, w.SemanticHintEs, w.SemanticHintVi,
		w.SemanticHintNe, w.SemanticHintMn, w.SemanticHintTh,
	)
}

func (c Character) validTranslations() bool {
	return optionalMeaningArrays(
		c.MeaningRu, c.MeaningUz, c.MeaningKy, c.MeaningZh, c.MeaningJa,
		c.MeaningEs, c.MeaningVi, c.MeaningNe, c.MeaningMn, c.MeaningTh,
	)
}

func (e WordExample) validTranslations() bool {
	return optionalTexts(500,
		e.ExampleRu, e.ExampleUz, e.ExampleKy, e.ExampleZh, e.ExampleJa,
		e.ExampleEs, e.ExampleVi, e.ExampleNe, e.ExampleMn, e.ExampleTh,
	)
}

func optionalTexts(maximum int, values ...string) bool {
	for _, value := range values {
		if !personalText(value, maximum, false) {
			return false
		}
	}
	return true
}
func optionalMeaningArrays(arrays ...[]string) bool {
	for _, values := range arrays {
		if values != nil && !personalMeanings(values) {
			return false
		}
	}
	return true
}
