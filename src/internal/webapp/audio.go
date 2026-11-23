package webapp

import (
	"archive/zip"
	"crypto/sha256"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/elecbug/han-graph/internal/graph"
)

type audioClip struct {
	archive      string
	source       os.FileInfo
	offset, size int64
	filename     string
}

// KoreanAudio indexes the stored MP3 members. Requests only open a single archive
// and can read byte ranges without decompressing or buffering an entire batch.
type KoreanAudio map[string]audioClip

var clipMember = regexp.MustCompile(`^[0-9a-f]{64}\.mp3$`)

func LoadKoreanAudio(dataset string) (KoreanAudio, error) {
	dir := filepath.Join(dataset, "audio", "ko")
	entries, err := os.ReadDir(dir)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	catalog := make(KoreanAudio)
	for _, entry := range entries {
		if filepath.Ext(entry.Name()) != ".zip" {
			continue
		}
		path := filepath.Join(dir, entry.Name())
		if err := catalog.readBatch(path); err != nil {
			return nil, fmt.Errorf("Korean audio %s: %w", entry.Name(), err)
		}
	}
	return catalog, nil
}

func (a KoreanAudio) readBatch(path string) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()
	source, err := file.Stat()
	if err != nil {
		return err
	}
	z, err := zip.NewReader(file, source.Size())
	if err != nil {
		return err
	}
	for _, f := range z.File {
		if !clipMember.MatchString(f.Name) || f.Method != zip.Store || f.UncompressedSize64 == 0 || f.UncompressedSize64 != f.CompressedSize64 || f.CompressedSize64 > 4<<20 {
			return fmt.Errorf("invalid MP3 entry %q", f.Name)
		}
		id := strings.TrimSuffix(f.Name, ".mp3")
		if _, exists := a[id]; exists {
			return fmt.Errorf("duplicate clip %s", id)
		}
		offset, err := f.DataOffset()
		if err != nil {
			return err
		}
		a[id] = audioClip{archive: path, source: source, offset: offset, size: int64(f.CompressedSize64), filename: fmt.Sprintf("%s-%08x.mp3", id, f.CRC32)}
	}
	return nil
}

func (a KoreanAudio) url(text string) string {
	if text == "" || len(a) == 0 {
		return ""
	}
	c, ok := a[fmt.Sprintf("%x", sha256.Sum256([]byte(text)))]
	if !ok {
		return ""
	}
	return "/audio/ko/" + c.filename
}

type wordWithAudio struct {
	graph.WordResult
	WordAudio    string `json:"word_audio,omitempty"`
	ExampleAudio string `json:"example_audio,omitempty"`
}

func (a KoreanAudio) words(words []graph.WordResult) []wordWithAudio {
	results := make([]wordWithAudio, len(words))
	for i, word := range words {
		results[i] = wordWithAudio{WordResult: word, WordAudio: a.url(word.Word.Word), ExampleAudio: a.url(word.Example)}
	}
	return results
}

func (a KoreanAudio) serve(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("clip")
	id, _, _ := strings.Cut(name, "-")
	c, ok := a[id]
	if !ok || c.filename != name {
		http.NotFound(w, r)
		return
	}
	file, err := os.Open(c.archive)
	if err != nil {
		http.Error(w, "Audio unavailable", http.StatusServiceUnavailable)
		return
	}
	defer file.Close()
	// A maintenance run atomically replaces changed batches. An old index
	// must never cache newer bytes under the previous clip URL.
	source, err := file.Stat()
	if err != nil || !os.SameFile(c.source, source) {
		http.Error(w, "Audio index changed", http.StatusServiceUnavailable)
		return
	}
	w.Header().Set("Content-Type", "audio/mpeg")
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	w.Header().Set("ETag", fmt.Sprintf("%q", name))
	http.ServeContent(w, r, name, time.Time{}, io.NewSectionReader(file, c.offset, c.size))
}
