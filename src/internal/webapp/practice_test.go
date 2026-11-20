package webapp

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPracticeRejectsHomonymousOptions(t *testing.T) {
	g, practice, _ := testApp(t)
	// Both entries are valid and distinct in the dictionary. A quiz must still
	// reject them together because learners choose by the Korean word alone.
	practice.Questions[0].Options = []WordRef{{"흡연", "吸煙"}, {"흡연", "恰然"}}
	practice.Questions[0].Answer = practice.Questions[0].Options[0]
	data, err := json.Marshal(practice)
	if err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(t.TempDir(), "practice.json")
	if err := os.WriteFile(file, data, 0600); err != nil {
		t.Fatal(err)
	}
	_, err = LoadPractice(file, g)
	if err == nil || !strings.Contains(err.Error(), "homonyms are not allowed") || !strings.Contains(err.Error(), practice.Questions[0].ID) {
		t.Fatalf("expected the question's duplicate Korean label to be rejected, got %v", err)
	}
}

func TestAdditionalPracticeLanguages(t *testing.T) {
	g, practice, _ := testApp(t)
	practice.Questions = practice.Questions[:1]
	practice.Questions[0].PromptUz = "Qaysi soʻz mos?"
	practice.Questions[0].ExplanationUz = "Toʻgʻri soʻzni tanlang."
	practice.Questions[0].PromptKy = "Кайсы сөз туура келет?"
	practice.Questions[0].ExplanationKy = "Туура сөздү тандаңыз."
	file := filepath.Join(t.TempDir(), "practice.json")
	write := func() {
		t.Helper()
		data, err := json.Marshal(practice)
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(file, data, 0600); err != nil {
			t.Fatal(err)
		}
	}
	write()
	loaded, err := LoadPractice(file, g)
	if err != nil || loaded.Questions[0].PromptKy != practice.Questions[0].PromptKy || loaded.Questions[0].ExplanationUz != practice.Questions[0].ExplanationUz {
		t.Fatal("additional question languages were lost", err)
	}
	practice.Questions[0].ExplanationKy = "Бир.\nЭки."
	write()
	if _, err := LoadPractice(file, g); err == nil {
		t.Fatal("multiline translated question accepted")
	}
}

func TestPublicPracticeHasThreeChoicesAndFiveLanguages(t *testing.T) {
	_, practice, _ := testApp(t)
	for _, q := range practice.Questions {
		if len(q.Options) != 3 {
			t.Fatalf("%s: got %d choices, want 3", q.ID, len(q.Options))
		}
		for _, text := range []struct{ language, prompt, explanation string }{
			{"ko", q.PromptKo, q.ExplanationKo},
			{"en", q.PromptEn, q.ExplanationEn},
			{"ru", q.PromptRu, q.ExplanationRu},
			{"uz", q.PromptUz, q.ExplanationUz},
			{"ky", q.PromptKy, q.ExplanationKy},
		} {
			if text.prompt == "" || text.explanation == "" {
				t.Fatalf("%s: missing %s prompt or explanation", q.ID, text.language)
			}
			if q.ContrastGroup != "" {
				for _, option := range q.Options {
					if !strings.Contains(text.explanation, option.Word) {
						t.Fatalf("%s: %s explanation missing %s", q.ID, text.language, option.Word)
					}
				}
			}
		}
	}
}

func TestMeaningContrastGroups(t *testing.T) {
	g, practice, _ := testApp(t)
	for _, tc := range []struct {
		name          string
		group         string
		changeOptions bool
		wantError     string
	}{
		{"option order may differ", "related-words", false, ""},
		{"group cannot change its vocabulary", "related-words", true, "same word options"},
		{"identifier must be a stable key", "Related Words", false, "lowercase identifier"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			first, second := practice.Questions[0], practice.Questions[0]
			first.ContrastGroup, second.ContrastGroup = tc.group, tc.group
			second.ID = "second-contrast"
			second.Options = append([]WordRef(nil), first.Options...)
			second.Options[0], second.Options[1] = second.Options[1], second.Options[0]
			if tc.changeOptions {
				second.Options[0] = WordRef{"가격", "價格"}
			}
			data, err := json.Marshal(Practice{Version: 1, Source: "test", ReviewStatus: "draft", Questions: []Question{first, second}})
			if err != nil {
				t.Fatal(err)
			}
			file := filepath.Join(t.TempDir(), "practice.json")
			if err := os.WriteFile(file, data, 0600); err != nil {
				t.Fatal(err)
			}
			_, err = LoadPractice(file, g)
			if tc.wantError == "" && err != nil {
				t.Fatal(err)
			}
			if tc.wantError != "" && (err == nil || !strings.Contains(err.Error(), tc.wantError)) {
				t.Fatalf("expected %q, got %v", tc.wantError, err)
			}
		})
	}
}

func TestDatasetMeaningContrastsCoverEveryLevel(t *testing.T) {
	g, practice, _ := testApp(t)
	groups := map[string]map[string]bool{}
	for _, q := range practice.Questions {
		if q.ContrastGroup == "" {
			continue
		}
		if groups[q.WordLevel] == nil {
			groups[q.WordLevel] = map[string]bool{}
		}
		groups[q.WordLevel][q.ContrastGroup] = true
		if strings.Contains(q.PromptKo, q.Answer.Word) {
			t.Fatalf("%s reveals the answer in the prompt", q.ID)
		}
		for _, option := range q.Options {
			for _, match := range g.FindWords(option.Word) {
				if match.Word.Hanja == option.Hanja && match.Word.Level != q.WordLevel {
					t.Fatalf("%s mixes a %s option into %s contrasts", q.ID, match.Word.Level, q.WordLevel)
				}
			}
		}
	}
	for _, level := range []string{"easy", "normal", "hard", "classical"} {
		if len(groups[level]) < 8 {
			t.Fatalf("%s needs at least eight different contrast groups", level)
		}
	}
}
