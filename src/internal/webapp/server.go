// Package webapp serves the local learning app and its read-only data API.
package webapp

import (
	"embed"
	"encoding/json"
	"io/fs"
	"net/http"
	"strings"
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
		if q, ok := query(w, r, false); ok {
			jsonReply(w, g.Search(q, 60))
		}
	})
	mux.HandleFunc("GET /api/words", func(w http.ResponseWriter, r *http.Request) {
		if q, ok := query(w, r, true); ok {
			jsonReply(w, g.FindWords(q))
		}
	})
	mux.HandleFunc("GET /api/characters", func(w http.ResponseWriter, r *http.Request) {
		if q, ok := query(w, r, true); ok {
			jsonReply(w, g.FindCharacters(q))
		}
	})
	mux.HandleFunc("GET /api/practice", func(w http.ResponseWriter, r *http.Request) { jsonReply(w, practice) })
	static, _ := fs.Sub(assets, "static")
	files := http.FileServer(http.FS(static))
	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" && r.URL.Path != "/app.js" && r.URL.Path != "/styles.css" && r.URL.Path != "/learning.mjs" && r.URL.Path != "/favicon.svg" {
			http.NotFound(w, r)
			return
		}
		files.ServeHTTP(w, r)
	})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		// Graph node positions use inline styles; scripts and data stay same-origin.
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
		mux.ServeHTTP(w, r)
	})
}
