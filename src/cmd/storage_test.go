package main

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestAccountStorageSelection(t *testing.T) {
	t.Chdir(t.TempDir())
	t.Setenv("K_SERVICE", "")
	for _, mode := range []string{"", "file", "firestore", "typo"} {
		t.Run("backend="+mode, func(t *testing.T) {
			t.Setenv("HAN_GRAPH_DB_BACKEND", mode)
			t.Setenv("GOOGLE_CLOUD_PROJECT", "")
			file := filepath.Join(t.TempDir(), "accounts.db")
			store, err := openAccounts(context.Background(), file)
			if mode == "" || mode == "file" {
				if err != nil {
					t.Fatal(err)
				}
				if err := store.Close(); err != nil {
					t.Fatal(err)
				}
				if _, err := os.Stat(file); err != nil {
					t.Fatal(err)
				}
			} else {
				if err == nil {
					store.Close()
					t.Fatal("invalid configuration opened a database")
				}
				if _, err := os.Stat(file); !os.IsNotExist(err) {
					t.Fatalf("unexpected account file: %v", err)
				}
			}
		})
	}
}

func TestCloudRunRequiresDurableStorage(t *testing.T) {
	t.Chdir(t.TempDir())
	t.Setenv("K_SERVICE", "han-graph-beta")
	for _, mode := range []string{"", "file"} {
		t.Setenv("HAN_GRAPH_DB_BACKEND", mode)
		file := filepath.Join(t.TempDir(), "accounts.db")
		if store, err := openAccounts(t.Context(), file); err == nil {
			store.Close()
			t.Fatalf("Cloud Run opened ephemeral storage for backend %q", mode)
		}
		if _, err := os.Stat(file); !os.IsNotExist(err) {
			t.Fatalf("unexpected account file: %v", err)
		}
	}
}

func TestServeReadsDotEnvFromProjectRoot(t *testing.T) {
	t.Setenv("K_SERVICE", "")
	root := t.TempDir()
	module := filepath.Join(root, "src")
	if err := os.Mkdir(module, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(module, "go.mod"), []byte("module example"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, ".env"), []byte("HAN_GRAPH_DB_BACKEND=firestore\n"), 0600); err != nil {
		t.Fatal(err)
	}
	t.Chdir(module)
	t.Setenv("HAN_GRAPH_DB_BACKEND", "")
	if err := os.Unsetenv("HAN_GRAPH_DB_BACKEND"); err != nil {
		t.Fatal(err)
	}
	t.Setenv("GOOGLE_CLOUD_PROJECT", "")
	file := filepath.Join(root, "accounts.db")
	if _, err := openAccounts(t.Context(), file); err == nil || os.Getenv("HAN_GRAPH_DB_BACKEND") != "firestore" {
		t.Fatalf("expected .env to select Firestore: %v", err)
	}
	t.Setenv("HAN_GRAPH_DB_BACKEND", "file")
	store, err := openAccounts(t.Context(), file)
	if err != nil {
		t.Fatal(err)
	}
	store.Close()
}
