// Package webapp serves the local learning app and its read-only data API.
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

//go:embed static/*
var assets embed.FS

func New(g *graph.Graph, practice Practice) http.Handler {
	mux := http.NewServeMux()
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
	mux.HandleFunc("GET /api/stats", func(w http.ResponseWriter, r *http.Request) { jsonReply(w, g.Stats()) })
	mux.HandleFunc("GET /api/search", func(w http.ResponseWriter, r *http.Request) {
		level, valid := wordLevel(w, r)
		if !valid {
			return
		}
		if q, ok := query(w, r, false); ok {
			switch r.URL.Query().Get("mode") {
			case "", "all":
				jsonReply(w, g.SearchByLevel(q, 60, level))
			case "sound":
				jsonReply(w, g.SearchSoundByLevel(q, 60, level))
			default:
				w.Header().Set("Content-Type", "application/json; charset=utf-8")
				w.WriteHeader(http.StatusBadRequest)
				jsonReply(w, map[string]string{"error": "mode must be all or sound"})
			}
		}
	})
	mux.HandleFunc("GET /api/words", func(w http.ResponseWriter, r *http.Request) {
		if q, ok := query(w, r, true); ok {
			jsonReply(w, g.FindWords(q))
		}
	})
	mux.HandleFunc("GET /api/random-word", func(w http.ResponseWriter, r *http.Request) {
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
		selected, ok := g.RandomWordByLevel(word, hanja, level)
		if !ok {
			w.WriteHeader(http.StatusNotFound)
			jsonReply(w, map[string]string{"error": "no words available"})
			return
		}
		jsonReply(w, selected)
	})
	mux.HandleFunc("GET /api/characters", func(w http.ResponseWriter, r *http.Request) {
		if q, ok := query(w, r, true); ok {
			jsonReply(w, g.FindCharacters(q))
		}
	})
	mux.HandleFunc("GET /api/practice", func(w http.ResponseWriter, r *http.Request) { jsonReply(w, practice) })
	mux.HandleFunc("GET /api/neighborhood", func(w http.ResponseWriter, r *http.Request) {
		if q, ok := query(w, r, true); ok {
			jsonReply(w, g.Neighborhood(q))
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
	files := make(map[string]staticAsset)
	for path, contentType := range map[string]string{
		"/":                    "text/html; charset=utf-8",
		"/app.js":              "text/javascript; charset=utf-8",
		"/learning.mjs":        "text/javascript; charset=utf-8",
		"/data-client.mjs":     "text/javascript; charset=utf-8",
		"/network.mjs":         "text/javascript; charset=utf-8",
		"/network-view.mjs":    "text/javascript; charset=utf-8",
		"/network-routing.mjs": "text/javascript; charset=utf-8",
		"/wordbook.mjs":        "text/javascript; charset=utf-8",
		"/styles.css":          "text/css; charset=utf-8",
		"/favicon.svg":         "image/svg+xml",
	} {
		name := path
		if name == "/" {
			name = "/index.html"
		}
		body, err := assets.ReadFile("static" + name)
		if err != nil {
			panic(err)
		}
		if path == "/" {
			body = withBootstrap(body, seed)
		}
		files[path] = staticAsset{body, contentType, fmt.Sprintf(`"%x"`, sha256.Sum256(body))}
	}
	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		file, ok := files[r.URL.Path]
		if !ok {
			http.NotFound(w, r)
			return
		}
		// An explicit MIME type also avoids Windows registry enumeration on
		// the first request. Revalidate hashes so restarts never serve stale data.
		w.Header().Set("Content-Type", file.contentType)
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("ETag", file.etag)
		http.ServeContent(w, r, r.URL.Path, time.Time{}, bytes.NewReader(file.body))
	})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		// Graph node positions use inline styles; scripts and data stay same-origin.
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
		mux.ServeHTTP(w, r)
	})
}

type staticAsset struct {
	body              []byte
	contentType, etag string
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
