package account

import (
	"errors"
	"path/filepath"
	"sync"
	"testing"

	"github.com/elecbug/han-graph/internal/graph"
)

func accountDictionaryFixture() graph.Additions {
	return graph.Additions{Characters: []graph.Character{{Type: "character", ID: "seom-9000", Hanja: "閃", MeaningKo: []string{"번쩍이다"}, MeaningEn: []string{"flash"}}}, Words: []graph.Word{{Level: "normal", Word: "섬광", Hanja: "閃光", MeaningKo: "번쩍이는 빛", MeaningEn: "flash of light", Components: []string{"閃", "光"}}}, Examples: []graph.WordExample{{Word: "섬광", Hanja: "閃光", ExampleKo: "하늘에 섬광이 번쩍였어요.", ExampleEn: "A flash lit up the sky."}}}
}
func TestPersonalDictionaryPersistsIsolatesAndDeletesDependents(t *testing.T) {
	g, err := graph.Load(filepath.Join("..", "..", "..", "dataset"))
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "accounts.db")
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { s.Close() }()
	a, err := s.Register("dictionary_a", "a sufficiently long password")
	if err != nil {
		t.Fatal(err)
	}
	b, err := s.Register("dictionary_b", "a sufficiently long password")
	if err != nil {
		t.Fatal(err)
	}
	snap, err := s.AddDictionary(a.ID, g, accountDictionaryFixture())
	if err != nil {
		t.Fatal(err)
	}
	if snap.DictionaryRevision != 1 || len(snap.Dictionary.Words) != 1 {
		t.Fatal(snap)
	}
	ref := Ref{"섬광", "閃光"}
	if _, err = s.AddWords(a.ID, []Ref{ref}); err != nil {
		t.Fatal(err)
	}
	if _, err = s.SaveNote(a.ID, Note{Ref: ref, Text: "private note"}, g); err != nil {
		t.Fatal(err)
	}
	if _, err = s.RemoveDictionary(a.ID, g, DictionaryRemoval{Kind: "character", ID: "seom-9000"}); err == nil {
		t.Fatal("removed a required character")
	}
	before, err := s.Snapshot(a.ID)
	if err != nil {
		t.Fatal(err)
	}
	if before.DictionaryRevision != 1 || len(before.Dictionary.Characters) != 1 {
		t.Fatal("failed deletion partially persisted")
	}
	if _, err = s.AddDictionary(a.ID, g, accountDictionaryFixture()); err == nil {
		t.Fatal("accepted duplicate")
	}
	other, _ := s.Snapshot(b.ID)
	if !other.Dictionary.Empty() || len(other.Notes) != 0 {
		t.Fatal("private data crossed accounts")
	}
	token, _ := s.StartSession(a.ID, "")
	if err = s.Close(); err != nil {
		t.Fatal(err)
	}
	s, err = Open(path)
	if err != nil {
		t.Fatal(err)
	}
	if owner, err := s.Resolve(token); err != nil || owner != a.ID {
		t.Fatal("session did not persist")
	}
	snap, err = s.Snapshot(a.ID)
	if err != nil || len(snap.Dictionary.Examples) != 1 {
		t.Fatal("dictionary did not persist", err)
	}
	snap, err = s.RemoveDictionary(a.ID, g, DictionaryRemoval{Kind: "word", Word: ref.Word, Hanja: ref.Hanja})
	if err != nil || len(snap.Dictionary.Words) != 0 || len(snap.Dictionary.Examples) != 0 || len(snap.Words) != 0 || len(snap.Notes) != 0 || snap.DictionaryRevision != 2 {
		t.Fatalf("dependent removal: %+v %v", snap, err)
	}
	if _, err = s.SaveNote(a.ID, Note{Ref: ref, Text: "stale editor"}, g); !errors.Is(err, ErrInvalid) {
		t.Fatal("revived removed note", err)
	}
	if _, err = s.RemoveDictionary(a.ID, g, DictionaryRemoval{Kind: "character", ID: "seom-9000"}); err != nil {
		t.Fatal(err)
	}
	if len(g.FindWords("섬광")) != 0 || len(g.FindCharacters("閃")) != 0 {
		t.Fatal("public dictionary mutated")
	}
}
func TestPersonalDictionaryConcurrentDuplicateIsAtomic(t *testing.T) {
	g, err := graph.Load(filepath.Join("..", "..", "..", "dataset"))
	if err != nil {
		t.Fatal(err)
	}
	s, err := Open(filepath.Join(t.TempDir(), "accounts.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	u, err := s.Register("dictionary_concurrent", "a sufficiently long password")
	if err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	results := make(chan error, 2)
	for range 2 {
		wg.Go(func() { _, err := s.AddDictionary(u.ID, g, accountDictionaryFixture()); results <- err })
	}
	wg.Wait()
	close(results)
	successes := 0
	for err := range results {
		if err == nil {
			successes++
		}
	}
	snap, _ := s.Snapshot(u.ID)
	if successes != 1 || snap.DictionaryRevision != 1 || len(snap.Dictionary.Words) != 1 {
		t.Fatalf("concurrent data: %+v", snap)
	}
	invalid := graph.Additions{Words: []graph.Word{{Level: "normal", Word: "실패", Hanja: "失敗", MeaningKo: "검사", MeaningEn: "check", Components: []string{"失"}}}}
	if _, err = s.AddDictionary(u.ID, g, invalid); err == nil {
		t.Fatal("accepted invalid references")
	}
	snap, _ = s.Snapshot(u.ID)
	if snap.DictionaryRevision != 1 || len(snap.Dictionary.Words) != 1 {
		t.Fatal("failed batch partially persisted")
	}
}
