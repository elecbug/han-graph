package webapp

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/elecbug/han-graph/internal/graph"
)

func testApp(t *testing.T) (*graph.Graph, Practice, http.Handler) {
	t.Helper()
	dir := filepath.Join("..", "..", "..", "dataset")
	g, err := graph.Load(dir)
	if err != nil {
		t.Fatal(err)
	}
	practice, err := LoadPractice(filepath.Join(dir, "practice.json"), g)
	if err != nil {
		t.Fatal(err)
	}
	return g, practice, New(g, practice)
}

func TestRoutes(t *testing.T) {
	_, _, app := testApp(t)
	for _, tc := range []struct {
		method, path string
		status       int
		content      string
	}{
		{"GET", "/", 200, "text/html"},
		{"GET", "/app.js", 200, "javascript"},
		{"GET", "/learning.mjs", 200, "javascript"},
		{"GET", "/styles.css", 200, "text/css"},
		{"GET", "/favicon.svg", 200, "image/svg+xml"},
		{"GET", "/api/stats", 200, "application/json"},
		{"GET", "/api/search?q=" + url.QueryEscape("家"), 200, "application/json"},
		{"GET", "/api/search", 200, "application/json"},
		{"GET", "/api/words?q=" + url.QueryEscape("가정"), 200, "application/json"},
		{"GET", "/api/characters?q=" + url.QueryEscape("家"), 200, "application/json"},
		{"GET", "/api/practice", 200, "application/json"},
		{"GET", "/api/words", 400, "application/json"},
		{"GET", "/api/characters?q=%20", 400, "application/json"},
		{"GET", "/api/search?q=" + strings.Repeat("a", 101), 400, "application/json"},
		{"GET", "/api/missing", 404, "text/plain"},
		{"GET", "/dataset/character.jsonl", 404, "text/plain"},
		{"GET", "/unknown", 404, "text/plain"},
		{"POST", "/api/words?q=abc", 405, "text/plain"},
	} {
		t.Run(tc.method+tc.path, func(t *testing.T) {
			response := httptest.NewRecorder()
			app.ServeHTTP(response, httptest.NewRequest(tc.method, tc.path, nil))
			if response.Code != tc.status || !strings.Contains(response.Header().Get("Content-Type"), tc.content) {
				t.Fatalf("status=%d content=%s body=%s", response.Code, response.Header().Get("Content-Type"), response.Body.String())
			}
			if strings.Contains(tc.content, "json") && !json.Valid(response.Body.Bytes()) {
				t.Fatal("invalid JSON response")
			}
			if response.Header().Get("X-Content-Type-Options") != "nosniff" || response.Header().Get("Content-Security-Policy") == "" {
				t.Fatal("missing response headers")
			}
		})
	}
}

func TestAPIResults(t *testing.T) {
	_, practice, app := testApp(t)
	response := httptest.NewRecorder()
	app.ServeHTTP(response, httptest.NewRequest("GET", "/api/words?q="+url.QueryEscape("가정"), nil))
	var words []graph.WordResult
	if err := json.Unmarshal(response.Body.Bytes(), &words); err != nil {
		t.Fatal(err)
	}
	if len(words) != 1 || words[0].Word.Hanja != "家庭" || len(words[0].Components) != 2 {
		t.Fatalf("unexpected breakdown: %+v", words)
	}
	response = httptest.NewRecorder()
	app.ServeHTTP(response, httptest.NewRequest("GET", "/api/words?q=missing", nil))
	if strings.TrimSpace(response.Body.String()) != "[]" {
		t.Fatal("missing word must return an empty array")
	}
	if len(practice.Questions) < 3 {
		t.Fatal("expected a usable seed practice set")
	}
}

func TestPracticeValidation(t *testing.T) {
	g, _, _ := testApp(t)
	for _, tc := range []struct {
		name   string
		change func(*Practice)
	}{
		{"unknown word", func(p *Practice) { p.Questions[0].Options[0].Hanja = "不存在" }},
		{"answer not an option", func(p *Practice) { p.Questions[0].Answer = WordRef{"missing", "不存在"} }},
		{"duplicate options", func(p *Practice) { p.Questions[0].Options[1] = p.Questions[0].Options[0] }},
		{"duplicate IDs", func(p *Practice) { p.Questions[1].ID = p.Questions[0].ID }},
		{"empty explanation", func(p *Practice) { p.Questions[0].ExplanationEn = " " }},
		{"no questions", func(p *Practice) { p.Questions = nil }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, practice, _ := testApp(t)
			tc.change(&practice)
			data, err := json.Marshal(practice)
			if err != nil {
				t.Fatal(err)
			}
			file := filepath.Join(t.TempDir(), "practice.json")
			if err := os.WriteFile(file, data, 0600); err != nil {
				t.Fatal(err)
			}
			if _, err := LoadPractice(file, g); err == nil {
				t.Fatal("invalid practice accepted")
			}
		})
	}
}
