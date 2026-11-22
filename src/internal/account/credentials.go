package account

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"time"

	"cloud.google.com/go/firestore"
	bolt "go.etcd.io/bbolt"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// Recheck the verified credential inside the write transaction. A concurrent
// rename, password change or Google replacement can retire it after sign-in began.
type loginProof struct {
	username, subject string
	hash              []byte
}

func (p loginProof) check(name string, hash []byte, subject string) error {
	if p.hash != nil && (name != p.username || !bytes.Equal(hash, p.hash)) {
		return ErrCredentials
	}
	if p.subject != "" && subject != p.subject {
		return ErrCredentials
	}
	return nil
}
func (u record) passwordProof() loginProof {
	return loginProof{username: u.User.Username, hash: u.Hash}
}

type passwordKey struct{ salt, hash []byte }

func newPasswordKey(password string) (*passwordKey, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return nil, err
	}
	hash, err := digest(password, salt, passwordIterations)
	if err != nil {
		return nil, err
	}
	return &passwordKey{salt, hash}, nil
}

func (s *Store) PasswordSession(username, password, previous string) (id, token string, err error) {
	u, err := s.verifyPassword(username, password)
	if err != nil {
		return "", "", err
	}
	token, err = s.startSession(u.User.ID, previous, u.passwordProof())
	return u.User.ID, token, err
}
func (s *Store) GoogleSession(subject, previous string) (id, token string, err error) {
	id, err = s.GoogleUser(subject)
	if err != nil {
		return "", "", err
	}
	token, err = s.startSession(id, previous, loginProof{subject: subject})
	return id, token, err
}

type credentialEdit struct {
	username        string
	password        *passwordKey
	keepSession     string
	google          *GoogleIdentity
	recoveryStarted time.Time
}

func (change credentialEdit) revokesSessions(oldSubject string) bool {
	return change.password != nil || (change.google != nil && oldSubject != "" && oldSubject != change.google.Subject)
}

const RecoveryLifetime = 10 * time.Minute

var ErrRecoveryExpired = errors.New("Google recovery verification expired")

// RecoverPassword verifies the Google subject that the server authenticated.
// A nil password checks eligibility before the user enters a new password.
func (s *Store) RecoverPassword(owner, subject string, started time.Time, password *string) error {
	change := credentialEdit{recoveryStarted: started}
	if subject == "" || started.IsZero() {
		return ErrRecoveryExpired
	}
	if password != nil && !validPassword(*password) {
		return ErrInvalid
	}
	id, err := s.GoogleUser(subject)
	if err != nil {
		return err
	}
	if owner != "" && owner != id {
		return ErrGoogleUnknown
	}
	if password != nil {
		change.password, err = newPasswordKey(*password)
		if err != nil {
			return err
		}
	}
	return s.storage.updateCredentials(s.ctx, id, loginProof{subject: subject}, change)
}

// Check inside the same transaction that rotates the password and revokes
// sessions. Concurrent submissions of one Google challenge can only win once.
func (change credentialEdit) checkRecovery(after int64) error {
	if change.recoveryStarted.IsZero() {
		return nil
	}
	now := time.Now()
	if change.recoveryStarted.UnixMicro() <= after || change.recoveryStarted.After(now) ||
		!now.Before(change.recoveryStarted.Add(RecoveryLifetime)) {
		return ErrRecoveryExpired
	}
	return nil
}

func (s *Store) ownerProof(id, username, password string) (loginProof, error) {
	u, err := s.verifyPassword(username, password)
	if err != nil {
		return loginProof{}, err
	}
	if u.User.ID != id {
		return loginProof{}, ErrCredentials
	}
	return u.passwordProof(), nil
}

type CredentialChange struct {
	Username        string `json:"username"`
	CurrentPassword string `json:"current_password"`
	NewUsername     string `json:"new_username,omitempty"`
	NewPassword     string `json:"new_password,omitempty"`
}

func (s *Store) ChangeCredentials(id, sessionToken string, input CredentialChange) error {
	change := credentialEdit{username: NormalizeUsername(input.NewUsername), keepSession: sessionToken}
	if (input.NewUsername != "" && !usernamePattern.MatchString(change.username)) ||
		(input.NewPassword != "" && !validPassword(input.NewPassword)) ||
		(input.NewPassword == "" && change.username == "") {
		return ErrInvalid
	}
	proof, err := s.ownerProof(id, input.Username, input.CurrentPassword)
	if err != nil {
		return err
	}
	if input.NewPassword != "" {
		change.password, err = newPasswordKey(input.NewPassword)
		if err != nil {
			return err
		}
	}
	return s.storage.updateCredentials(s.ctx, id, proof, change)
}
func (s *Store) ChangeGoogle(id, sessionToken, username, password string, identity GoogleIdentity) error {
	if !identity.Valid() {
		return ErrInvalid
	}
	proof, err := s.ownerProof(id, username, password)
	if err != nil {
		return err
	}
	return s.storage.updateCredentials(s.ctx, id, proof, credentialEdit{google: &identity, keepSession: sessionToken})
}

