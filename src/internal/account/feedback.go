package account

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	bolt "go.etcd.io/bbolt"
	"google.golang.org/api/iterator"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type Feedback struct {
	Message   string    `json:"message" firestore:"message"`
	Language  string    `json:"language" firestore:"language"`
	CreatedAt time.Time `json:"created_at" firestore:"created_at"`
}

func validFeedbackID(id string) bool {
	_, err := hex.DecodeString(id)
	return len(id) == 32 && err == nil && id == strings.ToLower(id)
}

func (s *Store) SubmitFeedback(id, message, language string) error {
	message = strings.TrimSpace(message)
	if !validFeedbackID(id) {
		return ErrInvalid
	}
	if message == "" || !utf8.ValidString(message) || utf8.RuneCountInString(message) > 2000 ||
		strings.IndexFunc(message, func(r rune) bool { return unicode.IsControl(r) && r != '\n' && r != '\r' && r != '\t' }) >= 0 {
		return ErrInvalid
	}
	switch language {
	case "ko", "en", "ru", "uz", "ky", "zh", "ja", "es", "vi", "ne", "mn", "th":
	default:
		return ErrInvalid
	}
	return s.storage.saveFeedback(s.ctx, id, Feedback{message, language, time.Now().UTC()})
}

// VisitFeedback and ResolveFeedback are available only to the database operator.
func (s *Store) VisitFeedback(visit func(string, Feedback) error) error {
	return s.storage.visitFeedback(s.ctx, visit)
}
func (s *Store) ResolveFeedback(id string) error {
	if !validFeedbackID(id) {
		return ErrInvalid
	}
	return s.storage.deleteFeedback(s.ctx, id)
}

func (s *fileBackend) visitFeedback(_ context.Context, visit func(string, Feedback) error) error {
	return s.db.View(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte("feedback"))
		if b == nil {
			return nil
		}
		return b.ForEach(func(k, v []byte) error {
			var entry Feedback
			if err := json.Unmarshal(v, &entry); err != nil {
				return err
			}
			return visit(string(k), entry)
		})
	})
}

func (s *fileBackend) deleteFeedback(_ context.Context, id string) error {
	return s.db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte("feedback"))
		if b == nil {
			return nil
		}
		return b.Delete([]byte(id))
	})
}

func (b *firestoreBackend) visitFeedback(ctx context.Context, visit func(string, Feedback) error) error {
	docs := b.client.Collection("hanGraphFeedback").Documents(ctx)
	defer docs.Stop()
	for {
		doc, err := docs.Next()
		if err == iterator.Done {
			return nil
		}
		if err != nil {
			return err
		}
		var entry Feedback
		if err := doc.DataTo(&entry); err != nil {
			return err
		}
		if err := visit(doc.Ref.ID, entry); err != nil {
			return err
		}
	}
}

func (b *firestoreBackend) deleteFeedback(ctx context.Context, id string) error {
	_, err := b.client.Collection("hanGraphFeedback").Doc(id).Delete(ctx)
	return err
}

func (f Feedback) checkRetry(previous Feedback) error {
	if f.Message != previous.Message || f.Language != previous.Language {
		return ErrConflict
	}
	return nil
}

func (s *fileBackend) saveFeedback(_ context.Context, id string, entry Feedback) error {
	return s.db.Update(func(tx *bolt.Tx) error {
		b, err := tx.CreateBucketIfNotExists([]byte("feedback"))
		if err != nil {
			return err
		}
		if value := b.Get([]byte(id)); value != nil {
			var previous Feedback
			if err := json.Unmarshal(value, &previous); err != nil {
				return err
			}
			return entry.checkRetry(previous)
		}
		return putJSON(b, []byte(id), entry)
	})
}

func (b *firestoreBackend) saveFeedback(ctx context.Context, id string, entry Feedback) error {
	ref := b.client.Collection("hanGraphFeedback").Doc(id)
	_, err := ref.Create(ctx, entry)
	if status.Code(err) != codes.AlreadyExists {
		return err
	}
	doc, err := ref.Get(ctx)
	if err != nil {
		return err
	}
	var previous Feedback
	if err := doc.DataTo(&previous); err != nil {
		return err
	}
	return entry.checkRetry(previous)
}
