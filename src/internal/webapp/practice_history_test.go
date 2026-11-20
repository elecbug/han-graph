package webapp

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/elecbug/han-graph/internal/account"
)

func TestPracticeHistoryAPI(t *testing.T) {
	g, practice, _ := testApp(t)
	store, err := account.Open(filepath.Join(t.TempDir(), "accounts.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
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
}
