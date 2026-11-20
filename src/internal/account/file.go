package account

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	bolt "go.etcd.io/bbolt"
)

type fileBackend struct{ db *bolt.DB }

var usersBucket = []byte("users")
var namesBucket = []byte("usernames")
var sessionsBucket = []byte("sessions")
var googleBucket = []byte("google-identities")

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
		for _, name := range [][]byte{usersBucket, namesBucket, sessionsBucket, googleBucket} {
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
	return newStore(&fileBackend{db}), nil
}
func (s *fileBackend) Close() error { return s.db.Close() }
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
func (s *fileBackend) create(_ context.Context, u record) error {
	return s.db.Update(func(tx *bolt.Tx) error {
		names := tx.Bucket(namesBucket)
		if names.Get([]byte(u.User.Username)) != nil {
			return ErrExists
		}
		if u.GoogleSubject != "" {
			if err := bindFileGoogle(tx, u.User.ID, GoogleIdentity{}, GoogleIdentity{Subject: u.GoogleSubject, Email: u.User.Email}); err != nil {
				return err
			}
		}
		if err := putJSON(tx.Bucket(usersBucket), []byte(u.User.ID), u); err != nil {
			return err
		}
		return names.Put([]byte(u.User.Username), []byte(u.User.ID))
	})
}
func (s *fileBackend) byName(_ context.Context, name string) (record, error) {
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
	return u, err
}

func (s *fileBackend) startSession(_ context.Context, id, previous, token string) error {
	now := time.Now()
	return s.db.Update(func(tx *bolt.Tx) error {
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
}
func (s *fileBackend) endSession(_ context.Context, token string) error {
	return s.db.Update(func(tx *bolt.Tx) error { return tx.Bucket(sessionsBucket).Delete(tokenKey(token)) })
}
func (s *fileBackend) resolve(_ context.Context, token string) (string, error) {
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
func (s *fileBackend) access(_ context.Context, id string, edit func(*record) error) (Snapshot, error) {
	run := s.db.View
	if edit != nil {
		run = s.db.Update
	}
	var result Snapshot
	err := run(func(tx *bolt.Tx) error {
		u, err := getRecord(tx, id)
		if err != nil {
			return err
		}
		if edit != nil {
			if err := edit(&u); err != nil {
				return err
			}
			if err := putJSON(tx.Bucket(usersBucket), []byte(id), u); err != nil {
				return err
			}
		}
		result = snapshot(u)
		return nil
	})
	return result, err
}

func orderedTimeKey(t time.Time, key string) []byte {
	return []byte(t.UTC().Format("20060102150405.000000000") + key)
}
