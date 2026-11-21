package account

import (
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"testing"

	"github.com/elecbug/han-graph/internal/graph"
)

func TestCredentialChanges(t *testing.T) {
	testBackends(t, func(t *testing.T, s *Store, name string) {
		const password = "old-password"
		nextPassword := strings.Repeat("🔑", 10)
		nextName := name + "_new"
		user, err := s.Register(name, password)
		if err != nil {
			t.Fatal(err)
		}
		other, err := s.Register(name+"_other", password)
		if err != nil {
			t.Fatal(err)
		}
		session := func(id string) string {
			t.Helper()
			token, err := s.StartSession(id, "")
			if err != nil {
				t.Fatal(err)
			}
			return token
		}
		keep, revoke1, revoke2, otherSession := session(user.ID), session(user.ID), session(user.ID), session(other.ID)
		google := GoogleIdentity{name, name + "@gmail.com"}
		if err := s.ChangeGoogle(user.ID, name, password, google); err != nil {
			t.Fatal(err)
		}
		previous, err := s.verifyPassword(name, password)
		if err != nil {
			t.Fatal(err)
		}
		word := Ref{"학습", "學習"}
		if _, err := s.AddWords(user.ID, []Ref{word}); err != nil {
			t.Fatal(err)
		}
		round := PracticeRound{ID: strings.Repeat("a", 32), Level: "easy", Answers: []PracticeAnswer{{Question: "q", Selected: word, Answer: word}}}
		if err := s.SavePractice(user.ID, round); err != nil {
			t.Fatal(err)
		}
		for _, tc := range []struct {
			input CredentialChange
			want  error
		}{
			{CredentialChange{Username: name, CurrentPassword: "wrong", NewUsername: nextName}, ErrCredentials},
			{CredentialChange{Username: other.Username, CurrentPassword: password, NewUsername: nextName}, ErrCredentials},
			{CredentialChange{Username: name, CurrentPassword: password, NewUsername: "!!"}, ErrInvalid},
			{CredentialChange{Username: name, CurrentPassword: password, NewPassword: strings.Repeat("🔑", 9)}, ErrInvalid},
			{CredentialChange{Username: name, CurrentPassword: password, NewPassword: strings.Repeat("🔑", 129)}, ErrInvalid},
			{CredentialChange{Username: name, CurrentPassword: password, NewUsername: other.Username, NewPassword: nextPassword}, ErrExists},
		} {
			if err := s.ChangeCredentials(user.ID, keep, tc.input); !errors.Is(err, tc.want) {
				t.Fatalf("invalid change: %v, want %v", err, tc.want)
			}
		}
		if err := s.ChangeCredentials(user.ID, keep, CredentialChange{Username: name, CurrentPassword: password, NewUsername: strings.ToUpper(nextName)}); err != nil {
			t.Fatal(err)
		}
		if _, err := s.startSession(user.ID, "", previous.passwordProof()); !errors.Is(err, ErrCredentials) {
			t.Fatalf("stale username issued session: %v", err)
		}
		if _, err := s.Login(name, password); !errors.Is(err, ErrCredentials) {
			t.Fatalf("old username: %v", err)
		}
		if id, err := s.Resolve(revoke1); err != nil || id != user.ID {
			t.Fatal("rename lost session", err)
		}
		preReset, err := s.verifyPassword(nextName, password)
		if err != nil {
			t.Fatal(err)
		}
		if err := s.ChangeCredentials(user.ID, keep, CredentialChange{Username: nextName, CurrentPassword: password, NewPassword: nextPassword}); err != nil {
			t.Fatal(err)
		}
		if _, err := s.startSession(user.ID, "", preReset.passwordProof()); !errors.Is(err, ErrCredentials) {
			t.Fatalf("stale password issued session: %v", err)
		}
		if err := s.storage.deleteAccount(s.ctx, user.ID, preReset.passwordProof()); !errors.Is(err, ErrCredentials) {
			t.Fatalf("stale password authorized deletion: %v", err)
		}
		for _, token := range []string{revoke1, revoke2} {
			if _, err := s.Resolve(token); !errors.Is(err, ErrUnauthorized) {
				t.Fatalf("revoked token: %v", err)
			}
		}
		for token, want := range map[string]string{keep: user.ID, otherSession: other.ID} {
			if id, err := s.Resolve(token); err != nil || id != want {
				t.Fatalf("retained token: %v", err)
			}
		}
		if _, _, err := s.PasswordSession(nextName, password, ""); !errors.Is(err, ErrCredentials) {
			t.Fatalf("old password: %v", err)
		}
		if id, _, err := s.PasswordSession(nextName, nextPassword, ""); err != nil || id != user.ID {
			t.Fatal("new login", err)
		}
		nextGoogle := GoogleIdentity{name + "2", name + "2@gmail.com"}
		if err := s.ChangeGoogle(user.ID, nextName, password, nextGoogle); !errors.Is(err, ErrCredentials) {
			t.Fatal("relink with old password", err)
		}
		if err := s.ChangeGoogle(user.ID, nextName, nextPassword, nextGoogle); err != nil {
			t.Fatal(err)
		}
		if _, _, err := s.GoogleSession(google.Subject, ""); !errors.Is(err, ErrGoogleUnknown) {
			t.Fatal("old Google login", err)
		}
		if _, err := s.startSession(user.ID, "", loginProof{subject: google.Subject}); !errors.Is(err, ErrCredentials) {
			t.Fatal("stale Google login", err)
		}
		if id, _, err := s.GoogleSession(nextGoogle.Subject, ""); err != nil || id != user.ID {
			t.Fatal("new Google login", err)
		}
		if snap, err := s.Snapshot(user.ID); err != nil || snap.User.Username != nextName || snap.User.Email != nextGoogle.Email || len(snap.Words) != 1 || snap.Words[0] != word {
			t.Fatal("changed account data", err)
		}
		if h, err := s.PracticeHistory(user.ID, ""); err != nil || len(h.Rounds) != 1 || h.Rounds[0].ID != round.ID {
			t.Fatal("lost history", err)
		}
	})
}

