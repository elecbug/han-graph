package graph

// Neighborhood projects the word graph around all components of a selected
// word (or a character query). Only words incident to a root are expanded.
type Neighborhood struct {
	Roots      []string    `json:"roots"`
	Characters []Component `json:"characters"`
	Words      []Word      `json:"words"`
}

func (g *Graph) Neighborhood(query string) Neighborhood {
	result := Neighborhood{Roots: []string{}, Characters: []Component{}, Words: []Word{}}
	rootSet := map[string]bool{}
	addRoot := func(glyph string) {
		if !rootSet[glyph] {
			rootSet[glyph] = true
			result.Roots = append(result.Roots, glyph)
		}
	}
	for _, word := range g.FindWords(query) {
		for _, glyph := range word.Word.Components {
			addRoot(glyph)
		}
	}
	if len(result.Roots) == 0 {
		for _, character := range g.FindCharacters(query) {
			addRoot(character.Hanja)
		}
	}
	seen := map[string]bool{}
	addCharacter := func(glyph string) {
		if seen[glyph] {
			return
		}
		seen[glyph] = true
		component := Component{Hanja: glyph, Readings: []Reading{}}
		for _, character := range g.characters[glyph] {
			component.Readings = append(component.Readings, g.reading(character))
		}
		result.Characters = append(result.Characters, component)
	}
	indices := map[int]bool{}
	for _, glyph := range result.Roots {
		addCharacter(glyph)
		for _, index := range g.wordsByCharacter[glyph] {
			indices[index] = true
		}
	}
	// Preserve dataset order and each (word, hanja) entry, without a display cap.
	for index, word := range g.words {
		if !indices[index] {
			continue
		}
		result.Words = append(result.Words, word)
		for _, glyph := range word.Components {
			addCharacter(glyph)
		}
	}
	return result
}
