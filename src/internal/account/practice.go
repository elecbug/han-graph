package account

import (
	"context"
	"encoding/json"
	"regexp"
	"slices"
	"time"

	"cloud.google.com/go/firestore"
	bolt "go.etcd.io/bbolt"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type PracticeAnswer struct {
	Question string            `json:"question"`
	Prompts  map[string]string `json:"prompts"`
	Selected Ref               `json:"selected"`
	Answer   Ref               `json:"answer"`
}
type PracticeRound struct {
	ID            string           `json:"id"`
	Level         string           `json:"level"`
	Tag           string           `json:"tag,omitempty" firestore:",omitempty"`
	CompletedAt   time.Time        `json:"completed_at"`
	Correct       int              `json:"correct"`
	QuestionCount int              `json:"-"` // Lightweight Firestore statistics projection.
	Answers       []PracticeAnswer `json:"answers"`
}

const ReviewLevel = "review"

type PracticeHistory struct {
	Rounds []PracticeRound `json:"rounds"`
	Next   string          `json:"next,omitempty"`
}

const historyPageSize = 20

var roundID = regexp.MustCompile("^[a-f0-9]{32}$")
var historyBucket = []byte("practice-rounds")

func (s *Store) SavePractice(id string, round PracticeRound) error {
	if !roundID.MatchString(round.ID) || len(round.Answers) == 0 || len(round.Answers) > 10 {
		return ErrInvalid
	}
	round.CompletedAt = time.Now().UTC()
	round.Correct = 0
	round.QuestionCount = len(round.Answers)
	for _, answer := range round.Answers {
		if answer.Selected == answer.Answer {
			round.Correct++
		}
	}
	return s.storage.savePractice(s.ctx, id, round)
}
func (s *Store) PracticeHistory(id, cursor string) (PracticeHistory, error) {
	if cursor != "" && !roundID.MatchString(cursor) {
		return PracticeHistory{}, ErrInvalid
	}
	rounds, err := s.storage.practiceHistory(s.ctx, id, cursor)
	if err != nil {
		return PracticeHistory{}, err
	}
	page := PracticeHistory{Rounds: rounds}
	if len(rounds) > historyPageSize {
		page.Rounds = rounds[:historyPageSize]
		page.Next = page.Rounds[historyPageSize-1].ID
	}
	return page, nil
}

// PracticeRound reads a source round when checking which words a learner missed.
func (s *Store) PracticeRound(id, key string) (PracticeRound, error) {
	if !roundID.MatchString(key) {
		return PracticeRound{}, ErrInvalid
	}
	return s.storage.practiceRound(s.ctx, id, key)
}

func (b *fileBackend) practiceRound(_ context.Context, id, key string) (PracticeRound, error) {
	var round PracticeRound
	err := b.db.View(func(tx *bolt.Tx) error {
		if tx.Bucket(usersBucket).Get([]byte(id)) == nil {
			return ErrUnauthorized
		}
		root := tx.Bucket(historyBucket)
		if root == nil || root.Bucket([]byte(id)) == nil {
			return ErrInvalid
		}
		data := root.Bucket([]byte(id)).Bucket([]byte("rounds")).Get([]byte(key))
		if data == nil {
			return ErrInvalid
		}
		return json.Unmarshal(data, &round)
	})
	return round, err
}

func (b *firestoreBackend) practiceRound(ctx context.Context, id, key string) (PracticeRound, error) {
	user := b.user(id)
	docs, err := b.client.GetAll(ctx, []*firestore.DocumentRef{user, user.Collection("practiceRounds").Doc(key)})
	if err != nil {
		return PracticeRound{}, err
	}
	if !docs[0].Exists() {
		return PracticeRound{}, ErrUnauthorized
	}
	if !docs[1].Exists() {
		return PracticeRound{}, ErrInvalid
	}
	var round PracticeRound
	err = docs[1].DataTo(&round)
	return round, err
}

func sameRound(old, next PracticeRound) error {
	// A retry must preserve the exercise as originally saved, even after a catalog edit.
	sameChoices := slices.EqualFunc(old.Answers, next.Answers, func(a, b PracticeAnswer) bool {
		return a.Question == b.Question && a.Selected == b.Selected
	})
	if old.Tag != next.Tag || old.Level != next.Level || !sameChoices {
		return ErrConflict
	}
	return nil
}

func (b *fileBackend) savePractice(_ context.Context, id string, round PracticeRound) error {
	return b.db.Update(func(tx *bolt.Tx) error {
		if tx.Bucket(usersBucket).Get([]byte(id)) == nil {
			return ErrUnauthorized
		}
		root, err := tx.CreateBucketIfNotExists(historyBucket)
		if err != nil {
			return err
		}
		user, err := root.CreateBucketIfNotExists([]byte(id))
		if err != nil {
			return err
		}
		rows, err := user.CreateBucketIfNotExists([]byte("rounds"))
		if err != nil {
			return err
		}
		if data := rows.Get([]byte(round.ID)); data != nil {
			var old PracticeRound
			if err := json.Unmarshal(data, &old); err != nil {
				return err
			}
			return sameRound(old, round)
		}
		dates, err := user.CreateBucketIfNotExists([]byte("dates"))
		if err != nil {
			return err
		}
		if err := dates.Put(orderedTimeKey(round.CompletedAt, round.ID), []byte(round.ID)); err != nil {
			return err
		}
		return putJSON(rows, []byte(round.ID), round)
	})
}
func (b *fileBackend) practiceHistory(_ context.Context, id, after string) ([]PracticeRound, error) {
	rounds := []PracticeRound{}
	err := b.db.View(func(tx *bolt.Tx) error {
		if tx.Bucket(usersBucket).Get([]byte(id)) == nil {
			return ErrUnauthorized
		}
		root := tx.Bucket(historyBucket)
		if root == nil || root.Bucket([]byte(id)) == nil {
			if after != "" {
				return ErrInvalid
			}
			return nil
		}
		user := root.Bucket([]byte(id))
		rows := user.Bucket([]byte("rounds"))
		c := user.Bucket([]byte("dates")).Cursor()
		k, v := c.Last()
		if after != "" {
			data := rows.Get([]byte(after))
			if data == nil {
				return ErrInvalid
			}
			var last PracticeRound
			if err := json.Unmarshal(data, &last); err != nil {
				return err
			}
			c.Seek(orderedTimeKey(last.CompletedAt, after))
			k, v = c.Prev()
		}
		for ; k != nil && len(rounds) <= historyPageSize; k, v = c.Prev() {
			var round PracticeRound
			if err := json.Unmarshal(rows.Get(v), &round); err != nil {
				return err
			}
			rounds = append(rounds, round)
		}
		return nil
	})
	return rounds, err
}

func (b *firestoreBackend) savePractice(ctx context.Context, id string, round PracticeRound) error {
	user := b.user(id)
	ref := user.Collection("practiceRounds").Doc(round.ID)
	return b.client.RunTransaction(ctx, func(_ context.Context, tx *firestore.Transaction) error {
		// A Firestore subcollection can outlive its parent. Fence late saves
		// against the transaction that removes the account.
		docs, err := tx.GetAll([]*firestore.DocumentRef{user, ref})
		if err != nil {
			return err
		}
		if !docs[0].Exists() {
			return ErrUnauthorized
		}
		if !docs[1].Exists() {
			return tx.Create(ref, round)
		}
		var old PracticeRound
		if err := docs[1].DataTo(&old); err != nil {
			return err
		}
		return sameRound(old, round)
	})
}
func (b *firestoreBackend) practiceHistory(ctx context.Context, id, after string) ([]PracticeRound, error) {
	user := b.user(id)
	collection := user.Collection("practiceRounds")
	var rounds []PracticeRound
	err := b.client.RunTransaction(ctx, func(_ context.Context, tx *firestore.Transaction) error {
		_, err := tx.Get(user)
		if status.Code(err) == codes.NotFound {
			return ErrUnauthorized
		}
		if err != nil {
			return err
		}
		query := collection.OrderBy("CompletedAt", firestore.Desc).OrderBy(firestore.DocumentID, firestore.Desc).Limit(historyPageSize + 1)
		if after != "" {
			doc, err := tx.Get(collection.Doc(after))
			if status.Code(err) == codes.NotFound {
				return ErrInvalid
			}
			if err != nil {
				return err
			}
			query = query.StartAfter(doc)
		}
		docs, err := tx.Documents(query).GetAll()
		if err != nil {
			return err
		}
		rounds = make([]PracticeRound, len(docs))
		for i, doc := range docs {
			if err := doc.DataTo(&rounds[i]); err != nil {
				return err
			}
		}
		return nil
	}, firestore.ReadOnly)
	return rounds, err
}
