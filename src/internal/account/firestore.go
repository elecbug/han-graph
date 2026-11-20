package account

import (
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"cloud.google.com/go/firestore"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type firestoreBackend struct{ client *firestore.Client }

type accountDocument struct {
	GoogleSubject      string `firestore:",omitempty"`
	Username           string
	Email              string `firestore:",omitempty"`
	DictionaryRevision int64
	Pages              map[string][]string
	SessionKeys        []string
}

type loginDocument struct {
	Email      string `firestore:",omitempty"`
	UserID     string
	Salt       []byte
	Hash       []byte
	Iterations int
}

func OpenFirestore(ctx context.Context, project, database string) (*Store, error) {
	if project == "" {
		return nil, errors.New("Firestore requires GOOGLE_CLOUD_PROJECT")
	}
	if database == "" {
		database = "(default)"
	}
	client, err := firestore.NewClientWithDatabase(ctx, project, database)
	if err != nil {
		return nil, err
	}
	b := &firestoreBackend{client}
	// BatchGet succeeds for an absent probe document and reports connection,
	// permission and database errors without creating any data.
	probe, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	_, err = client.GetAll(probe, []*firestore.DocumentRef{b.user("connection-check")})
	if err != nil {
		client.Close()
		return nil, fmt.Errorf("connect to Firestore: %w", err)
	}
	return newStore(b), nil
}

func (b *firestoreBackend) Close() error { return b.client.Close() }
func (b *firestoreBackend) user(id string) *firestore.DocumentRef {
	return b.client.Collection("hanGraphUsers").Doc(id)
}
func (b *firestoreBackend) login(name string) *firestore.DocumentRef {
	return b.client.Collection("hanGraphUsernames").Doc(name)
}
func (b *firestoreBackend) sessions() *firestore.CollectionRef {
	return b.client.Collection("hanGraphSessions")
}

func (b *firestoreBackend) create(ctx context.Context, u record) error {
	err := b.client.RunTransaction(ctx, func(_ context.Context, tx *firestore.Transaction) error {
		if u.GoogleSubject != "" {
			err := b.bindGoogle(tx, u.User.ID, GoogleIdentity{}, GoogleIdentity{Subject: u.GoogleSubject, Email: u.User.Email})
			if err != nil {
				return err
			}
		}
		if err := tx.Create(b.login(u.User.Username), loginDocument{UserID: u.User.ID, Salt: u.Salt, Hash: u.Hash, Iterations: u.Iterations, Email: u.User.Email}); err != nil {
			return err
		}
		return tx.Create(b.user(u.User.ID), accountDocument{Username: u.User.Username, Email: u.User.Email, GoogleSubject: u.GoogleSubject})
	})
	if status.Code(err) == codes.AlreadyExists {
		return ErrExists
	}
	return err
}

func (b *firestoreBackend) byName(ctx context.Context, name string) (record, error) {
	doc, err := b.login(name).Get(ctx)
	if status.Code(err) == codes.NotFound {
		return record{}, ErrCredentials
	}
	if err != nil {
		return record{}, err
	}
	var login loginDocument
	if err = doc.DataTo(&login); err != nil {
		return record{}, err
	}
	return record{User: User{ID: login.UserID, Username: name, Email: login.Email}, Salt: login.Salt, Hash: login.Hash, Iterations: login.Iterations}, nil
}

func (b *firestoreBackend) access(ctx context.Context, id string, edit func(*record) error) (Snapshot, error) {
	var result Snapshot
	var options []firestore.TransactionOption
	if edit == nil {
		options = append(options, firestore.ReadOnly)
	}
	err := b.client.RunTransaction(ctx, func(_ context.Context, tx *firestore.Transaction) error {
		ref := b.user(id)
		doc, err := tx.Get(ref)
		if status.Code(err) == codes.NotFound {
			return ErrUnauthorized
		}
		if err != nil {
			return err
		}
		var header accountDocument
		if err = doc.DataTo(&header); err != nil {
			return err
		}
		r := record{User: User{ID: id, Username: header.Username, Email: header.Email}, DictionaryRevision: uint64(header.DictionaryRevision)}
		pages := ref.Collection("pages")
		previous, err := readPages(tx, pages, header.Pages, &r)
		if err != nil {
			return err
		}
		if edit != nil {
			if err := edit(&r); err != nil {
				return err
			}
			next, err := writePages(tx, pages, header.Pages, previous, &r)
			if err != nil {
				return err
			}
			if err := tx.Update(ref, []firestore.Update{{Path: "Pages", Value: next}, {Path: "DictionaryRevision", Value: int64(r.DictionaryRevision)}}); err != nil {
				return err
			}
		}
		result = snapshot(r)
		return nil
	}, options...)
	if err != nil {
		return Snapshot{}, err
	}
	return result, nil
}

func sessionID(token string) string { return hex.EncodeToString(tokenKey(token)) }
func (b *firestoreBackend) startSession(ctx context.Context, id, previous, token string) error {
	key := sessionID(token)
	return b.client.RunTransaction(ctx, func(_ context.Context, tx *firestore.Transaction) error {
		ref := b.user(id)
		doc, err := tx.Get(ref)
		if status.Code(err) == codes.NotFound {
			return ErrUnauthorized
		}
		if err != nil {
			return err
		}
		var header accountDocument
		if err = doc.DataTo(&header); err != nil {
			return err
		}
		// Logged-out sessions can remain in this bounded index until the next
		// login. Only live sessions count towards the limit of ten.
		now := time.Now().UTC()
		refs := make([]*firestore.DocumentRef, 0, len(header.SessionKeys))
		for _, k := range header.SessionKeys {
			refs = append(refs, b.sessions().Doc(k))
		}
		entries, err := tx.GetAll(refs)
		if err != nil {
			return err
		}
		keys := make([]string, 0, len(entries)+1)
		remove := map[string]bool{}
		if previous != "" {
			remove[sessionID(previous)] = true
		}
		for _, item := range entries {
			if !item.Exists() {
				continue
			}
			var live session
			if err := item.DataTo(&live); err != nil {
				return err
			}
			k := item.Ref.ID
			if !live.Expires.After(now) {
				remove[k] = true
			}
			if !remove[k] {
				keys = append(keys, k)
			}
		}
		if len(keys) >= 10 {
			remove[keys[0]] = true
			keys = keys[1:]
		}
		for k := range remove {
			if err := tx.Delete(b.sessions().Doc(k)); err != nil {
				return err
			}
		}
		if err := tx.Update(ref, []firestore.Update{{Path: "SessionKeys", Value: append(keys, key)}}); err != nil {
			return err
		}
		return tx.Create(b.sessions().Doc(key), session{id, now.Add(SessionLifetime)})
	})
}

func (b *firestoreBackend) endSession(ctx context.Context, token string) error {
	_, err := b.sessions().Doc(sessionID(token)).Delete(ctx)
	return err
}
func (b *firestoreBackend) resolve(ctx context.Context, token string) (string, error) {
	doc, err := b.sessions().Doc(sessionID(token)).Get(ctx)
	if status.Code(err) == codes.NotFound {
		return "", ErrUnauthorized
	}
	if err != nil {
		return "", err
	}
	var value session
	if err := doc.DataTo(&value); err != nil {
		return "", err
	}
	if !value.Expires.After(time.Now()) {
		return "", ErrUnauthorized
	}
	return value.UserID, nil
}
