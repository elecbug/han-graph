// Package graph loads and indexes the word-centred HAN-GRAPH dataset.
package graph

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
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
}

type Word struct {
	Level        string   `json:"level"`
	Word         string   `json:"word"`
	Hanja        string   `json:"hanja"`
	MeaningKo    string   `json:"meaning_ko"`
	MeaningEn    string   `json:"meaning_en"`
	Components   []string `json:"components"`
	SemanticHint string   `json:"semantic_hint,omitempty"`
}

type located[T any] struct {
	value T
	line  int
}

var characterID = regexp.MustCompile(`^([a-z]+)-([0-9]{3,})$`)
var metaID = regexp.MustCompile(`^[a-z]+$`)

// Load validates all three JSONL files before returning a usable graph.
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
	words, err := readJSONL[Word](filepath.Join(dir, "normal_word.jsonl"))
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
		if c.Type != "character" || parts == nil || utf8.RuneCountInString(c.Hanja) != 1 || !nonempty(c.Hanja) || !meanings(c.MeaningKo) || !meanings(c.MeaningEn) {
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
		if !nonempty(w.Level, w.Word, w.Hanja, w.MeaningKo, w.MeaningEn) || len(w.Components) < 2 {
			return fail("normal_word.jsonl", row.line, "expected level, word, hanja, Korean/English meanings and at least two components")
		}
		if strings.Join(w.Components, "") != w.Hanja {
			return fail("normal_word.jsonl", row.line, "components must reproduce hanja in order: "+w.Word)
		}
		key := [2]string{w.Word, w.Hanja}
		if seenWords[key] {
			return fail("normal_word.jsonl", row.line, "duplicate word/hanja: "+w.Word+"/"+w.Hanja)
		}
		seenWords[key] = true
		seenComponents := make(map[string]bool)
		for _, component := range w.Components {
			if _, exists := g.characters[component]; !exists {
				return fail("normal_word.jsonl", row.line, "unknown component: "+component+" ("+w.Word+")")
			}
			// A repeated character keeps its positions in the word, but has one edge.
			if !seenComponents[component] {
				g.wordsByCharacter[component] = append(g.wordsByCharacter[component], len(g.words))
				seenComponents[component] = true
			}
		}
		g.wordsByQuery[w.Word] = append(g.wordsByQuery[w.Word], len(g.words))
		if w.Word != w.Hanja {
			g.wordsByQuery[w.Hanja] = append(g.wordsByQuery[w.Hanja], len(g.words))
		}
		g.words = append(g.words, w)
	}
	return g, nil
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
