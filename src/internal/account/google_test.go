package account

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPasswordLength(t *testing.T) {
	for length, want := range map[int]bool{9: false, 10: true, 128: true, 129: false} {
		if got := validPassword(strings.Repeat("🔑", length)); got != want {
			t.Errorf("length %d: got %t", length, got)
		}
	}
}

func testBackends(t *testing.T, run func(*testing.T, *Store, string)) {
	for _, backend := range []string{"file", "firestore"} {
		t.Run(backend, func(t *testing.T) {
			var s *Store
			var err error
			if backend == "file" {
				s, err = Open(filepath.Join(t.TempDir(), "accounts.db"))
			} else {
				if os.Getenv("FIRESTORE_EMULATOR_HOST") == "" {
					t.Skip("requires Firestore emulator")
				}
				s, err = OpenFirestore(t.Context(), "demo-han-graph", "(default)")
			}
			if err != nil {
				t.Fatal(err)
			}
			defer s.Close()
			suffix, err := randomHex(6)
			if err != nil {
				t.Fatal(err)
			}
			run(t, s, "reader_"+suffix)
		})
	}
}

func TestGoogleLinking(t *testing.T) {
	testBackends(t, func(t *testing.T, s *Store, name string) {
		const password = "1234567890"
		a, err := s.Register(name, password)
		if err != nil || a.Email != "" {
			t.Fatal("legacy registration", err)
		}
		first := GoogleIdentity{name + "-subject", name + "@gmail.com"}
		next := GoogleIdentity{name + "-second", name + "2@gmail.com"}
		if err := s.LinkGoogle(a.ID, first); err != nil {
			t.Fatal(err)
		}
		check := func(identity GoogleIdentity) {
			t.Helper()
			logged, err := s.Login(name, password)
			if err != nil || logged.Email != identity.Email {
				t.Fatalf("login: %v %v", logged, err)
			}
			snap, err := s.Snapshot(a.ID)
			if err != nil || snap.User.Email != identity.Email {
				t.Fatalf("snapshot: %v %v", snap.User, err)
			}
			if id, err := s.GoogleUser(identity.Subject); err != nil || id != a.ID {
				t.Fatal("identity lookup", err)
			}
		}
		check(first)
		for _, duplicate := range []GoogleIdentity{first, {first.Subject, "another-" + first.Email}, {name + "-other", first.Email}} {
			if _, err := s.RegisterGoogle(name+"_b", password, duplicate); !errors.Is(err, ErrGoogleTaken) {
				t.Fatalf("duplicate identity: %v", err)
			}
		}
		if _, err := s.RegisterGoogle(name, password, next); !errors.Is(err, ErrExists) {
			t.Fatalf("username collision: %v", err)
		}
		if err := s.LinkGoogle(a.ID, next); err != nil {
			t.Fatal(err)
		}
		check(next)
		if _, err := s.GoogleUser(first.Subject); !errors.Is(err, ErrGoogleUnknown) {
			t.Fatalf("old login still linked: %v", err)
		}
		b, err := s.RegisterGoogle(name+"_b", password, first)
		if err != nil {
			t.Fatal(err)
		}
		if err := s.LinkGoogle(b.ID, next); !errors.Is(err, ErrGoogleTaken) {
			t.Fatalf("cross-account relink: %v", err)
		}
		if id, err := s.GoogleUser(first.Subject); err != nil || id != b.ID {
			t.Fatalf("failed relink not atomic: %v", err)
		}
	})
}