func TestAccountDeletion(t *testing.T) {
	g, err := graph.Load(filepath.Join("..", "..", "..", "dataset"))
	if err != nil {
		t.Fatal(err)
	}
	testBackends(t, func(t *testing.T, s *Store, name string) {
		const password = "deletion-password"
		google := GoogleIdentity{name, name + "@gmail.com"}
		user, err := s.RegisterGoogle(name, password, google)
		if err != nil {
			t.Fatal(err)
		}
		other, err := s.Register(name+"_other", "other-password")
		if err != nil {
			t.Fatal(err)
		}
		otherToken, err := s.StartSession(other.ID, "")
		if err != nil {
			t.Fatal(err)
		}
		var tokens []string
		for range 3 {
			token, err := s.StartSession(user.ID, "")
			if err != nil {
				t.Fatal(err)
			}
			tokens = append(tokens, token)
		}
		if _, err := s.AddDictionary(user.ID, g, accountDictionaryFixture()); err != nil {
			t.Fatal(err)
		}
		ref := Ref{"섬광", "閃光"}
		if _, err := s.AddWords(user.ID, []Ref{ref}); err != nil {
			t.Fatal(err)
		}
		if _, err := s.SaveNote(user.ID, Note{Ref: ref, Text: "private"}); err != nil {
			t.Fatal(err)
		}
		round := PracticeRound{Level: "easy", Answers: []PracticeAnswer{{Answer: ref, Selected: ref}}}
		for i := range 20 {
			round.ID = fmt.Sprintf("%032x", i)
			if err := s.SavePractice(user.ID, round); err != nil {
				t.Fatal(err)
			}
		}
		if err := s.SavePractice(other.ID, round); err != nil {
			t.Fatal(err)
		}
		if err := s.DeleteAccount(user.ID, name, "wrong"); !errors.Is(err, ErrCredentials) {
			t.Fatal(err)
		}
		if err := s.DeleteAccount(user.ID, other.Username, "other-password"); !errors.Is(err, ErrCredentials) {
			t.Fatal(err)
		}
		if snap, err := s.Snapshot(user.ID); err != nil || len(snap.Notes) != 1 || len(snap.Dictionary.Words) != 1 {
			t.Fatal("failed deletion changed data", err)
		}
		if err := s.DeleteAccount(user.ID, name, password); err != nil {
			t.Fatal(err)
		}
		for _, token := range tokens {
			if _, err := s.Resolve(token); !errors.Is(err, ErrUnauthorized) {
				t.Fatal("retained deleted session", err)
			}
		}
		if _, err := s.Login(name, password); !errors.Is(err, ErrCredentials) {
			t.Fatal("deleted password login", err)
		}
		if _, err := s.GoogleUser(google.Subject); !errors.Is(err, ErrGoogleUnknown) {
			t.Fatal("deleted Google login", err)
		}
		if _, err := s.Snapshot(user.ID); !errors.Is(err, ErrUnauthorized) {
			t.Fatal("accessible deleted account", err)
		}
		if _, err := s.PracticeHistory(user.ID, ""); !errors.Is(err, ErrUnauthorized) {
			t.Fatal("accessible deleted history", err)
		}
		if err := s.SavePractice(user.ID, round); !errors.Is(err, ErrUnauthorized) {
			t.Fatal("late save recreated history", err)
		}
		if b, ok := s.storage.(*firestoreBackend); ok {
			for _, name := range []string{"pages", "practiceRounds"} {
				rows, err := b.user(user.ID).Collection(name).Limit(1).Documents(s.ctx).GetAll()
				if err != nil || len(rows) != 0 {
					t.Fatalf("remaining %s: %d, %v", name, len(rows), err)
				}
			}
		}
		if id, err := s.Resolve(otherToken); err != nil || id != other.ID {
			t.Fatal("lost other account session", err)
		}
		if history, err := s.PracticeHistory(other.ID, ""); err != nil || len(history.Rounds) != 1 {
			t.Fatal("lost other history", err)
		}
		fresh, err := s.RegisterGoogle(name, password, google)
		if err != nil || fresh.ID == user.ID {
			t.Fatal("reuse login identity", err)
		}
		if snap, err := s.Snapshot(fresh.ID); err != nil || len(snap.Words)+len(snap.Notes) != 0 || !snap.Dictionary.Empty() {
			t.Fatal("new account inherited data", err)
		}
	})
}
