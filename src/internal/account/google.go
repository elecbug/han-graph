package account

import (
	"context"
	"encoding/hex"
	"errors"
	"net/mail"
	"slices"
	"strings"

	"cloud.google.com/go/firestore"
	bolt "go.etcd.io/bbolt"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

var ErrGoogleTaken = errors.New("Google identity already linked")
var ErrGoogleUnknown = errors.New("Google identity not linked")

// GoogleIdentity comes from the verified Google ID token, never from form fields.
type GoogleIdentity struct{ Subject, Email string }

func (g GoogleIdentity) Valid() bool {
	address, err := mail.ParseAddress(g.Email)
	return len(g.Subject) > 0 && len(g.Subject) <= 255 && len(g.Email) <= 254 && err == nil && address.Address == g.Email && strings.Contains(g.Email, "@")
}
func googleKey(kind, value string) string { return kind + "-" + hex.EncodeToString(tokenKey(value)) }
func (g GoogleIdentity) keys() []string {
	if g.Subject == "" {
		return nil
	}
	return []string{googleKey("subject", g.Subject), googleKey("email", strings.ToLower(g.Email))}
}
func (s *Store) RegisterGoogle(name, password string, identity GoogleIdentity) (User, error) {
	if !identity.Valid() {
		return User{}, ErrInvalid
	}
	return s.register(name, password, identity, "")
}
func (s *Store) LinkGoogle(id string, identity GoogleIdentity) error {
	if !identity.Valid() {
		return ErrInvalid
	}
	return s.storage.updateCredentials(s.ctx, id, loginProof{}, credentialEdit{google: &identity})
}
func (s *Store) GoogleUser(subject string) (string, error) {
	return s.storage.googleUser(s.ctx, subject)
}

func bindFileGoogle(tx *bolt.Tx, id string, old, next GoogleIdentity) error {
	index := tx.Bucket(googleBucket)
	keys := next.keys()
	for _, key := range keys {
		if owner := index.Get([]byte(key)); owner != nil && string(owner) != id {
			return ErrGoogleTaken
		}
		if err := index.Put([]byte(key), []byte(id)); err != nil {
			return err
		}
	}
	for _, key := range old.keys() {
		if !slices.Contains(keys, key) {
			if err := index.Delete([]byte(key)); err != nil {
				return err
			}
		}
	}
	return nil
}
func (b *fileBackend) googleUser(_ context.Context, subject string) (string, error) {
	var id string
	err := b.db.View(func(tx *bolt.Tx) error {
		id = string(tx.Bucket(googleBucket).Get([]byte(googleKey("subject", subject))))
		if id == "" {
			return ErrGoogleUnknown
		}
		return nil
	})
	return id, err
}

type googleOwner struct{ UserID string }

func (b *firestoreBackend) googleRef(key string) *firestore.DocumentRef {
	return b.client.Collection("hanGraphGoogleIdentities").Doc(key)
}
func (b *firestoreBackend) bindGoogle(tx *firestore.Transaction, id string, old, next GoogleIdentity) error {
	keys := next.keys()
	refs := make([]*firestore.DocumentRef, len(keys))
	for i, key := range keys {
		refs[i] = b.googleRef(key)
	}
	docs, err := tx.GetAll(refs)
	if err != nil {
		return err
	}
	for i, doc := range docs {
		if doc.Exists() {
			var owner googleOwner
			if err := doc.DataTo(&owner); err != nil {
				return err
			}
			if owner.UserID != id {
				return ErrGoogleTaken
			}
		} else if err := tx.Create(refs[i], googleOwner{id}); err != nil {
			return err
		}
	}
	for _, key := range old.keys() {
		if !slices.Contains(keys, key) {
			if err := tx.Delete(b.googleRef(key)); err != nil {
				return err
			}
		}
	}
	return nil
}
func (b *firestoreBackend) googleUser(ctx context.Context, subject string) (string, error) {
	doc, err := b.googleRef(googleKey("subject", subject)).Get(ctx)
	if status.Code(err) == codes.NotFound {
		return "", ErrGoogleUnknown
	}
	if err != nil {
		return "", err
	}
	var owner googleOwner
	err = doc.DataTo(&owner)
	return owner.UserID, err
}
