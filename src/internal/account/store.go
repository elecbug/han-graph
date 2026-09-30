// Package account persists private word collections, notes, and login sessions.
package account

import (
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	bolt "go.etcd.io/bbolt"
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
var usersBucket = []byte("users")
var namesBucket = []byte("usernames")
var sessionsBucket = []byte("sessions")

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
}
type Snapshot struct {
	User  *User  `json:"user"`
	Words []Ref  `json:"words"`
	Notes []Note `json:"notes"`
}
type record struct {
	User       User
	Salt       []byte
	Hash       []byte
	Iterations int
	Words      []Ref
	Notes      []Note
}
type session struct {
	UserID  string
	Expires time.Time
}
type Store struct{ db *bolt.DB }

func Open(path string) (*Store, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return nil, err
	}
	// Never follow a symlink to an unrelated file, or leave old broad permissions.
	if info, err := os.Lstat(path); err == nil {
		if !info.Mode().IsRegular() {
			return nil, fmt.Errorf("account database must be a regular file")
		}
		if err = os.Chmod(path, 0600); err != nil {
			return nil, err
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	db, err := bolt.Open(path, 0600, &bolt.Options{Timeout: time.Second})
	if err != nil {
		return nil, err
	}
	err = db.Update(func(tx *bolt.Tx) error {
		for _, name := range [][]byte{usersBucket, namesBucket, sessionsBucket} {
			if _, err := tx.CreateBucketIfNotExists(name); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		db.Close()
		return nil, err
	}
	return &Store{db}, nil
}
func (s *Store) Close() error { return s.db.Close() }
func digest(password string, salt []byte, iterations int) ([]byte, error) {
	return pbkdf2.Key(sha256.New, password, salt, iterations, 32)
}
func validPassword(password string) bool {
	return utf8.ValidString(password) && utf8.RuneCountInString(password) >= 12 && utf8.RuneCountInString(password) <= 128 && len(password) <= 512
}
func NormalizeUsername(name string) string { return strings.ToLower(strings.TrimSpace(name)) }
func randomHex(size int) (string, error) {
	b := make([]byte, size)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
func putJSON(b *bolt.Bucket, key []byte, v any) error {
	data, err := json.Marshal(v)
	if err != nil {
		return err
	}
	return b.Put(key, data)
}
func getRecord(tx *bolt.Tx, id string) (record, error) {
	var u record
	data := tx.Bucket(usersBucket).Get([]byte(id))
	if data == nil {
		return u, ErrUnauthorized
	}
	err := json.Unmarshal(data, &u)
	return u, err
}
func snapshot(u record) Snapshot {
	if u.Words == nil {
		u.Words = []Ref{}
	}
	if u.Notes == nil {
		u.Notes = []Note{}
	}
	return Snapshot{&u.User, u.Words, u.Notes}
}
func (s *Store) Register(name, password string) (User, error) {
	name = NormalizeUsername(name)
	if !usernamePattern.MatchString(name) || !validPassword(password) {
		return User{}, ErrInvalid
	}
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return User{}, err
	}
	hash, err := digest(password, salt, passwordIterations)
	if err != nil {
		return User{}, err
	}
	id, err := randomHex(16)
	if err != nil {
		return User{}, err
	}
	u := record{User: User{id, name}, Salt: salt, Hash: hash, Iterations: passwordIterations}
	err = s.db.Update(func(tx *bolt.Tx) error {
		names := tx.Bucket(namesBucket)
		if names.Get([]byte(name)) != nil {
			return ErrExists
		}
		if err := putJSON(tx.Bucket(usersBucket), []byte(id), u); err != nil {
			return err
		}
		return names.Put([]byte(name), []byte(id))
	})
	return u.User, err
}
func (s *Store) Login(name, password string) (User, error) {
	name = NormalizeUsername(name)
	if len(password) > 512 {
		return User{}, ErrCredentials
	}
	var u record
	err := s.db.View(func(tx *bolt.Tx) error {
		id := tx.Bucket(namesBucket).Get([]byte(name))
		if id == nil {
			return ErrCredentials
		}
		var err error
		u, err = getRecord(tx, string(id))
		return err
	})
	if err != nil && !errors.Is(err, ErrCredentials) {
		return User{}, err
	}
	// Unknown users take the same expensive path as incorrect passwords.
	salt, iterations := u.Salt, u.Iterations
	if err != nil {
		salt = make([]byte, 16)
		iterations = passwordIterations
	}
	hash, hashErr := digest(password, salt, iterations)
	if hashErr != nil {
		return User{}, hashErr
	}
	if err != nil || subtle.ConstantTimeCompare(hash, u.Hash) != 1 {
		return User{}, ErrCredentials
	}
	return u.User, nil
}
func tokenKey(token string) []byte { h := sha256.Sum256([]byte(token)); return h[:] }
func (s *Store) StartSession(id, previous string) (string, error) {
	token, err := randomHex(32)
	if err != nil {
		return "", err
	}
	now := time.Now()
	err = s.db.Update(func(tx *bolt.Tx) error {
		if _, err := getRecord(tx, id); err != nil {
			return err
		}
		b := tx.Bucket(sessionsBucket)
		if previous != "" {
			if err := b.Delete(tokenKey(previous)); err != nil {
				return err
			}
		}
		// Bound stored sessions and discard expired cookies on every login.
		count := 0
		c := b.Cursor()
		for k, v := c.First(); k != nil; k, v = c.Next() {
			var session session
			if err := json.Unmarshal(v, &session); err != nil {
				return err
			}
			remove := !session.Expires.After(now)
			if session.UserID == id {
				count++
				remove = remove || count >= 10
			}
			if remove {
				if err := c.Delete(); err != nil {
					return err
				}
			}
		}
		return putJSON(b, tokenKey(token), session{id, now.Add(SessionLifetime)})
	})
	return token, err
}
func (s *Store) EndSession(token string) error {
	return s.db.Update(func(tx *bolt.Tx) error { return tx.Bucket(sessionsBucket).Delete(tokenKey(token)) })
}
func (s *Store) Resolve(token string) (string, error) {
	if len(token) != 64 {
		return "", ErrUnauthorized
	}
	var id string
	err := s.db.View(func(tx *bolt.Tx) error {
		data := tx.Bucket(sessionsBucket).Get(tokenKey(token))
		if data == nil {
			return ErrUnauthorized
		}
		var session session
		if err := json.Unmarshal(data, &session); err != nil {
			return err
		}
		if !session.Expires.After(time.Now()) {
			return ErrUnauthorized
		}
		id = session.UserID
		return nil
	})
	return id, err
}
func (s *Store) Snapshot(id string) (Snapshot, error) {
	var result Snapshot
	err := s.db.View(func(tx *bolt.Tx) error {
		u, err := getRecord(tx, id)
		if err != nil {
			return err
		}
		result = snapshot(u)
		return nil
	})
	return result, err
}
func (s *Store) change(id string, fn func(*record) error) (Snapshot, error) {
	var result Snapshot
	err := s.db.Update(func(tx *bolt.Tx) error {
		u, err := getRecord(tx, id)
		if err != nil {
			return err
		}
		if err = fn(&u); err != nil {
			return err
		}
		if err = putJSON(tx.Bucket(usersBucket), []byte(id), u); err != nil {
			return err
		}
		result = snapshot(u)
		return nil
	})
	return result, err
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
func (s *Store) SaveNote(id string, note Note) (Snapshot, error) {
	note.Text = strings.TrimSpace(note.Text)
	if !note.Ref.Valid() || !utf8.ValidString(note.Text) || utf8.RuneCountInString(note.Text) > 5000 {
		return Snapshot{}, ErrInvalid
	}
	return s.change(id, func(u *record) error {
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
