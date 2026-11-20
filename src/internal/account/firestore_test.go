package account

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/elecbug/han-graph/internal/graph"
)

func TestLargeFirestoreListReusesPagesAfterDeletion(t *testing.T) {
	var original bytes.Buffer
	for i := range 140000 {
		fmt.Fprintf(&original, "note-%06d %s\n", i, strings.Repeat("x", 75))
	}
	oldPages := map[string][]byte{}
	old := pageKeys(original.Bytes(), nil, nil, oldPages)
	// Deleting a note shifts every later byte in this list, which exceeds
	// Firestore's maximum commit size. Unaffected pages must stay reusable.
	removed := []byte("note-070000 " + strings.Repeat("x", 75) + "\n")
	body := bytes.Replace(original.Bytes(), removed, nil, 1)
	pages := map[string][]byte{}
	keys := pageKeys(body, old, oldPages, pages)
	var restored bytes.Buffer
	var changed int
	for _, key := range keys {
		part := pages[key]
		if len(part) > pageSize {
			t.Fatal("oversized page")
		}
		if _, ok := oldPages[key]; !ok {
			changed += len(part)
		}
		restored.Write(part)
	}
	if !bytes.Equal(restored.Bytes(), body) || changed > 2*pageSize {
		t.Fatalf("deleting one note rewrote %d bytes", changed)
	}
}

func TestFirestorePersistence(t *testing.T) {
	if os.Getenv("FIRESTORE_EMULATOR_HOST") == "" {
		t.Skip("set FIRESTORE_EMULATOR_HOST to run the emulator integration test")
	}
	open := func() *Store {
		s, err := OpenFirestore(t.Context(), "demo-han-graph", "(default)")
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { s.Close() })
		return s
	}
	first, second := open(), open()
	suffix, err := randomHex(6)
	if err != nil {
		t.Fatal(err)
	}
	name := "reader_" + suffix
	const password = "a sufficiently long password"
	user, err := first.Register(name, password)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := second.Register(strings.ToUpper(name), password); !errors.Is(err, ErrExists) {
		t.Fatalf("duplicate name: %v", err)
	}
	if other, err := second.Login(name, password); err != nil || other != user {
		t.Fatalf("login: %v %v", other, err)
	}
	if _, err := second.Login(name, "incorrect"); !errors.Is(err, ErrCredentials) {
		t.Fatalf("password check: %v", err)
	}

	token, err := first.StartSession(user.ID, "")
	if err != nil {
		t.Fatal(err)
	}
	replacement, err := second.StartSession(user.ID, token)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := first.Resolve(token); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("rotated session: %v", err)
	}
	if id, err := first.Resolve(replacement); err != nil || id != user.ID {
		t.Fatalf("shared session: %q %v", id, err)
	}
	if err := first.EndSession(replacement); err != nil {
		t.Fatal(err)
	}
	if _, err := second.Resolve(replacement); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("ended session: %v", err)
	}

	// Multiple imports can grow an account beyond Firestore's single-document limit.
	for batch := range 3 {
		_, err := first.change(user.ID, func(r *record) error {
			for i := range 30 {
				r.Notes = append(r.Notes, Note{Ref: Ref{Word: fmt.Sprintf("단어%d", 30*batch+i)}, Text: strings.Repeat("한", 4800), Revision: 1})
			}
			return nil
		})
		if err != nil {
			t.Fatal(err)
		}
	}
	snap, err := second.Snapshot(user.ID)
	if err != nil || len(snap.Notes) != 90 {
		t.Fatalf("large snapshot: %d notes, %v", len(snap.Notes), err)
	}
	results := make(chan error, 2)
	note := Note{Ref: snap.Notes[45].Ref, Text: "edited", Revision: 1}
	for _, s := range []*Store{first, second} {
		go func() { _, err := s.SaveNote(user.ID, note); results <- err }()
	}
	a, b := <-results, <-results
	if !(a == nil && errors.Is(b, ErrConflict) || b == nil && errors.Is(a, ErrConflict)) {
		t.Fatalf("concurrent edit: %v / %v", a, b)
	}
	snap, err = second.Snapshot(user.ID)
	if err != nil || len(snap.Notes) != 90 || snap.Notes[45].Revision != 2 || snap.Notes[45].Text != "edited" || snap.Notes[89].Text != strings.Repeat("한", 4800) {
		t.Fatal("lost note data", err)
	}

	base, err := graph.Load(filepath.Join("..", "..", "..", "dataset"))
	if err != nil {
		t.Fatal(err)
	}
	additions := accountDictionaryFixture()
	if _, err = first.AddDictionary(user.ID, base, additions); err != nil {
		t.Fatal(err)
	}
	ref := Ref{"섬광", "閃光"}
	if _, err = first.AddWords(user.ID, []Ref{ref}); err != nil {
		t.Fatal(err)
	}
	if _, err = first.SaveNote(user.ID, Note{Ref: ref, Text: "memo"}, base); err != nil {
		t.Fatal(err)
	}
	snap, err = second.RemoveDictionary(user.ID, base, DictionaryRemoval{Kind: "word", Word: ref.Word, Hanja: ref.Hanja})
	if err != nil || snap.DictionaryRevision != 2 || len(snap.Words) != 0 || len(snap.Notes) != 90 || len(snap.Dictionary.Examples) != 0 {
		t.Fatal("dictionary removal was not atomic", err)
	}

	var oldest string
	for i := 0; i < 11; i++ {
		token, err = first.StartSession(user.ID, "")
		if err != nil {
			t.Fatal(err)
		}
		if i == 0 {
			oldest = token
		}
	}
	if _, err = second.Resolve(oldest); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("session limit: %v", err)
	}
	backend := first.storage.(*firestoreBackend)
	if _, err := backend.sessions().Doc(sessionID(token)).Set(t.Context(), session{user.ID, time.Now().Add(-time.Hour)}); err != nil {
		t.Fatal(err)
	}
	if _, err := second.Resolve(token); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("expired session: %v", err)
	}

	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	if _, err := first.WithContext(ctx).Snapshot(user.ID); err == nil {
		t.Fatal("cancelled database request succeeded")
	}
}
