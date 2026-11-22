// Package webapp serves the learning app, dictionary API, and private accounts.
package webapp

import (
	"bytes"
	"crypto/sha256"
	"embed"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/elecbug/han-graph/internal/graph"
)

//go:embed static/index.html static/app.js static/*.mjs static/*.css static/favicon.svg static/robots.txt static/fonts/*.woff2 static/fonts/*.ttf static/fonts/LICENSE
var assets embed.FS

func New(g *graph.Graph, practice Practice, configs ...Options) http.Handler {
	var options Options
	if len(configs) > 0 {
		options = configs[0]
	}
	mux := http.NewServeMux()
	dictionary := &dictionaryViews{base: g, store: options.Accounts, cache: make(map[dictionaryKey]*graph.Graph)}
	registerAccounts(mux, g, practice, options)
	jsonReply := func(w http.ResponseWriter, value any) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		json.NewEncoder(w).Encode(value)
	}
	wordLevel := func(w http.ResponseWriter, r *http.Request) (string, bool) {
		level := r.URL.Query().Get("level")
		if level == "" || level == "all" || graph.ValidWordLevel(level) {
			return level, true
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(http.StatusBadRequest)
		jsonReply(w, map[string]string{"error": "level must be all, easy, normal, hard or classical"})
		return "", false
	}
	query := func(w http.ResponseWriter, r *http.Request, required bool) (string, bool) {
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		if (required && q == "") || utf8.RuneCountInString(q) > 100 {
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "query must contain 1–100 characters"})
			return "", false
		}
		return q, true
	}
	mux.HandleFunc("GET /api/stats", func(w http.ResponseWriter, r *http.Request) {
		current, ok := dictionary.view(w, r)
		if !ok {
			return
		}
		jsonReply(w, current.Stats())
	})
	mux.HandleFunc("GET /api/search", func(w http.ResponseWriter, r *http.Request) {
		current, available := dictionary.view(w, r)
		if !available {
			return
		}
		level, valid := wordLevel(w, r)
		if !valid {
			return
		}
		if q, ok := query(w, r, false); ok {
			switch r.URL.Query().Get("mode") {
			case "", "all":
				jsonReply(w, current.SearchByLevel(q, 60, level))
			case "sound":
				jsonReply(w, current.SearchSoundByLevel(q, 60, level))
			default:
				w.Header().Set("Content-Type", "application/json; charset=utf-8")
				w.WriteHeader(http.StatusBadRequest)
				jsonReply(w, map[string]string{"error": "mode must be all or sound"})
			}
		}
	})
	mux.HandleFunc("GET /api/readings", func(w http.ResponseWriter, r *http.Request) {
		current, available := dictionary.view(w, r)
		if available {
			jsonReply(w, current.ReadingGroups())
		}
	})
	mux.HandleFunc("GET /api/words", func(w http.ResponseWriter, r *http.Request) {
		current, available := dictionary.view(w, r)
		if !available {
			return
		}
		if q, ok := query(w, r, true); ok {
			jsonReply(w, current.FindWords(q))
		}
	})
	mux.HandleFunc("GET /api/random-word", func(w http.ResponseWriter, r *http.Request) {
		current, available := dictionary.view(w, r)
		if !available {
			return
		}
		level, valid := wordLevel(w, r)
		if !valid {
			return
		}
		word := strings.TrimSpace(r.URL.Query().Get("exclude_word"))
		hanja := strings.TrimSpace(r.URL.Query().Get("exclude_hanja"))
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		if utf8.RuneCountInString(word) > 100 || utf8.RuneCountInString(hanja) > 100 {
			w.WriteHeader(http.StatusBadRequest)
			jsonReply(w, map[string]string{"error": "excluded word and hanja must be at most 100 characters"})
			return
		}
		selected, ok := current.RandomWordByLevel(word, hanja, level)
		if !ok {
			w.WriteHeader(http.StatusNotFound)
			jsonReply(w, map[string]string{"error": "no words available"})
			return
		}
		jsonReply(w, selected)
	})
	mux.HandleFunc("GET /api/characters", func(w http.ResponseWriter, r *http.Request) {
		current, available := dictionary.view(w, r)
		if !available {
			return
		}
		if q, ok := query(w, r, true); ok {
			jsonReply(w, current.FindCharacters(q))
		}
	})
	mux.HandleFunc("GET /api/practice", func(w http.ResponseWriter, r *http.Request) { jsonReply(w, practice) })
	mux.HandleFunc("GET /api/neighborhood", func(w http.ResponseWriter, r *http.Request) {
		current, available := dictionary.view(w, r)
		if !available {
			return
		}
		if q, ok := query(w, r, true); ok {
			jsonReply(w, current.Neighborhood(q))
		}
	})
	// The graph is immutable until restart. Prepare the initial view once so
	// opening the app does not require a chain of data requests.
	search := g.Search("", 60)
	seed := map[string]any{
		"/api/stats":    g.Stats(),
		"/api/search":   search,
		"/api/practice": practice,
	}
	if len(search.Words) > 0 {
		initial := search.Words[0]
		for _, word := range search.Words {
			if word.Word == "가정" {
				initial = word
				break
			}
		}
		seed["/api/words?q="+initial.Word] = g.FindWords(initial.Word)
		seed["/api/neighborhood?q="+initial.Hanja] = g.Neighborhood(initial.Hanja)
		for _, glyph := range initial.Components {
			seed["/api/characters?q="+glyph] = g.FindCharacters(glyph)
		}
	}
	for path, contentType := range map[string]string{
		"/":                                     "text/html; charset=utf-8",
		"/robots.txt":                           "text/plain; charset=utf-8",
		"/app.js":                               "text/javascript; charset=utf-8",
		"/localization.mjs":                     "text/javascript; charset=utf-8",
		"/localization-ru.mjs":                  "text/javascript; charset=utf-8",
		"/localization-uz.mjs":                  "text/javascript; charset=utf-8",
		"/localization-ky.mjs":                  "text/javascript; charset=utf-8",
		"/localization-zh.mjs":                  "text/javascript; charset=utf-8",
		"/localization-ja.mjs":                  "text/javascript; charset=utf-8",
		"/localization-es.mjs":                  "text/javascript; charset=utf-8",
		"/localization-vi.mjs":                  "text/javascript; charset=utf-8",
		"/localization-ne.mjs":                  "text/javascript; charset=utf-8",
		"/localization-mn.mjs":                  "text/javascript; charset=utf-8",
		"/localization-th.mjs":                  "text/javascript; charset=utf-8",
		"/examples.mjs":                         "text/javascript; charset=utf-8",
		"/learning.mjs":                         "text/javascript; charset=utf-8",
		"/personal-dictionary.mjs":              "text/javascript; charset=utf-8",
		"/dictionary-form.mjs":                  "text/javascript; charset=utf-8",
		"/data-client.mjs":                      "text/javascript; charset=utf-8",
		"/network.mjs":                          "text/javascript; charset=utf-8",
		"/network-view.mjs":                     "text/javascript; charset=utf-8",
		"/network-routing.mjs":                  "text/javascript; charset=utf-8",
		"/wordbook.mjs":                         "text/javascript; charset=utf-8",
		"/wordbook-print.mjs":                   "text/javascript; charset=utf-8",
		"/wordbook-print.css":                   "text/css; charset=utf-8",
		"/fonts/NotoSans-Regular.woff2":         "font/woff2",
		"/fonts/NotoSans-Bold.woff2":            "font/woff2",
		"/fonts/NotoSansJP-Regular.woff2":       "font/woff2",
		"/fonts/NotoSansJP-Bold.woff2":          "font/woff2",
		"/fonts/NotoSansSC-Regular.woff2":       "font/woff2",
		"/fonts/NotoSansSC-Bold.woff2":          "font/woff2",
		"/fonts/NotoSansKR-Regular.woff2":       "font/woff2",
		"/fonts/NotoSansDevanagari-Regular.ttf": "font/ttf",
		"/fonts/NotoSansThai-Regular.ttf":       "font/ttf",
		"/fonts/NotoSansKR-SemiBold.woff2":      "font/woff2",
		"/fonts/LICENSE":                        "text/plain; charset=utf-8",
		"/styles.css":                           "text/css; charset=utf-8",
		"/favicon.svg":                          "image/svg+xml",
	} {
		name := path
		if name == "/" {
			name = "/index.html"
		}
		body, err := assets.ReadFile("static" + name)
		if err != nil {
			panic(err)
		}
		pattern := "GET " + path
		if path == "/" {
			body = withBootstrap(body, seed)
			pattern = "GET /{$}"
		}
		etag := fmt.Sprintf(`"%x"`, sha256.Sum256(body))
		mux.HandleFunc(pattern, func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", contentType)
			w.Header().Set("Cache-Control", "no-cache")
			w.Header().Set("ETag", etag)
			http.ServeContent(w, r, path, time.Time{}, bytes.NewReader(body))
		})
	}
	protection := http.NewCrossOriginProtection()
	protection.SetDenyHandler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		accountJSON(w, 403, map[string]string{"error": "cross_origin"})
	}))
	protected := protection.Handler(mux)
	policy := "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
	if options.GoogleClientID != "" {
		policy = "default-src 'self'; script-src 'self' https://accounts.google.com/gsi/client; style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style; img-src 'self'; connect-src 'self' https://accounts.google.com/gsi/; frame-src https://accounts.google.com/gsi/; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
	}
	// Forms submit through same-origin JSON requests. Native form submissions
	// must not put private fields in a URL if a UI event handler fails.
	policy += "; form-action 'none'"
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		if options.SecureCookies || r.TLS != nil {
			w.Header().Set("Strict-Transport-Security", "max-age=31536000")
		}
		if strings.HasPrefix(r.URL.Path, "/api/") {
			w.Header().Set("Cache-Control", "no-store")
			w.Header().Set("X-Robots-Tag", "noindex")
		}
		if options.GoogleClientID != "" {
			w.Header().Set("Cross-Origin-Opener-Policy", "same-origin-allow-popups")
			w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		}
		w.Header().Set("Content-Security-Policy", policy)
		protected.ServeHTTP(w, r)
	})
}

func withBootstrap(html []byte, seed map[string]any) []byte {
	// Marshal escapes HTML delimiters, including </script> in dataset text.
	data, err := json.Marshal(seed)
	if err != nil {
		panic(err)
	}
	return bytes.Replace(html, []byte("<!-- bootstrap-data -->"),
		append(append([]byte(`<script type="application/json" id="bootstrap-data">`), data...), []byte("</script>")...), 1)
}
