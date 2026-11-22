package webapp

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
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
		{"GET", "/robots.txt", 200, "text/plain"},
		{"HEAD", "/robots.txt", 200, "text/plain"},
		{"GET", "/app.js", 200, "javascript"},
		{"GET", "/localization.mjs", 200, "javascript"},
		{"GET", "/localization-ru.mjs", 200, "javascript"},
		{"GET", "/localization-uz.mjs", 200, "javascript"},
		{"GET", "/localization-ky.mjs", 200, "javascript"},
		{"GET", "/localization-zh.mjs", 200, "javascript"},
		{"GET", "/localization-ja.mjs", 200, "javascript"},
		{"GET", "/localization-es.mjs", 200, "javascript"},
		{"GET", "/localization-vi.mjs", 200, "javascript"},
		{"GET", "/localization-ne.mjs", 200, "javascript"},
		{"GET", "/localization-mn.mjs", 200, "javascript"},
		{"GET", "/localization-th.mjs", 200, "javascript"},
		{"GET", "/dictionary-form.mjs", 200, "javascript"},
		{"GET", "/learning.mjs", 200, "javascript"},
		{"GET", "/examples.mjs", 200, "javascript"},
		{"GET", "/data-client.mjs", 200, "javascript"},
		{"GET", "/network.mjs", 200, "javascript"},
		{"GET", "/network-view.mjs", 200, "javascript"},
		{"GET", "/styles.css", 200, "text/css"},
		{"GET", "/favicon.svg", 200, "image/svg+xml"},
		{"GET", "/api/stats", 200, "application/json"},
		{"GET", "/api/readings", 200, "application/json"},
		{"GET", "/api/search?q=" + url.QueryEscape("家"), 200, "application/json"},
		{"GET", "/api/search", 200, "application/json"},
		{"GET", "/api/random-word", 200, "application/json"},
		{"GET", "/api/random-word?exclude_word=" + strings.Repeat("a", 101), 400, "application/json"},
		{"GET", "/api/random-word?exclude_hanja=" + url.QueryEscape(strings.Repeat("家", 101)), 400, "application/json"},
		{"GET", "/api/words?q=" + url.QueryEscape("가정"), 200, "application/json"},
		{"GET", "/wordbook.mjs", 200, "javascript"},
		{"GET", "/wordbook-print.mjs", 200, "javascript"},
		{"GET", "/wordbook-print.css", 200, "text/css"},
		{"GET", "/fonts/NotoSans-Regular.woff2", 200, "font/woff2"},
		{"GET", "/fonts/NotoSans-Bold.woff2", 200, "font/woff2"},
		{"GET", "/fonts/NotoSansJP-Regular.woff2", 200, "font/woff2"},
		{"GET", "/fonts/NotoSansJP-Bold.woff2", 200, "font/woff2"},
		{"GET", "/fonts/NotoSansSC-Regular.woff2", 200, "font/woff2"},
		{"GET", "/fonts/NotoSansSC-Bold.woff2", 200, "font/woff2"},
		{"GET", "/fonts/NotoSansKR-Regular.woff2", 200, "font/woff2"},
		{"GET", "/fonts/NotoSansDevanagari-Regular.ttf", 200, "font/ttf"},
		{"GET", "/fonts/NotoSansThai-Regular.ttf", 200, "font/ttf"},
		{"GET", "/fonts/NotoSansKR-SemiBold.woff2", 200, "font/woff2"},
		{"GET", "/fonts/LICENSE", 200, "text/plain"},
		{"GET", "/network-routing.mjs", 200, "javascript"},
		{"GET", "/api/characters?q=" + url.QueryEscape("家"), 200, "application/json"},
		{"GET", "/api/practice", 200, "application/json"},
		{"GET", "/api/neighborhood?q=" + url.QueryEscape("感覺"), 200, "application/json"},
		{"GET", "/api/neighborhood", 400, "application/json"},
		{"GET", "/api/words", 400, "application/json"},
		{"GET", "/api/characters?q=%20", 400, "application/json"},
		{"GET", "/api/search?q=" + strings.Repeat("a", 101), 400, "application/json"},
		{"GET", "/api/missing", 404, "text/plain"},
		{"GET", "/dataset/character.jsonl", 404, "text/plain"},
		{"GET", "/.env", 404, "text/plain"},
		{"POST", "/.env", 404, "text/plain"},
		{"GET", "/.git/config", 404, "text/plain"},
		{"HEAD", "/var/google-credentials.json", 404, "text/plain"},
		{"GET", "/var/accounts.db", 404, "text/plain"},
		{"GET", "/fonts/", 404, "text/plain"},
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
			h := response.Result().Header
			if strings.HasPrefix(tc.path, "/api/") && (h.Get("Cache-Control") != "no-store" || h.Get("X-Robots-Tag") != "noindex") {
				t.Fatal("API responses, including errors, must carry the privacy headers")
			}
			if tc.path == "/robots.txt" && tc.method == "GET" && response.Body.String() != "User-agent: *\nDisallow: /api/\n" {
				t.Fatal("unexpected crawler rules")
			}
		})
	}
}

