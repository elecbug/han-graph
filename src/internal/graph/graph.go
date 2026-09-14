package graph

import "strings"

// Graph is a bipartite graph of hanja glyphs and (word, hanja) entries.
// Reading records remain separate metadata, so a glyph can have several sounds.
type Graph struct {
	meta             map[string]Meta
	characters       map[string][]Character
	characterOrder   []Character
	words            []Word
	wordsByQuery     map[string][]int
	wordsByCharacter map[string][]int
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

type WordResult struct {
	Word       Word        `json:"word"`
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

func (g *Graph) reading(c Character) Reading {
	m := g.meta[c.ID[:strings.LastIndexByte(c.ID, '-')]]
	return Reading{c, m.SoundKo, m.SoundEn}
}

// FindWords returns every exact Hangul or hanja match, preserving homographs.
func (g *Graph) FindWords(query string) []WordResult {
	results := make([]WordResult, 0)
	for _, index := range g.wordsByQuery[query] {
		w := g.words[index]
		result := WordResult{Word: w, Components: make([]Component, 0, len(w.Components))}
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
