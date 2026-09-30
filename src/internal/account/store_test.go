package account

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	bolt "go.etcd.io/bbolt"
)

func TestAccountsPersistAndIsolate(t *testing.T) {
	path := filepath.Join(t.TempDir(), "private", "accounts.db")
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	a, err := s.Register("Reader_A", "a long secret password")
	if err != nil {
		t.Fatal(err)
	}
	b, err := s.Register("reader_b", "another long password")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.Register("READER_A", "yet another password"); !errors.Is(err, ErrExists) {
		t.Fatalf("duplicate: %v", err)
	}
	if _, err = s.Login("reader_a", "wrong password"); !errors.Is(err, ErrCredentials) {
		t.Fatalf("wrong password: %v", err)
	}
	if _, err = s.Login("missing", "wrong password"); !errors.Is(err, ErrCredentials) {
		t.Fatalf("missing user: %v", err)
	}
	if got, err := s.Login(" Reader_A ", "a long secret password"); err != nil || got != a {
		t.Fatalf("login: %+v %v", got, err)
	}
	if _, err = s.AddWords(a.ID, []Ref{{"가격", "價格"}, {"기사", "記事"}, {"기사", "騎士"}}); err != nil {
		t.Fatal(err)
	}
	ref := Ref{"가격", "價格"}
	snap, err := s.SaveNote(a.ID, Note{Ref: ref, Text: "나만의 노트"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.SaveNote(a.ID, Note{Ref: ref, Text: "stale"}); !errors.Is(err, ErrConflict) {
		t.Fatalf("concurrent note: %v", err)
	}
	if _, err = s.SaveNote(a.ID, Note{Ref: ref, Revision: snap.Notes[0].Revision}); err != nil {
		t.Fatal(err)
	}
	if _, err = s.SaveNote(a.ID, Note{Ref: ref, Text: "stale", Revision: 1}); !errors.Is(err, ErrConflict) {
		t.Fatalf("deleted note: %v", err)
	}
	if _, err = s.SaveNote(a.ID, Note{Ref: ref, Text: "새 노트", Revision: 2}); err != nil {
		t.Fatal(err)
	}
	token, err := s.StartSession(a.ID, "")
	if err != nil {
		t.Fatal(err)
	}
	if err = s.Close(); err != nil {
		t.Fatal(err)
	}
	info, _ := os.Stat(path)
	if info.Mode().Perm() != 0600 {
		t.Fatalf("permissions: %v", info.Mode())
	}
	s, err = Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if id, err := s.Resolve(token); err != nil || id != a.ID {
		t.Fatalf("persisted session: %s %v", id, err)
	}
	snap, err = s.Snapshot(a.ID)
	if err != nil || len(snap.Words) != 3 || snap.Notes[0].Text != "새 노트" {
		t.Fatalf("persisted data: %+v %v", snap, err)
	}
	other, err := s.Snapshot(b.ID)
	if err != nil || len(other.Words) != 0 || len(other.Notes) != 0 {
		t.Fatalf("isolation: %+v %v", other, err)
	}
	if err = s.EndSession(token); err != nil {
		t.Fatal(err)
	}
	if _, err = s.Resolve(token); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("logout: %v", err)
	}
	// Expired sessions are rejected without waiting for the cleanup sweep.
	token, err = s.StartSession(a.ID, "")
	if err != nil {
		t.Fatal(err)
	}
	err = s.db.Update(func(tx *bolt.Tx) error {
		return putJSON(tx.Bucket(sessionsBucket), tokenKey(token), session{a.ID, time.Now().Add(-time.Minute)})
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.Resolve(token); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("expiry: %v", err)
	}
}
func TestAtomicWordUpdates(t *testing.T) {
	s, err := Open(filepath.Join(t.TempDir(), "accounts.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	user, err := s.Register("reader", "long enough password")
	if err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	for i := range 20 {
		wg.Go(func() {
			_, err := s.AddWords(user.ID, []Ref{{fmt.Sprint("단어", i), ""}})
			if err != nil {
				t.Error(err)
			}
		})
	}
	wg.Wait()
	snap, err := s.Snapshot(user.ID)
	if err != nil || len(snap.Words) != 20 {
		t.Fatalf("lost concurrent write: %+v %v", snap, err)
	}
	words := make([]Ref, 500)
	for i := range words {
		words[i] = Ref{fmt.Sprint("단어", i), ""}
	}
	if _, err = s.AddWords(user.ID, words); err != nil {
		t.Fatal(err)
	}
	if _, err = s.AddWords(user.ID, []Ref{{"초과", ""}}); !errors.Is(err, ErrLimit) {
		t.Fatalf("limit: %v", err)
	}
	snap, _ = s.Snapshot(user.ID)
	if len(snap.Words) != 500 {
		t.Fatalf("partial write: %d", len(snap.Words))
	}
	if _, err = s.RemoveWord(user.ID, words[0]); err != nil {
		t.Fatal(err)
	}
	snap, _ = s.Snapshot(user.ID)
	if len(snap.Words) != 499 {
		t.Fatal("remove failed")
	}
}

func TestNoteLimitsAndDeletion(t *testing.T) {
	s, err := Open(filepath.Join(t.TempDir(), "accounts.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	user, err := s.Register("writer", "long enough password")
	if err != nil {
		t.Fatal(err)
	}
	// Seed a full account in one transaction; exercise the public mutation limits.
	_, err = s.change(user.ID, func(u *record) error {
		for i := 0; i < 1000; i++ {
			u.Notes = append(u.Notes, Note{Ref: Ref{fmt.Sprint("단어", i), ""}, Text: "노트", Revision: 1})
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	extra := Ref{"새단어", ""}
	if _, err = s.SaveNote(user.ID, Note{Ref: extra, Text: "추가"}); !errors.Is(err, ErrLimit) {
		t.Fatalf("limit: %v", err)
	}
	if _, err = s.SaveNote(user.ID, Note{Ref: Ref{"단어0", ""}, Revision: 1}); err != nil {
		t.Fatal(err)
	}
	if _, err = s.SaveNote(user.ID, Note{Ref: extra, Text: "추가"}); err != nil {
		t.Fatalf("deleted note should free a slot: %v", err)
	}
	if _, err = s.SaveNote(user.ID, Note{Ref: Ref{"단어0", ""}, Text: "다시 작성", Revision: 2}); !errors.Is(err, ErrLimit) {
		t.Fatalf("restore limit: %v", err)
	}
	if _, err = s.SaveNote(user.ID, Note{Ref: Ref{"단어0", ""}, Text: "예전 내용", Revision: 1}); !errors.Is(err, ErrConflict) {
		t.Fatalf("tombstone: %v", err)
	}
	if _, err = s.AddWords(user.ID, []Ref{{"줄\n바꿈", ""}}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("control character: %v", err)
	}
}
