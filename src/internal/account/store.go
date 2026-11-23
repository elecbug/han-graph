// Package account persists private word collections, notes, and login sessions.
package account

import (
	"context"
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"regexp"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/elecbug/han-graph/internal/graph"
)

var (
	ErrInvalid      = errors.New("invalid")
	ErrCredentials  = errors.New("credentials")
	ErrExists       = errors.New("username_taken")
	ErrUnauthorized = errors.New("unauthorized")
	ErrLimit        = errors.New("limit")
	ErrConflict     = errors.New("conflict")
)

const SessionLifetime = 30 * 24 * time.Hour
const passwordIterations = 600000

var usernamePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{2,31}$`)

type Ref struct {
	Word  string `json:"word"`
	Hanja string `json:"hanja"`
}

func (r Ref) Key() string { b, _ := json.Marshal([2]string{r.Word, r.Hanja}); return string(b) }
func (r Ref) Valid() bool {
	return strings.IndexFunc(r.Word+r.Hanja, unicode.IsControl) == -1 && utf8.ValidString(r.Word) && utf8.ValidString(r.Hanja) && strings.TrimSpace(r.Word) == r.Word && r.Word != "" && utf8.RuneCountInString(r.Word) <= 100 && utf8.RuneCountInString(r.Hanja) <= 100
}

type Note struct {
	Ref
	Text      string    `json:"text"`
	Revision  uint64    `json:"revision"`
	UpdatedAt time.Time `json:"updated_at"`
}
type User struct {
	ID       string `json:"id"`
	Username string `json:"username"`
	Email    string `json:"email,omitempty"`
}
type Snapshot struct {
	User               *User           `json:"user"`
	Words              []Ref           `json:"words"`
	Notes              []Note          `json:"notes"`
	Dictionary         graph.Additions `json:"dictionary"`
	DictionaryRevision uint64          `json:"dictionary_revision"`
}
type record struct {
	GoogleSubject      string `json:",omitempty"`
	RecoveryAfter      int64  `json:",omitempty"` // Unix microseconds of the last credential change.
	User               User
	Salt               []byte
	Hash               []byte
	Iterations         int
	Words              []Ref
	Notes              []Note
	Dictionary         graph.Additions
	DictionaryRevision uint64
}
type session struct {
	UserID  string
	Expires time.Time
}
type backend interface {
	create(ctx context.Context, user record) error
	googleUser(ctx context.Context, subject string) (string, error)
	updateCredentials(ctx context.Context, id string, proof loginProof, change credentialEdit) error
	deleteAccount(ctx context.Context, id string, proof loginProof) error
	savePractice(ctx context.Context, id string, round PracticeRound) error
	practiceRound(ctx context.Context, id, roundID string) (PracticeRound, error)
	practiceHistory(ctx context.Context, id, after string) ([]PracticeRound, error)
	saveActivity(ctx context.Context, id string, days map[string][]ActivityInterval) error
	studyDays(ctx context.Context, id string, month studyMonth) ([]StudyDay, error)
	byName(ctx context.Context, name string) (record, error)
	// A nil edit reads a snapshot. An edit commits atomically and may be retried.
	access(ctx context.Context, id string, edit func(*record) error) (Snapshot, error)
	startSession(ctx context.Context, id, previousToken, newToken string, proof loginProof) error
	endSession(ctx context.Context, token string) error
	resolve(ctx context.Context, token string) (string, error)
	Close() error
}
type Store struct {
	storage backend
	ctx     context.Context
}

func newStore(storage backend) *Store                   { return &Store{storage: storage, ctx: context.Background()} }
func (s *Store) WithContext(ctx context.Context) *Store { return &Store{storage: s.storage, ctx: ctx} }
func (s *Store) Close() error                           { return s.storage.Close() }
func digest(password string, salt []byte, iterations int) ([]byte, error) {
	return pbkdf2.Key(sha256.New, password, salt, iterations, 32)
}
func validPassword(password string) bool {
	length := utf8.RuneCountInString(password)
	return utf8.ValidString(password) && length >= 10 && length <= 128
}
func NormalizeUsername(name string) string { return strings.ToLower(strings.TrimSpace(name)) }
func randomHex(size int) (string, error) {
	b := make([]byte, size)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
func snapshot(u record) Snapshot {
	if u.Words == nil {
		u.Words = []Ref{}
	}
	if u.Notes == nil {
		u.Notes = []Note{}
	}
	return Snapshot{User: &u.User, Words: u.Words, Notes: u.Notes, Dictionary: u.Dictionary.Arrays(), DictionaryRevision: u.DictionaryRevision}
}
func (s *Store) Register(name, password string) (User, error) {
	return s.register(name, password, GoogleIdentity{})
}
func (s *Store) register(name, password string, identity GoogleIdentity) (User, error) {
	name = NormalizeUsername(name)
	if !usernamePattern.MatchString(name) || !validPassword(password) {
		return User{}, ErrInvalid
	}
	passwordKey, err := newPasswordKey(password)
	if err != nil {
		return User{}, err
	}
	id, err := randomHex(16)
	if err != nil {
		return User{}, err
	}
	u := record{User: User{ID: id, Username: name, Email: identity.Email}, GoogleSubject: identity.Subject, Salt: passwordKey.salt, Hash: passwordKey.hash, Iterations: passwordIterations}
	u.RecoveryAfter = time.Now().UnixMicro()
	err = s.storage.create(s.ctx, u)
	return u.User, err
}
func (s *Store) Login(name, password string) (User, error) {
	u, err := s.verifyPassword(name, password)
	return u.User, err
}
func (s *Store) verifyPassword(name, password string) (record, error) {
	name = NormalizeUsername(name)
	if len(password) > 512 {
		return record{}, ErrCredentials
	}
	var u record
	var err error
	if usernamePattern.MatchString(name) {
		u, err = s.storage.byName(s.ctx, name)
	} else {
		err = ErrCredentials
	}
	if err != nil && !errors.Is(err, ErrCredentials) {
		return record{}, err
	}
	// Unknown users take the same expensive path as incorrect passwords.
	salt, iterations := u.Salt, u.Iterations
	if err != nil {
		salt = make([]byte, 16)
		iterations = passwordIterations
	}
	hash, hashErr := digest(password, salt, iterations)
	if hashErr != nil {
		return record{}, hashErr
	}
	if err != nil || subtle.ConstantTimeCompare(hash, u.Hash) != 1 {
		return record{}, ErrCredentials
	}
	return u, nil
}
func tokenKey(token string) []byte { h := sha256.Sum256([]byte(token)); return h[:] }
func (s *Store) StartSession(id, previous string) (string, error) {
	return s.startSession(id, previous, loginProof{})
}
func (s *Store) startSession(id, previous string, proof loginProof) (string, error) {
	token, err := randomHex(32)
	if err != nil {
		return "", err
	}
	err = s.storage.startSession(s.ctx, id, previous, token, proof)
	return token, err
}
func (s *Store) EndSession(token string) error { return s.storage.endSession(s.ctx, token) }
func (s *Store) Resolve(token string) (string, error) {
	if len(token) != 64 {
		return "", ErrUnauthorized
	}
	return s.storage.resolve(s.ctx, token)
}
func (s *Store) Snapshot(id string) (Snapshot, error) { return s.storage.access(s.ctx, id, nil) }
func (s *Store) change(id string, fn func(*record) error) (Snapshot, error) {
	return s.storage.access(s.ctx, id, fn)
}
func (s *Store) AddWords(id string, words []Ref) (Snapshot, error) {
	if len(words) == 0 || len(words) > 500 {
		return Snapshot{}, ErrInvalid
	}
	for _, word := range words {
		if !word.Valid() {
			return Snapshot{}, ErrInvalid
		}
	}
	return s.change(id, func(u *record) error {
		seen := map[string]bool{}
		for _, w := range u.Words {
			seen[w.Key()] = true
		}
		for _, w := range words {
			if !seen[w.Key()] {
				u.Words = append(u.Words, w)
				seen[w.Key()] = true
			}
		}
		if len(u.Words) > 500 {
			return ErrLimit
		}
		return nil
	})
}
func (s *Store) RemoveWord(id string, ref Ref) (Snapshot, error) {
	if !ref.Valid() {
		return Snapshot{}, ErrInvalid
	}
	return s.change(id, func(u *record) error {
		for i, w := range u.Words {
			if w == ref {
				u.Words = append(u.Words[:i], u.Words[i+1:]...)
				break
			}
		}
		return nil
	})
}
func (s *Store) SaveNote(id string, note Note, dictionaries ...*graph.Graph) (Snapshot, error) {
	note.Text = strings.TrimSpace(note.Text)
	if !note.Ref.Valid() || !utf8.ValidString(note.Text) || utf8.RuneCountInString(note.Text) > 5000 {
		return Snapshot{}, ErrInvalid
	}
	return s.change(id, func(u *record) error {
		// Each transaction attempt starts from the requested revision.
		note := note
		if len(dictionaries) > 0 {
			view, err := dictionaries[0].WithAdditions(u.Dictionary)
			if err != nil {
				return err
			}
			found := false
			for _, w := range view.FindWords(note.Word) {
				if w.Word.Hanja == note.Hanja {
					found = true
					break
				}
			}
			if !found {
				return ErrInvalid
			}
		}

		active := 0
		for _, old := range u.Notes {
			if old.Text != "" {
				active++
			}
		}
		for i, old := range u.Notes {
			if old.Ref != note.Ref {
				continue
			}
			if old.Revision != note.Revision {
				return ErrConflict
			}
			if note.Text != "" && old.Text == "" && active >= 1000 {
				return ErrLimit
			}
			// Keep a tombstone revision so stale tabs cannot revive deleted notes.
			note.Revision++
			note.UpdatedAt = time.Now().UTC()
			u.Notes[i] = note
			return nil
		}
		if note.Revision != 0 {
			return ErrConflict
		}
		if note.Text == "" {
			return nil
		}
		if active >= 1000 {
			return ErrLimit
		}
		note.Revision = 1
		note.UpdatedAt = time.Now().UTC()
		u.Notes = append(u.Notes, note)
		return nil
	})
}
