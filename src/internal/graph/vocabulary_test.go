package graph

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestWordCategoryValidation(t *testing.T) {
	for _, level := range []string{"easy", "normal", "hard", "classical"} {
		t.Run(level, func(t *testing.T) {
			files := fixture(t)
			files["word.jsonl"] = strings.ReplaceAll(files["word.jsonl"], `"level":"normal"`, `"level":"`+level+`"`)
			g, err := Load(writeFixture(t, files))
			if err != nil {
				t.Fatal(err)
			}
			word, ok := g.RandomWordByLevel("", "", level)
			if !ok || word.Level != level {
				t.Fatalf("category cannot be loaded and selected: %+v", word)
			}
		})
	}
	for _, level := range []string{"all", "medium", "advanced", "Easy", "unknown"} {
		t.Run("invalid_"+level, func(t *testing.T) {
			files := fixture(t)
			files["word.jsonl"] = strings.Replace(files["word.jsonl"], `"level":"normal"`, `"level":"`+level+`"`, 1)
			_, err := Load(writeFixture(t, files))
			if err == nil || !strings.Contains(err.Error(), "word.jsonl:1:") || !strings.Contains(err.Error(), "level must be") {
				t.Fatalf("invalid category must identify its source row: %v", err)
			}
		})
	}
}

func TestVocabularyCategoriesUseMeaningRatherThanSpellingLength(t *testing.T) {
	g, err := Load(filepath.Join("..", "..", "..", "dataset"))
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct{ word, hanja, level string }{
		{"가격", "價格", "easy"},
		{"검은색", "검은色", "easy"},
		{"휴대전화", "携帶電話", "easy"},
		{"보완", "補完", "normal"},
		{"견갑하근", "肩胛下筋", "hard"},
		{"변증법", "辨證法", "hard"},
		{"보석", "寶石", "easy"},
		{"보석", "保釋", "hard"},
		{"가사", "歌詞", "easy"},
		{"가사", "家祠", "classical"},
		{"자왈", "子曰", "classical"},
	} {
		found := false
		for _, result := range g.FindWords(tc.word) {
			if result.Word.Hanja == tc.hanja {
				found = true
				if result.Word.Level != tc.level {
					t.Errorf("%s/%s: level %s, want %s", tc.word, tc.hanja, result.Word.Level, tc.level)
				}
			}
		}
		if !found {
			t.Errorf("missing representative word %s/%s", tc.word, tc.hanja)
		}
	}
}
