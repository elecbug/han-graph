package webapp

import (
	"encoding/json"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/elecbug/han-graph/internal/graph"
)

func TestVocabularyCategoryAPI(t *testing.T) {
	g, _, app := testApp(t)
	for _, mode := range []string{"all", "sound"} {
		for _, level := range []string{"all", "easy", "normal", "hard", "classical"} {
			params := url.Values{"q": {"하"}, "mode": {mode}, "level": {level}}
			response := httptest.NewRecorder()
			app.ServeHTTP(response, httptest.NewRequest("GET", "/api/search?"+params.Encode(), nil))
			var got graph.SearchResult
			if response.Code != 200 {
				t.Fatal(response.Code, response.Body.String())
			}
			if err := json.Unmarshal(response.Body.Bytes(), &got); err != nil {
				t.Fatal(err)
			}
			all := g.Search("하", 10000)
			if mode == "sound" {
				all = g.SearchSound("하", 10000)
			}
			expected := 0
			for _, word := range all.Words {
				if level == "all" || word.Level == level {
					expected++
				}
			}
			if got.WordCount != expected {
				t.Fatalf("%s/%s: got %d want %d", mode, level, got.WordCount, expected)
			}
			for _, word := range got.Words {
				if level != "all" && word.Level != level {
					t.Fatal("wrong category", word)
				}
			}
		}
	}
	for _, path := range []string{"/api/search?level=advanced", "/api/random-word?level=advanced", "/api/search?level=medium"} {
		response := httptest.NewRecorder()
		app.ServeHTTP(response, httptest.NewRequest("GET", path, nil))
		if response.Code != 400 {
			t.Fatalf("%s: %d", path, response.Code)
		}
	}
	for _, level := range []string{"easy", "normal", "hard", "classical"} {
		response := httptest.NewRecorder()
		app.ServeHTTP(response, httptest.NewRequest("GET", "/api/random-word?level="+level, nil))
		var word graph.Word
		if response.Code != 200 {
			t.Fatal(response.Code, response.Body.String())
		}
		if err := json.Unmarshal(response.Body.Bytes(), &word); err != nil {
			t.Fatal(err)
		}
		if word.Level != level {
			t.Fatalf("random word category %s != %s", word.Level, level)
		}
	}
}

func TestPracticeCategoriesAndDifficulties(t *testing.T) {
	g, p, app := testApp(t)
	counts := map[string]int{}
	for _, q := range p.Questions {
		counts[q.Difficulty]++
		found := false
		for _, word := range g.FindWords(q.Answer.Word) {
			if word.Word.Hanja == q.Answer.Hanja {
				found = true
				if q.WordLevel != word.Word.Level {
					t.Fatalf("%s: category must come from exact answer identity", q.ID)
				}
			}
		}
		if !found {
			t.Fatal(q.ID)
		}
	}
	for _, difficulty := range []string{"easy", "medium", "hard"} {
		if counts[difficulty] < 10 {
			t.Fatalf("%s needs a complete round", difficulty)
		}
	}
	response := httptest.NewRecorder()
	app.ServeHTTP(response, httptest.NewRequest("GET", "/api/practice", nil))
	var got Practice
	if err := json.Unmarshal(response.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.Questions[0].Difficulty == "" || got.Questions[0].WordLevel == "" {
		t.Fatal("missing practice metadata")
	}

}
