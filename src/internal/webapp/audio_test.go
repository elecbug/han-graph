package webapp

import (
	"archive/zip"
	"crypto/sha256"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/elecbug/han-graph/internal/graph"
)

func TestKoreanAudioServesOnlyIndexedClipsAndRanges(t *testing.T) {
	root := t.TempDir()
	catalog, err := LoadKoreanAudio(root)
	if err != nil || catalog.url("가정") != "" {
		t.Fatalf("optional corpus: %v", err)
	}
	dir := filepath.Join(root, "audio", "ko")
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
	f, err := os.Create(filepath.Join(dir, "00000.zip"))
	if err != nil {
		t.Fatal(err)
	}
	archive := zip.NewWriter(f)
	member, err := archive.CreateHeader(&zip.FileHeader{Name: fmt.Sprintf("%x.mp3", sha256.Sum256([]byte("가정"))), Method: zip.Store})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := member.Write([]byte("0123456789")); err != nil {
		t.Fatal(err)
	}
	if err := archive.Close(); err != nil {
		t.Fatal(err)
	}
	if err := f.Close(); err != nil {
		t.Fatal(err)
	}
	catalog, err = LoadKoreanAudio(root)
	if err != nil {
		t.Fatal(err)
	}
	result := catalog.words([]graph.WordResult{{WordSense: graph.WordSense{Word: graph.Word{Word: "가정"}, Example: "새 예문"}}})[0]
	if result.WordAudio == "" || result.ExampleAudio != "" {
		t.Fatalf("unexpected audio links: %+v", result)
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /audio/ko/{clip}", catalog.serve)
	r := httptest.NewRequest("GET", result.WordAudio, nil)
	r.Header.Set("Range", "bytes=2-5")
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, r)
	if w.Code != 206 || w.Body.String() != "2345" || w.Header().Get("Content-Type") != "audio/mpeg" || w.Header().Get("Content-Range") != "bytes 2-5/10" {
		t.Fatalf("unexpected range response: %v", w)
	}
	// Replacing a batch on disk cannot publish different bytes under a cached URL.
	replacement := filepath.Join(dir, "replacement")
	if err := os.WriteFile(replacement, []byte("updated archive"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(replacement, filepath.Join(dir, "00000.zip")); err != nil {
		t.Fatal(err)
	}
	replaced := httptest.NewRecorder()
	mux.ServeHTTP(replaced, httptest.NewRequest("GET", result.WordAudio, nil))
	if replaced.Code != http.StatusServiceUnavailable {
		t.Fatalf("stale index: %d", replaced.Code)
	}
	for _, path := range []string{"/audio/ko/00000.zip", result.WordAudio + "x"} {
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
		if w.Code != 404 {
			t.Errorf("%s: %d", path, w.Code)
		}
	}
}
