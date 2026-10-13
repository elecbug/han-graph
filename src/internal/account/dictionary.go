package account

import (
	"slices"

	"github.com/elecbug/han-graph/internal/graph"
)

const (
	MaxDictionaryWords      = 1000
	MaxDictionaryCharacters = 500
	MaxDictionaryMeta       = 100
)

// The transaction validates the entire resulting dictionary, so concurrent
// additions cannot create duplicates or leave references partially saved.
func (s *Store) AddDictionary(id string, base *graph.Graph, added graph.Additions) (Snapshot, error) {
	if added.Empty() {
		return Snapshot{}, ErrInvalid
	}
	return s.change(id, func(u *record) error {
		combined := graph.Additions{Meta: append(u.Dictionary.Meta, added.Meta...), Characters: append(u.Dictionary.Characters, added.Characters...), Words: append(u.Dictionary.Words, added.Words...), Examples: append(u.Dictionary.Examples, added.Examples...)}
		if len(combined.Words) > MaxDictionaryWords || len(combined.Characters) > MaxDictionaryCharacters || len(combined.Meta) > MaxDictionaryMeta || len(combined.Examples) > MaxDictionaryWords {
			return ErrLimit
		}
		if _, err := base.WithAdditions(combined); err != nil {
			return err
		}
		u.Dictionary = combined
		u.DictionaryRevision++
		return nil
	})
}

type DictionaryRemoval struct {
	Kind  string `json:"kind"`
	Word  string `json:"word,omitempty"`
	Hanja string `json:"hanja,omitempty"`
	ID    string `json:"id,omitempty"`
}

func (s *Store) RemoveDictionary(id string, base *graph.Graph, removal DictionaryRemoval) (Snapshot, error) {
	return s.change(id, func(u *record) error {
		found := false
		switch removal.Kind {
		case "word":
			ref := Ref{removal.Word, removal.Hanja}
			if !ref.Valid() || removal.ID != "" {
				return ErrInvalid
			}
			u.Dictionary.Words = slices.DeleteFunc(u.Dictionary.Words, func(w graph.Word) bool {
				match := w.Word == ref.Word && w.Hanja == ref.Hanja
				found = found || match
				return match
			})
			u.Dictionary.Examples = slices.DeleteFunc(u.Dictionary.Examples, func(e graph.WordExample) bool { return e.Word == ref.Word && e.Hanja == ref.Hanja })
			u.Words = slices.DeleteFunc(u.Words, func(r Ref) bool { return r == ref })
			u.Notes = slices.DeleteFunc(u.Notes, func(n Note) bool { return n.Ref == ref })
		case "character":
			if removal.ID == "" || removal.Word != "" || removal.Hanja != "" {
				return ErrInvalid
			}
			u.Dictionary.Characters = slices.DeleteFunc(u.Dictionary.Characters, func(c graph.Character) bool { match := c.ID == removal.ID; found = found || match; return match })
		case "meta":
			if removal.ID == "" || removal.Word != "" || removal.Hanja != "" {
				return ErrInvalid
			}
			u.Dictionary.Meta = slices.DeleteFunc(u.Dictionary.Meta, func(m graph.Meta) bool { match := m.ID == removal.ID; found = found || match; return match })
		default:
			return ErrInvalid
		}
		if !found {
			return ErrInvalid
		}
		if _, err := base.WithAdditions(u.Dictionary); err != nil {
			return err
		}
		u.DictionaryRevision++
		return nil
	})
}
