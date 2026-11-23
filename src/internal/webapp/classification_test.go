package webapp

import (
	"encoding/json"
	"net/http/httptest"
	"net/url"
	"slices"
	"strings"
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
	for _, path := range []string{"/api/search?level=advanced", "/api/random-word?level=advanced", "/api/search?level=medium", "/api/search?tag=invalid", "/api/random-word?tag=invalid"} {
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

func TestPracticeUsesAnswerWordCategory(t *testing.T) {
	g, p, app := testApp(t)
	counts := map[string]int{}
	for _, q := range p.Questions {
		counts[q.WordLevel]++
		found := false
		for _, word := range g.FindWords(q.Answer.Word) {
			if word.Word.Hanja == q.Answer.Hanja {
				found = true
				if q.WordLevel != word.Word.Level || !slices.Equal(q.WordTags, word.Word.Tags) {
					t.Fatalf("%s: category must come from exact answer identity", q.ID)
				}
			}
		}
		if !found {
			t.Fatal(q.ID)
		}
	}
	for _, level := range []string{"easy", "normal", "hard", "classical"} {
		if counts[level] < 10 {
			t.Fatalf("%s needs a complete round", level)
		}
	}
	response := httptest.NewRecorder()
	app.ServeHTTP(response, httptest.NewRequest("GET", "/api/practice", nil))
	if strings.Contains(response.Body.String(), `"difficulty"`) {
		t.Fatal("practice API must expose only the word category")
	}
	var got Practice
	if err := json.Unmarshal(response.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.Questions[0].WordLevel == "" {
		t.Fatal("missing practice metadata")
	}

}

func TestIdiomFilters(t *testing.T) {
	g, _, app := testApp(t)
	for _, tc := range []struct {
		word, hanja string
		tags        []string
	}{
		{"새옹지마", "塞翁之馬", []string{graph.TagFourCharacter, graph.TagAllusion}},
		{"일석이조", "一石二鳥", []string{graph.TagFourCharacter}},
		{"사족", "蛇足", []string{graph.TagAllusion}},
		{"맹모삼천지교", "孟母三遷之敎", []string{graph.TagAllusion}},
		{"백미", "白眉", []string{graph.TagAllusion}},
		{"백미", "白米", nil},
		{"비아부화", "飛蛾赴火", []string{graph.TagFourCharacter, graph.TagAllusion}},
		{"도탄", "塗炭", []string{graph.TagAllusion}},
		{"근검절약", "勤儉節約", []string{graph.TagFourCharacter}},
		{"구구절절", "句句節節", nil},
		{"행정소송", "行政訴訟", nil},
	} {
		if !slices.ContainsFunc(g.FindWords(tc.word), func(row graph.WordResult) bool {
			return row.Word.Hanja == tc.hanja && slices.Equal(row.Word.Tags, tc.tags)
		}) {
			t.Errorf("wrong tags on %s/%s", tc.word, tc.hanja)
		}
	}
	for _, mode := range []string{"sound", "all"} {
		query := ""
		if mode == "sound" {
			query = "사"
		}
		params := url.Values{"q": {query}, "mode": {mode}, "level": {"hard"}, "tag": {graph.TagAllusion}}
		response := httptest.NewRecorder()
		app.ServeHTTP(response, httptest.NewRequest("GET", "/api/search?"+params.Encode(), nil))
		var got graph.SearchResult
		if err := json.Unmarshal(response.Body.Bytes(), &got); err != nil {
			t.Fatal(err)
		}
		full := g.Search(query, 10000)
		if mode == "sound" {
			full = g.SearchSound(query, 10000)
		}
		count := 0
		for _, word := range full.Words {
			if word.Level == "hard" && slices.Contains(word.Tags, graph.TagAllusion) {
				count++
			}
		}
		if count == 0 || got.WordCount != count || len(got.Words) != min(count, 60) {
			t.Fatalf("%s count %d, got %d (%d returned)", mode, count, got.WordCount, len(got.Words))
		}
		for _, word := range got.Words {
			if word.Level != "hard" || !slices.Contains(word.Tags, graph.TagAllusion) {
				t.Fatalf("unexpected search result: %s", word.Word)
			}
		}
	}
}
