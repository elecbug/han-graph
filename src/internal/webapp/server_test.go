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
		{"GET", "/data-client.mjs", 200, "javascript"},
		{"GET", "/network.mjs", 200, "javascript"},
		{"GET", "/network-view.mjs", 200, "javascript"},
		{"GET", "/styles.css", 200, "text/css"},
		{"GET", "/favicon.svg", 200, "image/svg+xml"},
		{"GET", "/api/stats", 200, "application/json"},
		{"GET", "/api/search?q=" + url.QueryEscape("家"), 200, "application/json"},
		{"GET", "/api/search", 200, "application/json"},
		{"GET", "/api/words?q=" + url.QueryEscape("가정"), 200, "application/json"},
		{"GET", "/api/characters?q=" + url.QueryEscape("家"), 200, "application/json"},
		{"GET", "/api/practice", 200, "application/json"},
		{"GET", "/api/neighborhood?q=" + url.QueryEscape("感覺"), 200, "application/json"},
		{"GET", "/api/neighborhood", 400, "application/json"},
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
	if len(words) != 2 || words[0].Word.Hanja != "家庭" || words[1].Word.Hanja != "假定" || len(words[0].Components) != 2 {
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

func TestBootstrapAndRevalidation(t *testing.T) {
	g, _, app := testApp(t)
	response := httptest.NewRecorder()
	app.ServeHTTP(response, httptest.NewRequest("GET", "/", nil))
	_, data, ok := strings.Cut(response.Body.String(), `<script type="application/json" id="bootstrap-data">`)
	if !ok {
		t.Fatal("missing initial data")
	}
	data, _, ok = strings.Cut(data, "</script>")
	if !ok {
		t.Fatal("unclosed initial data")
	}
	var seed map[string]json.RawMessage
	if err := json.Unmarshal([]byte(data), &seed); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"/api/stats", "/api/search", "/api/practice", "/api/words?q=가정", "/api/characters?q=家", "/api/characters?q=庭", "/api/neighborhood?q=家庭"} {
		api := httptest.NewRecorder()
		app.ServeHTTP(api, httptest.NewRequest("GET", path, nil))
		if string(seed[path]) != strings.TrimSpace(api.Body.String()) {
			t.Fatalf("bootstrap does not match API: %s", path)
		}
	}
	for _, path := range []string{"/", "/app.js", "/styles.css", "/learning.mjs", "/data-client.mjs", "/network.mjs", "/network-view.mjs", "/favicon.svg"} {
		first := httptest.NewRecorder()
		app.ServeHTTP(first, httptest.NewRequest("GET", path, nil))
		etag := first.Header().Get("ETag")
		if etag == "" || first.Header().Get("Cache-Control") != "no-cache" {
			t.Fatalf("missing revalidation: %s", path)
		}
		request := httptest.NewRequest("GET", path, nil)
		request.Header.Set("If-None-Match", etag)
		again := httptest.NewRecorder()
		app.ServeHTTP(again, request)
		if again.Code != http.StatusNotModified || again.Body.Len() != 0 {
			t.Fatalf("%s not revalidated: %d", path, again.Code)
		}
		request.Header.Set("If-None-Match", `"old-build"`)
		fresh := httptest.NewRecorder()
		app.ServeHTTP(fresh, request)
		if fresh.Code != 200 || fresh.Body.Len() == 0 {
			t.Fatalf("%s stale hash accepted", path)
		}
	}
	// A changed dataset (here the practice text) must invalidate the HTML hash.
	_, practice, _ := testApp(t)
	practice.Source += " updated"
	updated := httptest.NewRecorder()
	New(g, practice).ServeHTTP(updated, httptest.NewRequest("GET", "/", nil))
	if updated.Header().Get("ETag") == response.Header().Get("ETag") {
		t.Fatal("dataset change did not invalidate HTML")
	}
}

func TestNeighborhoodAPI(t *testing.T) {
	_, _, app := testApp(t)
	response := httptest.NewRecorder()
	app.ServeHTTP(response, httptest.NewRequest("GET", "/api/neighborhood?q="+url.QueryEscape("感覺"), nil))
	var network graph.Neighborhood
	if err := json.Unmarshal(response.Body.Bytes(), &network); err != nil {
		t.Fatal(err)
	}
	if len(network.Roots) != 2 || network.Roots[0] != "感" || network.Roots[1] != "覺" || len(network.Words) != 13 || len(network.Characters) != 15 {
		t.Fatalf("incorrect network response: %+v", network)
	}
	response = httptest.NewRecorder()
	app.ServeHTTP(response, httptest.NewRequest("GET", "/api/neighborhood?q=missing", nil))
	if strings.TrimSpace(response.Body.String()) != `{"roots":[],"characters":[],"words":[]}` {
		t.Fatalf("unexpected empty network: %s", response.Body.String())
	}
}

func TestBootstrapEscapesHTML(t *testing.T) {
	value := `</script><script>alert("dataset")</script>&`
	html := withBootstrap([]byte("<!-- bootstrap-data -->"), map[string]any{"example": value})
	if strings.Count(string(html), "</script>") != 1 || strings.Contains(string(html), value) {
		t.Fatal("unsafe embedded JSON")
	}
	_, raw, _ := strings.Cut(string(html), `id="bootstrap-data">`)
	raw = strings.TrimSuffix(raw, "</script>")
	var decoded map[string]string
	if err := json.Unmarshal([]byte(raw), &decoded); err != nil || decoded["example"] != value {
		t.Fatal("escaped data did not round-trip")
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
