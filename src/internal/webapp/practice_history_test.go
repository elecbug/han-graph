package webapp

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/elecbug/han-graph/internal/account"
	"github.com/elecbug/han-graph/internal/graph"
)

func TestPracticeHistoryAPI(t *testing.T) {
	g, practice, _ := testApp(t)
	store, err := account.Open(filepath.Join(t.TempDir(), "accounts.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	// Keep a one-question tagged pool alongside the ordinary ten-question round.
	taggedID := ""
	for i := range practice.Questions {
		q := &practice.Questions[i]
		if q.WordLevel == "easy" {
			q.WordTags = nil
			if taggedID == "" {
				taggedID, q.WordTags = q.ID, []string{graph.TagAllusion}
			}
		}
	}
	app := New(g, practice, Options{Accounts: store})
	user, err := store.Register("student", "1234567890")
	if err != nil {
		t.Fatal(err)
	}
	token, err := store.StartSession(user.ID, "")
	if err != nil {
		t.Fatal(err)
	}
	request := func(method string, body any, owner, session string, want int) *httptest.ResponseRecorder {
		t.Helper()
		data, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		req := httptest.NewRequest(method, "https://example.test/api/account/practice", bytes.NewReader(data))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Account-ID", owner)
		if session != "" {
			req.AddCookie(&http.Cookie{Name: sessionCookie, Value: session})
		}
		rec := httptest.NewRecorder()
		app.ServeHTTP(rec, req)
		if rec.Code != want {
			t.Fatalf("%s got %d want %d %s", method, rec.Code, want, rec.Body.String())
		}
		return rec
	}
	type choice struct {
		Question string  `json:"question"`
		Selected WordRef `json:"selected"`
	}
	var answers []choice
	var first Question
	for _, q := range practice.Questions {
		if q.WordLevel == "easy" && len(answers) < 10 {
			if len(answers) == 0 {
				first = q
			}
			answers = append(answers, choice{q.ID, q.Answer})
		}
	}
	payload := map[string]any{"id": strings.Repeat("a", 32), "level": "easy", "answers": answers}
	request("GET", nil, "", "", 401)
	request("POST", payload, "different", token, 401)
	original := answers[0]
	answers[0] = answers[1]
	request("POST", payload, user.ID, token, 400)
	answers[0] = choice{original.Question, WordRef{Word: "invalid"}}
	request("POST", payload, user.ID, token, 400)
	answers[0] = original
	request("POST", payload, user.ID, token, 200)
	request("POST", payload, user.ID, token, 200)
	rec := request("GET", nil, user.ID, token, 200)
	var page account.PracticeHistory
	if err := json.Unmarshal(rec.Body.Bytes(), &page); err != nil || len(page.Rounds) != 1 {
		t.Fatalf("history count: %d %v", len(page.Rounds), err)
	}
	round := page.Rounds[0]
	if round.Correct != 10 || round.Answers[0].Prompts["ko"] != first.PromptKo || round.Answers[0].Prompts["es"] != first.PromptEs {
		t.Fatal("missing score or localized question")
	}
	tagged := map[string]any{"id": strings.Repeat("c", 32), "level": "easy", "tag": graph.TagAllusion, "answers": answers[1:2]}
	request("POST", tagged, user.ID, token, 400)
	tagged["answers"] = answers[:1]
	request("POST", tagged, user.ID, token, 200)
	request("POST", tagged, user.ID, token, 200)
	rec = request("GET", nil, user.ID, token, 200)
	var taggedHistory account.PracticeHistory
	if err := json.Unmarshal(rec.Body.Bytes(), &taggedHistory); err != nil || len(taggedHistory.Rounds) != 2 || taggedHistory.Rounds[0].Tag != graph.TagAllusion || taggedHistory.Rounds[0].Correct != 1 {
		t.Fatalf("tagged round was not preserved: %v", err)
	}
	// A short review may use a different question, but its answer must be
	// a word the signed-in learner missed in the specified source round.
	source := account.PracticeRound{ID: strings.Repeat("d", 32), Level: first.WordLevel,
		Answers: []account.PracticeAnswer{{Question: "earlier-context", Answer: account.Ref(first.Answer), Selected: account.Ref{Word: "다른 보기"}}}}
	if err := store.SavePractice(user.ID, source); err != nil {
		t.Fatal(err)
	}
	reviewAnswers := []map[string]any{{"question": first.ID, "selected": first.Answer, "source": source.ID}}
	review := map[string]any{"id": strings.Repeat("e", 32), "level": account.ReviewLevel, "answers": reviewAnswers}
	request("POST", review, user.ID, token, 200)
	request("POST", review, user.ID, token, 200)
	reviewAnswers[0]["source"] = round.ID // A perfect round has no review targets.
	request("POST", review, user.ID, token, 400)
	reviewAnswers[0]["source"] = source.ID
	reviewAnswers[0]["question"] = answers[1].Question
	request("POST", review, user.ID, token, 400)
	oldRound := round
	oldRound.ID = strings.Repeat("b", 32)
	oldRound.Answers[0].Prompts = map[string]string{"ko": first.PromptKo, "en": first.PromptEn, "mn": "Хадгалсан асуулт"}
	oldRound.Answers[1].Prompts = map[string]string{"ko": "이전 문항", "en": oldRound.Answers[1].Prompts["en"]}
	if err := store.SavePractice(user.ID, oldRound); err != nil {
		t.Fatal(err)
	}
	rec = request("GET", nil, user.ID, token, 200)
	var pastPage account.PracticeHistory
	if err := json.Unmarshal(rec.Body.Bytes(), &pastPage); err != nil {
		t.Fatal(err)
	}
	for _, round := range pastPage.Rounds {
		if round.ID == oldRound.ID {
			p := round.Answers[0].Prompts
			if p["ne"] == "" || p["ne"] != first.PromptNe || p["th"] != first.PromptTh || p["mn"] != "Хадгалсан асуулт" || round.Answers[1].Prompts["ne"] != "" {
				t.Fatal("past questions must keep their original wording and only gain matching translations")
			}
			return
		}
	}
	t.Fatal("past round missing from history")
}

func TestReviewUsesLatestAttemptAcrossHistoryPages(t *testing.T) {
	store, err := account.Open(filepath.Join(t.TempDir(), "review.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	user, err := store.Register("reviewer", "1234567890")
	if err != nil {
		t.Fatal(err)
	}
	first := account.Ref{Word: "분수", Hanja: "分數"}
	second := account.Ref{Word: "분수", Hanja: "噴水"}
	other := account.Ref{Word: "소수", Hanja: "小數"}
	retired := account.Ref{Word: "삭제", Hanja: "削除"}
	save := func(i int, answers ...account.PracticeAnswer) {
		t.Helper()
		if err := store.SavePractice(user.ID, account.PracticeRound{ID: fmt.Sprintf("%032x", i), Level: "normal", Answers: answers}); err != nil {
			t.Fatal(err)
		}
	}
	save(1, account.PracticeAnswer{Question: "old", Answer: first, Selected: other},
		account.PracticeAnswer{Question: "fountain", Answer: second, Selected: other},
		account.PracticeAnswer{Question: "removed", Answer: retired, Selected: other})
	for i := 2; i <= 23; i++ {
		save(i, account.PracticeAnswer{Question: "new", Answer: first, Selected: first})
	}
	vocabulary := map[WordRef]bool{WordRef(first): true, WordRef(second): true}
	got, err := pendingReview(store, user.ID, vocabulary)
	if err != nil || len(got) != 1 || got[0].Question != "fountain" || got[0].RoundID != fmt.Sprintf("%032x", 1) {
		t.Fatalf("unexpected review %v: %v", got, err)
	}
	save(24, account.PracticeAnswer{Question: "alternate", Answer: second, Selected: other}, account.PracticeAnswer{Question: "later", Answer: second, Selected: second})
	got, err = pendingReview(store, user.ID, vocabulary)
	if err != nil || len(got) != 0 {
		t.Fatalf("latest correct answer: %v, %v", got, err)
	}
}