func TestTransportAndFormPolicies(t *testing.T) {
	g, practice, local := testApp(t)
	proxied := New(g, practice, Options{SecureCookies: true, GoogleClientID: "123-example.apps.googleusercontent.com"})
	for _, tc := range []struct {
		app   http.Handler
		url   string
		https bool
	}{{local, "http://example.test/", false}, {local, "https://example.test/", true}, {proxied, "http://example.test/", true}} {
		request := httptest.NewRequest("HEAD", tc.url, nil)
		request.Header.Set("X-Forwarded-Proto", "https")
		response := httptest.NewRecorder()
		tc.app.ServeHTTP(response, request)
		wantHSTS := ""
		if tc.https {
			wantHSTS = "max-age=31536000"
		}
		if got := response.Result().Header.Get("Strict-Transport-Security"); got != wantHSTS {
			t.Errorf("%s: unexpected HSTS %q", tc.url, got)
		}
		if !strings.Contains(response.Result().Header.Get("Content-Security-Policy"), "form-action 'none'") {
			t.Error("native form submission must be blocked even with Google Sign-In enabled")
		}
	}
}

func TestRandomWordAPI(t *testing.T) {
	g, _, app := testApp(t)
	excluded := g.FindWords("가정")[0].Word
	for range 20 {
		params := url.Values{"exclude_word": {excluded.Word}, "exclude_hanja": {excluded.Hanja}}
		response := httptest.NewRecorder()
		app.ServeHTTP(response, httptest.NewRequest("GET", "/api/random-word?"+params.Encode(), nil))
		var word graph.Word
		if err := json.Unmarshal(response.Body.Bytes(), &word); err != nil {
			t.Fatal(err)
		}
		if response.Code != 200 || response.Header().Get("Cache-Control") != "no-store" {
			t.Fatalf("random response must not be cached: %+v", response.Result())
		}
		if word.Word == excluded.Word && word.Hanja == excluded.Hanja {
			t.Fatal("repeated the currently selected entry")
		}
		found := false
		for _, match := range g.FindWords(word.Word) {
			found = found || match.Word.Hanja == word.Hanja
		}
		if !found {
			t.Fatalf("random word is not in the dataset: %+v", word)
		}
		excluded = word
	}
	response := httptest.NewRecorder()
	New(&graph.Graph{}, Practice{}).ServeHTTP(response, httptest.NewRequest("GET", "/api/random-word", nil))
	if response.Code != 404 || !json.Valid(response.Body.Bytes()) {
		t.Fatalf("unexpected empty dataset response: %d %s", response.Code, response.Body.String())
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
	g, _, app := testApp(t)
	response := httptest.NewRecorder()
	app.ServeHTTP(response, httptest.NewRequest("GET", "/api/neighborhood?q="+url.QueryEscape("感覺"), nil))
	var network graph.Neighborhood
	if err := json.Unmarshal(response.Body.Bytes(), &network); err != nil {
		t.Fatal(err)
	}
	if len(network.Roots) != 2 || network.Roots[0] != "感" || network.Roots[1] != "覺" || !reflect.DeepEqual(network, g.Neighborhood("感覺")) {
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

func TestSearchModesAPI(t *testing.T) {
	g, _, app := testApp(t)
	for _, tc := range []struct {
		mode, query string
		status      int
	}{
		{"", "하", 200},
		{"all", "하", 200},
		{"sound", "하", 200},
		{"sound", " HA ", 200},
		{"sound", "", 200},
		{"sound", "하다", 200},
		{"sound", strings.Repeat("하", 101), 400},
		{"unknown", "하", 400},
	} {
		t.Run(tc.mode+"/"+tc.query, func(t *testing.T) {
			params := url.Values{"q": {tc.query}}
			if tc.mode != "" {
				params.Set("mode", tc.mode)
			}
			response := httptest.NewRecorder()
			app.ServeHTTP(response, httptest.NewRequest("GET", "/api/search?"+params.Encode(), nil))
			if response.Code != tc.status || !json.Valid(response.Body.Bytes()) {
				t.Fatalf("unexpected search response: %d %s", response.Code, response.Body.String())
			}
			if tc.status != 200 {
				return
			}
			var got graph.SearchResult
			if err := json.Unmarshal(response.Body.Bytes(), &got); err != nil {
				t.Fatal(err)
			}
			want := g.Search(tc.query, 60)
			if tc.mode == "sound" {
				want = g.SearchSound(tc.query, 60)
			}
			if !reflect.DeepEqual(got, want) || response.Header().Get("Cache-Control") != "no-store" {
				t.Fatalf("incorrect mode response: %+v", got)
			}
		})
	}
}
