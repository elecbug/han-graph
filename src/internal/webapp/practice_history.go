package webapp

import (
	"net/http"
	"slices"

	"github.com/elecbug/han-graph/internal/account"
)

func (q Question) localizedPrompts() map[string]string {
	return map[string]string{
		"ko": q.PromptKo, "en": q.PromptEn, "ru": q.PromptRu, "uz": q.PromptUz,
		"ky": q.PromptKy, "zh": q.PromptZh, "ja": q.PromptJa, "es": q.PromptEs,
		"vi": q.PromptVi, "ne": q.PromptNe, "mn": q.PromptMn, "th": q.PromptTh,
	}
}

func registerPracticeHistory(mux *http.ServeMux, store *account.Store, practice Practice, resolve func(http.ResponseWriter, *http.Request, bool) (string, bool)) {
	questions := make(map[string]Question, len(practice.Questions))
	counts := make(map[string]int)
	for _, q := range practice.Questions {
		questions[q.ID] = q
		counts[q.WordLevel]++
	}
	mux.HandleFunc("GET /api/account/practice", func(w http.ResponseWriter, r *http.Request) {
		id, ok := resolve(w, r, false)
		if !ok {
			return
		}
		page, err := store.WithContext(r.Context()).PracticeHistory(id, r.URL.Query().Get("after"))
		if err != nil {
			accountError(w, err)
			return
		}
		// Supply newly available translations only for the same saved prompt.
		for _, round := range page.Rounds {
			for _, answer := range round.Answers {
				q, ok := questions[answer.Question]
				if !ok || answer.Prompts["ko"] != q.PromptKo || answer.Prompts["en"] != q.PromptEn {
					continue
				}
				for language, text := range q.localizedPrompts() {
					if text != "" && answer.Prompts[language] == "" {
						answer.Prompts[language] = text
					}
				}
			}
		}
		accountJSON(w, 200, page)
	})
	mux.HandleFunc("POST /api/account/practice", func(w http.ResponseWriter, r *http.Request) {
		id, ok := resolve(w, r, true)
		if !ok {
			return
		}
		var submission struct {
			ID      string `json:"id"`
			Level   string `json:"level"`
			Answers []struct {
				Question string  `json:"question"`
				Selected WordRef `json:"selected"`
			} `json:"answers"`
		}
		if !accountBody(w, r, &submission) {
			return
		}
		expected := min(10, counts[submission.Level])
		if expected == 0 || len(submission.Answers) != expected {
			accountError(w, account.ErrInvalid)
			return
		}
		round := account.PracticeRound{ID: submission.ID, Level: submission.Level}
		seen := make(map[string]bool)
		for _, a := range submission.Answers {
			q, exists := questions[a.Question]
			if !exists || q.WordLevel != submission.Level || seen[q.ID] || !slices.Contains(q.Options, a.Selected) {
				accountError(w, account.ErrInvalid)
				return
			}
			seen[q.ID] = true
			round.Answers = append(round.Answers, account.PracticeAnswer{
				Question: q.ID, Selected: account.Ref(a.Selected), Answer: account.Ref(q.Answer),
				Prompts: q.localizedPrompts(),
			})
		}
		if err := store.WithContext(r.Context()).SavePractice(id, round); err != nil {
			accountError(w, err)
			return
		}
		accountJSON(w, 200, map[string]bool{"saved": true})
	})
}
