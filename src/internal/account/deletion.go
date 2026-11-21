package account

import (
	"context"
	"log"
	"time"

	"cloud.google.com/go/firestore"
	bolt "go.etcd.io/bbolt"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (s *Store) DeleteAccount(id, username, password string) error {
	proof, err := s.ownerProof(id, username, password)
	if err != nil {
		return err
	}
	return s.storage.deleteAccount(s.ctx, id, proof)
}

func (b *fileBackend) deleteAccount(_ context.Context, id string, proof loginProof) error {
	return b.db.Update(func(tx *bolt.Tx) error {
		u, err := getRecord(tx, id)
		if err != nil {
			return err
		}
		if err := proof.check(u.User.Username, u.Hash, u.GoogleSubject); err != nil {
			return err
		}
		if err := revokeFileSessions(tx, id, nil); err != nil {
			return err
		}
		if err := bindFileGoogle(tx, id, GoogleIdentity{u.GoogleSubject, u.User.Email}, GoogleIdentity{}); err != nil {
			return err
		}
		if root := tx.Bucket(historyBucket); root != nil && root.Bucket([]byte(id)) != nil {
			if err := root.DeleteBucket([]byte(id)); err != nil {
				return err
			}
		}
		if err := tx.Bucket(namesBucket).Delete([]byte(u.User.Username)); err != nil {
			return err
		}
		return tx.Bucket(usersBucket).Delete([]byte(id))
	})
}

func (b *firestoreBackend) deletionJobs() *firestore.CollectionRef {
	return b.client.Collection("hanGraphAccountDeletions")
}

func (b *firestoreBackend) deleteAccount(ctx context.Context, id string, proof loginProof) error {
	user := b.user(id)
	err := b.client.RunTransaction(ctx, func(_ context.Context, tx *firestore.Transaction) error {
		doc, err := tx.Get(user)
		if status.Code(err) == codes.NotFound {
			return ErrUnauthorized
		}
		if err != nil {
			return err
		}
		var header accountDocument
		if err := doc.DataTo(&header); err != nil {
			return err
		}
		login, err := b.readLogin(tx, header.Username, id)
		if err != nil {
			return err
		}
		if err := proof.check(header.Username, login.Hash, header.GoogleSubject); err != nil {
			return err
		}
		for _, key := range (GoogleIdentity{header.GoogleSubject, header.Email}).keys() {
			if err := tx.Delete(b.googleRef(key)); err != nil {
				return err
			}
		}
		for _, key := range header.SessionKeys {
			if err := tx.Delete(b.sessions().Doc(key)); err != nil {
				return err
			}
		}
		if err := tx.Delete(b.login(header.Username)); err != nil {
			return err
		}
		if err := tx.Delete(user); err != nil {
			return err
		}
		// History can span more than one batch. Record remaining work atomically
		// with removal of all credentials so a restart cannot strand that data.
		return tx.Create(b.deletionJobs().Doc(id), map[string]any{"started": firestore.ServerTimestamp})
	})
	if err != nil {
		return err
	}
	// Finish ordinary deletions before responding. A long history must not
	// monopolize a password-verification slot or delay sign-out.
	cleanupCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	if err := b.purgeAccount(cleanupCtx, id); err != nil {
		log.Printf("Firestore account data cleanup will retry: %v", err)
		select {
		case b.cleanupWake <- struct{}{}:
		default:
		}
	}
	return nil
}

func (b *firestoreBackend) purgeAccount(ctx context.Context, id string) error {
	for _, name := range []string{"pages", "practiceRounds"} {
		query := b.user(id).Collection(name).Select().Limit(16)
		for {
			docs, err := query.Documents(ctx).GetAll()
			if err != nil {
				return err
			}
			if len(docs) == 0 {
				break
			}
			batch := b.client.Batch()
			for _, doc := range docs {
				batch.Delete(doc.Ref)
			}
			if _, err := batch.Commit(ctx); err != nil {
				return err
			}
		}
	}
	_, err := b.deletionJobs().Doc(id).Delete(ctx)
	return err
}

func (b *firestoreBackend) resumeDeletions(ctx context.Context) {
	defer close(b.cleanupDone)
	ticker := time.NewTicker(15 * time.Minute)
	defer ticker.Stop()
	for {
		jobs, err := b.deletionJobs().Select().Documents(ctx).GetAll()
		if err != nil && ctx.Err() == nil {
			log.Printf("Firestore account deletion lookup: %v", err)
		}
		for _, job := range jobs {
			if ctx.Err() != nil {
				return
			}
			if err := b.purgeAccount(ctx, job.Ref.ID); err != nil && ctx.Err() == nil {
				log.Printf("Firestore account data cleanup will retry: %v", err)
			}
		}
		select {
		case <-ctx.Done():
			return
		case <-b.cleanupWake:
		case <-ticker.C:
		}
	}
}
