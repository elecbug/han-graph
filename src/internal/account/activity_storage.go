package account

import (
	"bytes"
	"context"
	"encoding/json"
	"slices"
	"time"

	"cloud.google.com/go/firestore"
	bolt "go.etcd.io/bbolt"
	"google.golang.org/api/iterator"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

var activityBucket = []byte("activity-days")

func (b *fileBackend) saveActivity(_ context.Context, id string, days map[string][]ActivityInterval) error {
	return b.db.Update(func(tx *bolt.Tx) error {
		if tx.Bucket(usersBucket).Get([]byte(id)) == nil {
			return ErrUnauthorized
		}
		root, err := tx.CreateBucketIfNotExists(activityBucket)
		if err != nil {
			return err
		}
		user, err := root.CreateBucketIfNotExists([]byte(id))
		if err != nil {
			return err
		}
		for day, spans := range days {
			old := user.Get([]byte(day))
			data, err := addIntervals(old, spans)
			if err != nil {
				return err
			}
			if bytes.Equal(old, data) {
				continue
			}
			if err := user.Put([]byte(day), data); err != nil {
				return err
			}
		}
		return nil
	})
}

func (b *fileBackend) studyDays(_ context.Context, id string, m studyMonth) ([]StudyDay, error) {
	days := m.days()
	err := b.db.View(func(tx *bolt.Tx) error {
		if tx.Bucket(usersBucket).Get([]byte(id)) == nil {
			return ErrUnauthorized
		}
		if root := tx.Bucket(activityBucket); root != nil && root.Bucket([]byte(id)) != nil {
			c := root.Bucket([]byte(id)).Cursor()
			last := m.end.Add(-time.Second).UTC().Format(time.DateOnly)
			for k, v := c.Seek([]byte(m.start.UTC().Format(time.DateOnly))); k != nil && string(k) <= last; k, v = c.Next() {
				if err := m.addUsage(days, string(k), v); err != nil {
					return err
				}
			}
		}
		root := tx.Bucket(historyBucket)
		if root == nil || root.Bucket([]byte(id)) == nil {
			return nil
		}
		user := root.Bucket([]byte(id))
		rows := user.Bucket([]byte("rounds"))
		c := user.Bucket([]byte("dates")).Cursor()
		limit := orderedTimeKey(m.end, "")
		for k, v := c.Seek(orderedTimeKey(m.start, "")); k != nil && bytes.Compare(k, limit) < 0; k, v = c.Next() {
			var score struct {
				Completed time.Time `json:"completed_at"`
				Correct   int
				Answers   []struct{}
			}
			if err := json.Unmarshal(rows.Get(v), &score); err != nil {
				return err
			}
			m.addRound(days, score.Completed, score.Correct, len(score.Answers))
		}
		return nil
	})
	return days, err
}

func (b *firestoreBackend) saveActivity(ctx context.Context, id string, days map[string][]ActivityInterval) error {
	user := b.user(id)
	refs := []*firestore.DocumentRef{user}
	for day := range days {
		refs = append(refs, user.Collection("activityDays").Doc(day))
	}
	return b.client.RunTransaction(ctx, func(_ context.Context, tx *firestore.Transaction) error {
		docs, err := tx.GetAll(refs)
		if err != nil {
			return err
		}
		if !docs[0].Exists() {
			return ErrUnauthorized
		}
		for _, doc := range docs[1:] {
			var record struct{ Seconds []byte }
			if doc.Exists() {
				if err := doc.DataTo(&record); err != nil {
					return err
				}
			}
			data, err := addIntervals(record.Seconds, days[doc.Ref.ID])
			if err != nil {
				return err
			}
			if bytes.Equal(record.Seconds, data) {
				continue
			}
			if err := tx.Set(doc.Ref, map[string]any{"Seconds": data}); err != nil {
				return err
			}
		}
		return nil
	})
}

func (b *firestoreBackend) studyDays(ctx context.Context, id string, m studyMonth) ([]StudyDay, error) {
	user := b.user(id)
	var days []StudyDay
	err := b.client.RunTransaction(ctx, func(_ context.Context, tx *firestore.Transaction) error {
		if _, err := tx.Get(user); err != nil {
			if status.Code(err) == codes.NotFound {
				return ErrUnauthorized
			}
			return err
		}
		days = m.days()
		query := user.Collection("activityDays").OrderBy(firestore.DocumentID, firestore.Asc).StartAt(m.start.UTC().Format(time.DateOnly)).EndAt(m.end.Add(-time.Second).UTC().Format(time.DateOnly))
		usage, err := tx.Documents(query).GetAll()
		if err != nil {
			return err
		}
		for _, doc := range usage {
			var record struct{ Seconds []byte }
			if err := doc.DataTo(&record); err != nil {
				return err
			}
			if err := m.addUsage(days, doc.Ref.ID, record.Seconds); err != nil {
				return err
			}
		}
		rounds := user.Collection("practiceRounds").Where("CompletedAt", ">=", m.start).Where("CompletedAt", "<", m.end).Select("CompletedAt", "Correct", "QuestionCount")
		it := tx.Documents(rounds)
		defer it.Stop()
		var legacyRefs []*firestore.DocumentRef
		for {
			doc, err := it.Next()
			if err == iterator.Done {
				break
			}
			if err != nil {
				return err
			}
			var score struct {
				CompletedAt            time.Time
				Correct, QuestionCount int
			}
			if err := doc.DataTo(&score); err != nil {
				return err
			}
			if score.QuestionCount == 0 {
				legacyRefs = append(legacyRefs, doc.Ref)
				continue
			}
			m.addRound(days, score.CompletedAt, score.Correct, score.QuestionCount)
		}
		// Older rounds carry the denominator only in their answers. Read those
		// snapshots in batches without sending the prompts to the browser.
		for refs := range slices.Chunk(legacyRefs, 20) {
			docs, err := tx.GetAll(refs)
			if err != nil {
				return err
			}
			for _, doc := range docs {
				var legacy struct {
					CompletedAt time.Time
					Correct     int
					Answers     []struct{}
				}
				if err := doc.DataTo(&legacy); err != nil {
					return err
				}
				m.addRound(days, legacy.CompletedAt, legacy.Correct, len(legacy.Answers))
			}
		}
		return nil
	}, firestore.ReadOnly)
	return days, err
}
