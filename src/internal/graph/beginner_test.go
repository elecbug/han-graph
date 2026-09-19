package graph

import (
	"encoding/csv"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSingleMixedAndUnannotatedWords(t *testing.T) {
	files := fixture(t)
	files["word.jsonl"] += `{"level":"normal","word":"수","hanja":"水","meaning_ko":"물","meaning_en":"water","components":["水"]}` + "\n" +
		`{"level":"normal","word":"분수꼴","hanja":"分數꼴","meaning_ko":"분수의 형태","meaning_en":"fraction form","components":["分","數"]}` + "\n" +
		`{"level":"normal","word":"분","hanja":"","meaning_ko":"사람을 높여 세는 말","meaning_en":"honorific counter for people","components":[]}` + "\n"
	g, err := Load(writeFixture(t, files))
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		word  string
		count int
	}{{"수", 1}, {"분수꼴", 2}, {"분", 0}} {
		got := g.FindWords(tc.word)
		if len(got) != 1 || len(got[0].Components) != tc.count {
			t.Fatalf("%s: %+v", tc.word, got)
		}
	}
	if len(g.FindWords("")) != 0 {
		t.Fatal("empty Hanja must not create an empty lookup key")
	}
	if n := g.Neighborhood("분"); len(n.Roots) != 0 || len(n.Words) != 0 {
		t.Fatalf("unannotated word acquired character-reading neighbors: %+v", n)
	}
	if n := g.Neighborhood("水"); len(n.Roots) != 1 || n.Roots[0] != "水" {
		t.Fatalf("single-character word has no graph: %+v", n)
	}
	for _, w := range g.SearchSound("분", 100).Words {
		if w.Hanja == "" {
			t.Fatal("unannotated word matched a Hanja reading")
		}
	}
}

func TestInvalidMixedWordForms(t *testing.T) {
	for _, record := range []string{
		`{"level":"normal","word":"물","hanja":"","meaning_ko":"물","meaning_en":"water","components":["水"]}`,
		`{"level":"normal","word":"물","hanja":"","meaning_ko":"물","meaning_en":"water","components":null}`,
		`{"level":"normal","word":"분수꼴","hanja":"分數값","meaning_ko":"형태","meaning_en":"form","components":["分","數"]}`,
		`{"level":"normal","word":"분수꼴","hanja":"分數꼴","meaning_ko":"형태","meaning_en":"form","components":["數","分"]}`,
		`{"level":"normal","word":"물","hanja":"물","meaning_ko":"물","meaning_en":"water","components":[]}`,
	} {
		files := fixture(t)
		files["word.jsonl"] += record + "\n"
		if _, err := Load(writeFixture(t, files)); err == nil {
			t.Fatalf("accepted malformed form: %s", record)
		}
	}
}

func TestRepositoryBeginnerCoverage(t *testing.T) {
	dir := filepath.Join("..", "..", "..", "dataset")
	g, err := Load(dir)
	if err != nil {
		t.Fatal(err)
	}
	source, err := os.Open(filepath.Join(dir, "sources", "nikl_2003_beginner.tsv"))
	if err != nil {
		t.Fatal(err)
	}
	defer source.Close()
	reader := csv.NewReader(source)
	reader.Comma = '\t'
	rows, err := reader.ReadAll()
	if err != nil || len(rows) != 983 {
		t.Fatalf("expected header and all 982 source rows, got %d: %v", len(rows), err)
	}
	data, err := os.ReadFile(filepath.Join(dir, "sources", "nikl_2003_beginner_coverage.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	seen := map[int]bool{}
	statusCounts := map[string]int{}
	normalizedCount := 0
	for _, line := range strings.Split(strings.TrimSpace(string(data)), "\n") {
		var entry struct {
			SourceRow     int    `json:"source_row"`
			Word          string `json:"word"`
			Hanja         string `json:"hanja"`
			Status        string `json:"status"`
			Reason        string `json:"reason"`
			Normalization string `json:"normalization"`
		}
		if err := json.Unmarshal([]byte(line), &entry); err != nil {
			t.Fatal(err)
		}
		if entry.SourceRow < 2 || entry.SourceRow > len(rows) || seen[entry.SourceRow] {
			t.Fatalf("invalid or repeated source row: %+v", entry)
		}
		seen[entry.SourceRow] = true
		row := rows[entry.SourceRow-1]
		sourceWord := strings.TrimRight(row[1], "0123456789")
		expectedWord := sourceWord
		switch entry.Normalization {
		case "":
		case "strip_hada":
			if !strings.HasSuffix(sourceWord, "하다") || entry.Hanja == "" || strings.HasSuffix(entry.Hanja, "하다") {
				t.Fatalf("invalid -하다 normalization: %+v", entry)
			}
			expectedWord = strings.TrimSuffix(sourceWord, "하다")
			normalizedCount++
			for _, previous := range g.FindWords(sourceWord) {
				if previous.Word.Hanja == entry.Hanja+"하다" {
					t.Errorf("normalized derivative remains in dictionary: %+v", previous.Word)
				}
			}
		default:
			t.Fatalf("unknown normalization: %+v", entry)
		}
		if row[4] != "A" || expectedWord != entry.Word {
			t.Fatalf("wrong source mapping: %v -> %+v", row, entry)
		}
		found := false
		for _, match := range g.FindWords(entry.Word) {
			if match.Word.Hanja == entry.Hanja {
				found = true
			}
		}
		statusCounts[entry.Status]++
		switch entry.Status {
		case "excluded":
			if entry.Hanja != "" || entry.Reason != "no_hanja" || found {
				t.Errorf("excluded entry must have no Hanja and be absent from dictionary: %+v (found=%t)", entry, found)
			}
		case "existing", "added":
			if entry.Hanja == "" || entry.Reason != "" || !found {
				t.Errorf("included entry must reference a dictionary word with Hanja: %+v (found=%t)", entry, found)
			}
		default:
			t.Errorf("unknown coverage status: %+v", entry)
		}
	}
	if len(seen) != len(rows)-1 {
		t.Fatalf("covered %d of %d rows", len(seen), len(rows)-1)
	}
	if statusCounts["excluded"] != 609 || statusCounts["existing"] != 168 || statusCounts["added"] != 205 {
		t.Fatalf("unexpected beginner coverage: %+v", statusCounts)
	}
	if normalizedCount != 40 {
		t.Fatalf("normalized %d source rows, want 40", normalizedCount)
	}
	for _, word := range g.SearchSound("검", 10000).Words {
		if word.Word == "검은색" {
			t.Errorf("Korean suffix or native word matched Hanja reading: %s", word.Word)
		}
	}
	for _, word := range []string{"영화", "전화", "공부", "강", "미안", "유명", "이해", "죄송", "중요", "출발", "친절"} {
		if len(g.FindWords(word)) == 0 {
			t.Errorf("missing common word %s", word)
		}
	}
}

func TestRepositoryExactBasicWordsStayVisible(t *testing.T) {
	g, err := Load(filepath.Join("..", "..", "..", "dataset"))
	if err != nil {
		t.Fatal(err)
	}
	for _, query := range []string{"전화", "강", "이"} {
		result := g.SearchByLevel(query, 1, "easy")
		if len(result.Words) != 1 || result.Words[0].Word != query || result.WordCount < 2 {
			t.Errorf("exact word hidden by partial matches for %s: %+v", query, result)
		}
	}
}