func (b *fileBackend) updateCredentials(_ context.Context, id string, proof loginProof, change credentialEdit) error {
	return b.db.Update(func(tx *bolt.Tx) error {
		u, err := getRecord(tx, id)
		if err != nil {
			return err
		}
		if err := proof.check(u.User.Username, u.Hash, u.GoogleSubject); err != nil {
			return err
		}
		if err := change.checkRecovery(u.RecoveryAfter); err != nil {
			return err
		}
		if !change.recoveryStarted.IsZero() && change.password == nil {
			return nil
		}
		if change.username != "" && change.username != u.User.Username {
			names := tx.Bucket(namesBucket)
			if names.Get([]byte(change.username)) != nil {
				return ErrExists
			}
			if err := names.Put([]byte(change.username), []byte(id)); err != nil {
				return err
			}
			if err := names.Delete([]byte(u.User.Username)); err != nil {
				return err
			}
			u.User.Username = change.username
		}
		revoke := change.revokesSessions(u.GoogleSubject)
		if change.google != nil {
			if err := bindFileGoogle(tx, id, GoogleIdentity{u.GoogleSubject, u.User.Email}, *change.google); err != nil {
				return err
			}
			u.GoogleSubject, u.User.Email = change.google.Subject, change.google.Email
		}
		if change.password != nil {
			u.Salt, u.Hash, u.Iterations = change.password.salt, change.password.hash, passwordIterations
		}
		if revoke {
			if err := revokeFileSessions(tx, id, tokenKey(change.keepSession)); err != nil {
				return err
			}
		}
		if change.google != nil || change.password != nil {
			u.RecoveryAfter = max(u.RecoveryAfter, time.Now().UnixMicro())
		}
		return putJSON(tx.Bucket(usersBucket), []byte(id), u)
	})
}

func revokeFileSessions(tx *bolt.Tx, id string, keep []byte) error {
	sessions := tx.Bucket(sessionsBucket)
	var revoked [][]byte
	err := sessions.ForEach(func(key, data []byte) error {
		var entry session
		if err := json.Unmarshal(data, &entry); err != nil {
			return err
		}
		if entry.UserID == id && !bytes.Equal(key, keep) {
			revoked = append(revoked, bytes.Clone(key))
		}
		return nil
	})
	if err != nil {
		return err
	}
	for _, key := range revoked {
		if err := sessions.Delete(key); err != nil {
			return err
		}
	}
	return nil
}

func (b *firestoreBackend) readLogin(tx *firestore.Transaction, name, id string) (loginDocument, error) {
	var login loginDocument
	doc, err := tx.Get(b.login(name))
	if status.Code(err) == codes.NotFound {
		return login, ErrCredentials
	}
	if err != nil {
		return login, err
	}
	if err := doc.DataTo(&login); err != nil {
		return login, err
	}
	if login.UserID != id {
		return login, ErrCredentials
	}
	return login, nil
}
func (b *firestoreBackend) updateCredentials(ctx context.Context, id string, proof loginProof, change credentialEdit) error {
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
		if err := change.checkRecovery(header.RecoveryAfter); err != nil {
			return err
		}
		if !change.recoveryStarted.IsZero() && change.password == nil {
			return nil
		}
		oldName := header.Username
		revoke := change.revokesSessions(header.GoogleSubject)
		var updates []firestore.Update
		if change.google != nil || change.password != nil {
			updates = append(updates, firestore.Update{Path: "RecoveryAfter", Value: max(header.RecoveryAfter, time.Now().UnixMicro())})
		}
		if change.google != nil {
			if err := b.bindGoogle(tx, id, GoogleIdentity{header.GoogleSubject, header.Email}, *change.google); err != nil {
				return err
			}
			header.GoogleSubject, header.Email = change.google.Subject, change.google.Email
			login.Email = header.Email
			updates = append(updates, firestore.Update{Path: "GoogleSubject", Value: header.GoogleSubject}, firestore.Update{Path: "Email", Value: header.Email})
		}
		if change.password != nil {
			login.Salt, login.Hash, login.Iterations = change.password.salt, change.password.hash, passwordIterations
		}
		if revoke {
			keep := sessionID(change.keepSession)
			var retained []string
			for _, key := range header.SessionKeys {
				if key == keep {
					retained = append(retained, key)
					continue
				}
				if err := tx.Delete(b.sessions().Doc(key)); err != nil {
					return err
				}
			}
			updates = append(updates, firestore.Update{Path: "SessionKeys", Value: retained})
		}
		if change.username != "" && change.username != oldName {
			header.Username = change.username
			updates = append(updates, firestore.Update{Path: "Username", Value: change.username})
			if err := tx.Create(b.login(header.Username), login); err != nil {
				return err
			}
			if err := tx.Delete(b.login(oldName)); err != nil {
				return err
			}
		} else if err := tx.Set(b.login(oldName), login); err != nil {
			return err
		}
		if len(updates) == 0 {
			return nil
		}
		return tx.Update(ref, updates)
	})
	if status.Code(err) == codes.AlreadyExists {
		return ErrExists
	}
	return err
}
