package webapp

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"regexp"
	"strings"

	"github.com/elecbug/han-graph/internal/graph"
)

type WordRef struct {
	Word  string `json:"word"`
	Hanja string `json:"hanja"`
}

type Question struct {
	ContrastGroup string    `json:"contrast_group,omitempty"`
	WordLevel     string    `json:"word_level,omitempty"`
	ID            string    `json:"id"`
	PromptKo      string    `json:"prompt_ko"`
	PromptEn      string    `json:"prompt_en"`
	PromptRu      string    `json:"prompt_ru,omitempty"`
	PromptUz      string    `json:"prompt_uz,omitempty"`
	PromptKy      string    `json:"prompt_ky,omitempty"`
	PromptZh      string    `json:"prompt_zh,omitempty"`
	PromptJa      string    `json:"prompt_ja,omitempty"`
	PromptEs      string    `json:"prompt_es,omitempty"`
	PromptVi      string    `json:"prompt_vi,omitempty"`
	PromptNe      string    `json:"prompt_ne,omitempty"`
	PromptMn      string    `json:"prompt_mn,omitempty"`
	PromptTh      string    `json:"prompt_th,omitempty"`
	Answer        WordRef   `json:"answer"`
	Options       []WordRef `json:"options"`
	ExplanationKo string    `json:"explanation_ko"`
	ExplanationEn string    `json:"explanation_en"`
	ExplanationRu string    `json:"explanation_ru,omitempty"`
	ExplanationUz string    `json:"explanation_uz,omitempty"`
	ExplanationKy string    `json:"explanation_ky,omitempty"`
	ExplanationZh string    `json:"explanation_zh,omitempty"`
	ExplanationJa string    `json:"explanation_ja,omitempty"`
	ExplanationEs string    `json:"explanation_es,omitempty"`
	ExplanationVi string    `json:"explanation_vi,omitempty"`
	ExplanationNe string    `json:"explanation_ne,omitempty"`
	ExplanationMn string    `json:"explanation_mn,omitempty"`
	ExplanationTh string    `json:"explanation_th,omitempty"`
}

type Practice struct {
	Version   int        `json:"version"`
	Source    string     `json:"source"`
	Questions []Question `json:"questions"`
}

func LoadPractice(filename string, g *graph.Graph) (Practice, error) {
	var practice Practice
	data, err := os.ReadFile(filename)
	if err != nil {
		return practice, err
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	// Older version-1 files may carry additional editorial metadata.
	input := struct {
		*Practice
		LegacyStatus string `json:"review_status"`
	}{Practice: &practice}
	if err := decoder.Decode(&input); err != nil {
		return practice, fmt.Errorf("%s: %w", filename, err)
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return practice, fmt.Errorf("%s: expected one JSON object", filename)
	}
	if practice.Version != 1 || strings.TrimSpace(practice.Source) == "" || len(practice.Questions) == 0 {
		return practice, fmt.Errorf("%s: expected version=1, source and questions", filename)
	}
	ids := make(map[string]bool)
	contrastGroups := make(map[string]map[WordRef]bool)
	groupID := regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)
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
		for _, value := range []string{
			q.PromptRu, q.PromptUz, q.PromptKy, q.PromptZh, q.PromptJa,
			q.PromptEs, q.PromptVi, q.PromptNe, q.PromptMn, q.PromptTh,
			q.ExplanationRu, q.ExplanationUz, q.ExplanationKy, q.ExplanationZh, q.ExplanationJa,
			q.ExplanationEs, q.ExplanationVi, q.ExplanationNe, q.ExplanationMn, q.ExplanationTh,
		} {
			if value != "" && (strings.TrimSpace(value) != value || strings.ContainsAny(value, "\r\n")) {
				return fail("Translated question text must be a single nonempty line")
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
		if q.ContrastGroup != "" {
			if len(q.ContrastGroup) > 80 || !groupID.MatchString(q.ContrastGroup) {
				return fail("contrast_group must be a short lowercase identifier")
			}
			if previous, exists := contrastGroups[q.ContrastGroup]; exists {
				if len(previous) != len(options) {
					return fail("contrast group must keep the same word options")
				}
				for option := range options {
					if !previous[option] {
						return fail("contrast group must keep the same word options")
					}
				}
			} else {
				contrastGroups[q.ContrastGroup] = options
			}
		}
		if !options[q.Answer] {
			return fail("answer must be one of the options")
		}
	}
	return practice, nil
}
