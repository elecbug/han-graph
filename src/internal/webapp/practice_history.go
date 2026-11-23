package webapp

import (
	"net/http"
	"slices"

	"github.com/elecbug/han-graph/internal/account"
	"github.com/elecbug/han-graph/internal/graph"
)

func (q Question) localizedPrompts() map[string]string {
	return map[string]string{
		"ko": q.PromptKo, "en": q.PromptEn, "ru": q.PromptRu, "uz": q.PromptUz,
		"ky": q.PromptKy, "zh": q.PromptZh, "ja": q.PromptJa, "es": q.PromptEs,
		"vi": q.PromptVi, "ne": q.PromptNe, "mn": q.PromptMn, "th": q.PromptTh,
	}
}

type reviewTarget struct {
	RoundID  string  `json:"round_id"`
	Question string  `json:"question"`
	Answer   WordRef `json:"answer"`
}

// Only a word's latest attempt determines whether it still needs review.
// Read newest first, including history saved before review was introduced.
func pendingReview(store *account.Store, owner string, vocabulary map[WordRef]bool) ([]reviewTarget, error) {
	targets := []reviewTarget{}
	seen := make(map[WordRef]bool)
	for cursor := ""; ; {
		page, err := store.PracticeHistory(owner, cursor)
		if err != nil {
			return nil, err
		}
		for _, round := range page.Rounds {
			for _, answer := range slices.Backward(round.Answers) {
				ref := WordRef(answer.Answer)
				if seen[ref] || !vocabulary[ref] {
					continue
				}
				seen[ref] = true
				if answer.Selected != answer.Answer {
					targets = append(targets, reviewTarget{round.ID, answer.Question, ref})
					if len(targets) == 10 {
						return targets, nil
					}
				}
			}
		}
		if page.Next == "" || len(seen) == len(vocabulary) {
			return targets, nil
		}
		cursor = page.Next
	}
}

// Each missed answer in a source round can supply one question in a retry.
type reviewSources map[string]map[account.Ref]int

func (sources reviewSources) take(db *account.Store, owner, roundID string, answer account.Ref) error {
	remaining, loaded := sources[roundID]
	if !loaded {
		source, err := db.PracticeRound(owner, roundID)
		if err != nil {
			return err
		}
		remaining = make(map[account.Ref]int)
		for _, old := range source.Answers {
			if old.Selected != old.Answer {
				remaining[old.Answer]++
			}
		}
		sources[roundID] = remaining
	}
	if remaining[answer] == 0 {
		return account.ErrInvalid
	}
	remaining[answer]--
	return nil
}

func registerPracticeHistory(mux *http.ServeMux, store *account.Store, practice Practice, resolve func(http.ResponseWriter, *http.Request, bool) (string, bool)) {
	questions := make(map[string]Question, len(practice.Questions))
	vocabulary := make(map[WordRef]bool)
	counts := make(map[graph.WordFilter]int)
	for _, q := range practice.Questions {
		questions[q.ID] = q
		vocabulary[q.Answer] = true
		counts[graph.WordFilter{Level: q.WordLevel}]++
		for _, tag := range q.WordTags {
			counts[graph.WordFilter{Level: q.WordLevel, Tag: tag}]++
		}
	}
	mux.HandleFunc("GET /api/account/practice/review", func(w http.ResponseWriter, r *http.Request) {
		id, ok := resolve(w, r, false)
		if !ok {
			return
		}
		targets, err := pendingReview(store.WithContext(r.Context()), id, vocabulary)
		if err != nil {
			accountError(w, err)
			return
		}
		accountJSON(w, 200, targets)
	})
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
			Tag     string `json:"tag"`
			ID      string `json:"id"`
			Level   string `json:"level"`
			Answers []struct {
				Source   string  `json:"source,omitempty"`
				Question string  `json:"question"`
				Selected WordRef `json:"selected"`
			} `json:"answers"`
		}
		if !accountBody(w, r, &submission) {
			return
		}
		expected := min(10, counts[graph.WordFilter{Level: submission.Level, Tag: submission.Tag}])
		review := submission.Level == account.ReviewLevel
		size := len(submission.Answers)
		if size == 0 || size > 10 || (review && submission.Tag != "") || (!review && size != expected) {
			accountError(w, account.ErrInvalid)
			return
		}
		round := account.PracticeRound{ID: submission.ID, Level: submission.Level, Tag: submission.Tag}
		seen := make(map[string]bool)
		sources := make(reviewSources)
		db := store.WithContext(r.Context())
		for _, a := range submission.Answers {
			q, exists := questions[a.Question]
			if !exists || seen[q.ID] || !slices.Contains(q.Options, a.Selected) {
				accountError(w, account.ErrInvalid)
				return
			}
			if review {
				if err := sources.take(db, id, a.Source, account.Ref(q.Answer)); err != nil {
					accountError(w, err)
					return
				}
			} else if a.Source != "" || q.WordLevel != submission.Level || (submission.Tag != "" && !slices.Contains(q.WordTags, submission.Tag)) {
				accountError(w, account.ErrInvalid)
				return
			}
			seen[q.ID] = true
			round.Answers = append(round.Answers, account.PracticeAnswer{
				Question: q.ID, Selected: account.Ref(a.Selected), Answer: account.Ref(q.Answer),
				Prompts: q.localizedPrompts(),
			})
		}
		if err := db.SavePractice(id, round); err != nil {
			accountError(w, err)
			return
		}
		accountJSON(w, 200, map[string]bool{"saved": true})
	})
}
