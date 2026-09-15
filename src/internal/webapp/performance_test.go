package webapp

import (
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/elecbug/han-graph/internal/graph"
)

// Run in a fresh test process (-count=1) to include OS first-use overhead.
func TestColdStartTiming(t *testing.T) {
	start := time.Now()
	dir := filepath.Join("..", "..", "..", "dataset")
	g, err := graph.Load(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("dataset_load=%s", time.Since(start))
	p, err := LoadPractice(filepath.Join(dir, "practice.json"), g)
	if err != nil {
		t.Fatal(err)
	}
	app := New(g, p)
	for _, path := range []string{"/", "/app.js", "/styles.css", "/learning.mjs", "/api/search"} {
		start = time.Now()
		response := httptest.NewRecorder()
		app.ServeHTTP(response, httptest.NewRequest("GET", path, nil))
		if response.Code != 200 {
			t.Fatalf("%s: status %d", path, response.Code)
		}
		t.Logf("%s duration=%s bytes=%d", path, time.Since(start), response.Body.Len())
	}
}
