package account

import (
	"errors"
	"strings"
	"testing"
	"time"
)

func TestStudyMonthTimezoneBoundaries(t *testing.T) {
	loc, err := time.LoadLocation("America/New_York")
	if err != nil {
		t.Fatal(err)
	}
	m, err := makeStudyMonth("2024-03", loc, time.Date(2024, 4, 1, 12, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatal(err)
	}
	days := m.days()
	if m.bounds[10].Sub(m.bounds[9]) != 23*time.Hour {
		t.Fatal("expected a short DST day")
	}
	// UTC 05:00 is local midnight the morning before the clocks change.
	bitmap, err := addIntervals(nil, []ActivityInterval{{5*3600 - 10, 5*3600 + 20}, {5 * 3600, 5*3600 + 5}})
	if err != nil {
		t.Fatal(err)
	}
	if err = m.addUsage(days, "2024-03-10", bitmap); err != nil {
		t.Fatal(err)
	}
	if days[8].Seconds != 10 || days[9].Seconds != 20 {
		t.Fatal(days[8:10])
	}
	m.addRound(days, m.bounds[9], 2, 3)
	if days[9].Correct != 2 || days[9].Questions != 3 || days[9].Rounds != 1 {
		t.Fatal(days[9])
	}
	loc, err = time.LoadLocation("Pacific/Apia")
	if err != nil {
		t.Fatal(err)
	}
	m, err = makeStudyMonth("2011-12", loc, time.Now())
	if err != nil || len(m.days()) != 31 || !m.bounds[29].Equal(m.bounds[30]) {
		t.Fatal("skipped calendar date", err, m.bounds)
	}
}

func TestPrivateActivityAndLegacyScores(t *testing.T) {
	testBackends(t, func(t *testing.T, s *Store, name string) {
		const password = "activity-test-password"
		user, err := s.Register(name, password)
		if err != nil {
			t.Fatal(err)
		}
		other, err := s.Register(name+"_2", password)
		if err != nil {
			t.Fatal(err)
		}
		// The underlying historic round format did not store QuestionCount.
		stamp := time.Date(2023, 2, 15, 0, 15, 0, 0, time.UTC)
		legacy := PracticeRound{ID: strings.Repeat("a", 32), Level: "easy", CompletedAt: stamp, Correct: 1, Answers: []PracticeAnswer{{}, {}}}
		if err = s.storage.savePractice(t.Context(), user.ID, legacy); err != nil {
			t.Fatal(err)
		}
		days, err := s.MonthlyStudy(user.ID, "2023-02", "America/New_York")
		if err != nil {
			t.Fatal(err)
		}
		if d := days[13]; d.Rounds != 1 || d.Correct != 1 || d.Questions != 2 || d.Seconds != 0 {
			t.Fatal(d)
		}
		now := time.Now().UTC()
		right := Ref{Word: "학습", Hanja: "學習"}
		newRound := PracticeRound{ID: strings.Repeat("b", 32), Level: "easy", Answers: []PracticeAnswer{{Selected: right, Answer: right}, {Selected: Ref{Word: "시험"}, Answer: right}}}
		for range 2 {
			if err := s.SavePractice(user.ID, newRound); err != nil {
				t.Fatal(err)
			}
		}
		start := now.Unix() - 80
		updates := [][]ActivityInterval{{{start, start + 50}}, {{start + 20, start + 70}}, {{start, start + 50}}}
		result := make(chan error, len(updates))
		for _, spans := range updates {
			go func() { result <- s.SaveActivity(user.ID, spans) }()
		}
		for range updates {
			if err = <-result; err != nil {
				t.Fatal(err)
			}
		}
		// UTC months on either side of the test wall clock are both possible.
		months := map[string]bool{now.Format("2006-01"): true, time.Unix(start, 0).UTC().Format("2006-01"): true}
		total, rounds, correct, questions := 0, 0, 0, 0
		for month := range months {
			days, err = s.MonthlyStudy(user.ID, month, "UTC")
			if err != nil {
				t.Fatal(err)
			}
			for _, d := range days {
				total += d.Seconds
				rounds += d.Rounds
				correct += d.Correct
				questions += d.Questions
			}
		}
		if rounds != 1 || correct != 1 || questions != 2 {
			t.Fatalf("retried practice totals: %d rounds, %d/%d", rounds, correct, questions)
		}
		if total != 70 {
			t.Fatalf("overlapping retries counted %d seconds", total)
		}
		days, err = s.MonthlyStudy(other.ID, now.Format("2006-01"), "UTC")
		if err != nil {
			t.Fatal(err)
		}
		for _, d := range days {
			if d.Seconds+d.Rounds != 0 {
				t.Fatal("account data crossed owners")
			}
		}
		if err = s.SaveActivity(user.ID, []ActivityInterval{{start, start + 400}}); !errors.Is(err, ErrInvalid) {
			t.Fatal(err)
		}
		if err = s.DeleteAccount(user.ID, name, password); err != nil {
			t.Fatal(err)
		}
		if err = s.SaveActivity(user.ID, updates[0]); !errors.Is(err, ErrUnauthorized) {
			t.Fatal("late write", err)
		}
		if _, err = s.MonthlyStudy(user.ID, "2023-02", "UTC"); !errors.Is(err, ErrUnauthorized) {
			t.Fatal("late read", err)
		}
		if backend, ok := s.storage.(*firestoreBackend); ok {
			docs, err := backend.user(user.ID).Collection("activityDays").Documents(t.Context()).GetAll()
			if err != nil || len(docs) != 0 {
				t.Fatal("leftover activity documents", len(docs), err)
			}
		}
	})
}
