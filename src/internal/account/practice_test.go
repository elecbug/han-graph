package account

import (
	"errors"
	"fmt"
	"testing"
)

func TestPrivatePracticeHistory(t *testing.T) {
	testBackends(t, func(t *testing.T, s *Store, name string) {
		user, err := s.Register(name, "practice-password")
		if err != nil {
			t.Fatal(err)
		}
		other, err := s.Register(name+"_2", "practice-password")
		if err != nil {
			t.Fatal(err)
		}
		correct := Ref{Word: "단어", Hanja: "單語"}
		round := PracticeRound{Level: "easy", Answers: []PracticeAnswer{{Question: "q1", Selected: correct, Answer: correct}, {Question: "q2", Selected: Ref{Word: "언어", Hanja: "言語"}, Answer: correct}}}
		for i := range 22 {
			round.ID = fmt.Sprintf("%032x", i)
			if err := s.SavePractice(user.ID, round); err != nil {
				t.Fatal(err)
			}
		}
		if err := s.SavePractice(user.ID, round); err != nil {
			t.Fatalf("retry: %v", err)
		}
		round.Answers[1].Selected = correct
		if err := s.SavePractice(user.ID, round); !errors.Is(err, ErrConflict) {
			t.Fatalf("changed retry: %v", err)
		}
		page, err := s.PracticeHistory(user.ID, "")
		if err != nil || len(page.Rounds) != 20 || page.Next == "" {
			t.Fatalf("first page: %d %v", len(page.Rounds), err)
		}
		first := page.Rounds[0]
		if first.ID != round.ID || first.Correct != 1 || first.Answers[1].Selected == correct || first.CompletedAt.IsZero() {
			t.Fatal("incorrect saved round")
		}
		next, err := s.PracticeHistory(user.ID, page.Next)
		if err != nil || len(next.Rounds) != 2 || next.Next != "" {
			t.Fatalf("next page: %d %v", len(next.Rounds), err)
		}
		for i, r := range append(page.Rounds, next.Rounds...) {
			if r.ID != fmt.Sprintf("%032x", 21-i) {
				t.Fatal("duplicated or missing round")
			}
		}
		empty, err := s.PracticeHistory(other.ID, "")
		if err != nil || len(empty.Rounds) != 0 {
			t.Fatalf("other account's history: %v", err)
		}
		if _, err := s.PracticeHistory(other.ID, page.Next); !errors.Is(err, ErrInvalid) {
			t.Fatalf("cross-account cursor: %v", err)
		}
	})
}
