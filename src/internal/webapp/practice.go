package webapp

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/elecbug/han-graph/internal/graph"
)

type WordRef struct {
	Word  string `json:"word"`
	Hanja string `json:"hanja"`
}

type Question struct {
	WordLevel     string    `json:"word_level,omitempty"`
	ID            string    `json:"id"`
	PromptKo      string    `json:"prompt_ko"`
	PromptEn      string    `json:"prompt_en"`
	Answer        WordRef   `json:"answer"`
	Options       []WordRef `json:"options"`
	ExplanationKo string    `json:"explanation_ko"`
	ExplanationEn string    `json:"explanation_en"`
}

type Practice struct {
	Version      int        `json:"version"`
	Source       string     `json:"source"`
	ReviewStatus string     `json:"review_status"`
	Questions    []Question `json:"questions"`
}

func LoadPractice(filename string, g *graph.Graph) (Practice, error) {
	var practice Practice
	data, err := os.ReadFile(filename)
	if err != nil {
		return practice, err
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&practice); err != nil {
		return practice, fmt.Errorf("%s: %w", filename, err)
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return practice, fmt.Errorf("%s: expected one JSON object", filename)
	}
	if practice.Version != 1 || strings.TrimSpace(practice.Source) == "" || practice.ReviewStatus != "draft" || len(practice.Questions) == 0 {
		return practice, fmt.Errorf("%s: expected version=1, source, review_status=draft and questions", filename)
	}
	ids := make(map[string]bool)
	for index := range practice.Questions {
		q := &practice.Questions[index]
		fail := func(message string) (Practice, error) {
			return practice, fmt.Errorf("%s: question %q: %s", filename, q.ID, message)
		}
		for _, value := range []string{q.ID, q.PromptKo, q.PromptEn, q.ExplanationKo, q.ExplanationEn} {
			if strings.TrimSpace(value) == "" {
				return fail("missing question text")
			}
		}
		if ids[q.ID] || len(q.Options) < 2 || len(q.Options) > 4 {
			return fail("expected unique ID and 2–4 options")
		}
		ids[q.ID] = true
		options := make(map[WordRef]bool)
		labels := make(map[string]bool)
		for _, option := range q.Options {
			if options[option] {
				return fail("duplicate option")
			}
			label := strings.Join(strings.Fields(option.Word), "")
			if labels[label] {
				return fail("options must use distinct Korean words; homonyms are not allowed")
			}
			labels[label] = true
			options[option] = true
			found := false
			for _, word := range g.FindWords(option.Word) {
				if word.Word.Hanja == option.Hanja {
					found = true
					if option == q.Answer {
						q.WordLevel = word.Word.Level
					}
				}
			}
			if !found {
				return fail("option references unknown word/hanja")
			}
		}
		if !options[q.Answer] {
			return fail("answer must be one of the options")
		}
	}
	return practice, nil
}
