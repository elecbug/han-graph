package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/elecbug/han-graph/internal/account"
	"github.com/elecbug/han-graph/internal/graph"
	"github.com/elecbug/han-graph/internal/webapp"
	"github.com/joho/godotenv"
)

func validateOptionalPractice(dir string, g *graph.Graph) error {
	filename := filepath.Join(dir, "practice.json")
	if _, err := os.Stat(filename); errors.Is(err, os.ErrNotExist) {
		return nil
	}
	_, err := webapp.LoadPractice(filename, g)
	return err
}

func openAccounts(ctx context.Context, filePath string) (*account.Store, error) {
	if err := loadServerEnv(); err != nil {
		return nil, err
	}
	switch mode := os.Getenv("HAN_GRAPH_DB_BACKEND"); mode {
	case "", "file":
		if os.Getenv("K_SERVICE") != "" {
			return nil, errors.New("Cloud Run requires HAN_GRAPH_DB_BACKEND=firestore for durable account and feedback storage")
		}
		return account.Open(filePath)
	case "firestore":
		return account.OpenFirestore(ctx, os.Getenv("GOOGLE_CLOUD_PROJECT"), os.Getenv("FIRESTORE_DATABASE_ID"))
	default:
		return nil, fmt.Errorf("unknown HAN_GRAPH_DB_BACKEND %q (expected file or firestore)", mode)
	}
}

// Compose injects these settings. Direct runs read .env from the working
// directory, or the repository root when launched with "go run" from src.
func loadServerEnv() error {
	paths := []string{".env"}
	if _, err := os.Stat("go.mod"); err == nil {
		paths = append(paths, "../.env")
	}
	for _, path := range paths {
		if _, err := os.Stat(path); errors.Is(err, os.ErrNotExist) {
			continue
		} else if err != nil {
			return err
		}
		if err := godotenv.Load(path); err != nil {
			return fmt.Errorf("cannot load settings from %s (check permissions and dotenv syntax)", path)
		}
		break
	}
	return nil
}

func serve(g *graph.Graph, dir, addr, accountPath string, secureCookies bool, stdout, stderr io.Writer) int {
	practice, err := webapp.LoadPractice(filepath.Join(dir, "practice.json"), g)
	if err != nil {
		fmt.Fprintln(stderr, "Error:", err)
		return 1
	}
	accounts, err := openAccounts(context.Background(), accountPath)
	if err != nil {
		fmt.Fprintln(stderr, "Error opening account database:", err)
		return 1
	}
	defer accounts.Close()
	audio, err := webapp.LoadKoreanAudio(dir)
	if err != nil {
		fmt.Fprintln(stderr, "Error loading audio:", err)
		return 1
	}
	options := webapp.Options{Accounts: accounts, SecureCookies: secureCookies, Audio: audio}
	options.SignupMode = os.Getenv("HAN_GRAPH_SIGNUP_MODE")
	options.BetaInviteCode = os.Getenv("HAN_GRAPH_BETA_INVITE_CODE")
	switch options.SignupMode {
	case "", "open", "closed":
	case "invite":
		if len(options.BetaInviteCode) < 8 || len(options.BetaInviteCode) > 128 {
			fmt.Fprintln(stderr, "Invite mode requires HAN_GRAPH_BETA_INVITE_CODE (8–128 bytes)")
			return 1
		}
	default:
		fmt.Fprintln(stderr, "HAN_GRAPH_SIGNUP_MODE must be open, invite or closed")
		return 1
	}
	options.GoogleClientID = os.Getenv("HAN_GRAPH_GOOGLE_CLIENT_ID")
	if options.GoogleClientID != "" && !webapp.ValidGoogleClientID(options.GoogleClientID) {
		fmt.Fprintln(stderr, "Invalid HAN_GRAPH_GOOGLE_CLIENT_ID (expected a Google web client ID)")
		return 1
	}
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		fmt.Fprintln(stderr, "Error:", err)
		return 1
	}
	server := &http.Server{
		Handler:           webapp.New(g, practice, options),
		MaxHeaderBytes:    32 << 10,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	done := make(chan struct{})
	shutdownDone := make(chan struct{})
	defer close(done)
	go func() {
		defer close(shutdownDone)
		select {
		case <-ctx.Done():
			shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			if err := server.Shutdown(shutdown); err != nil {
				server.Close()
			}
		case <-done:
		}
	}()
	fmt.Fprintf(stdout, "HAN-GRAPH is ready at http://%s\nPress Ctrl+C to stop.\n", listener.Addr())
	if err := server.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
		fmt.Fprintln(stderr, "Error:", err)
		return 1
	}
	// Shutdown stops Serve before active handlers have finished writing.
	// Keep the account database open until those handlers have drained.
	if ctx.Err() != nil {
		<-shutdownDone
	}
	return 0
}
