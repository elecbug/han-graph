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
)

func serve(g *graph.Graph, dir, addr, accountPath string, secureCookies bool, stdout, stderr io.Writer) int {
	practice, err := webapp.LoadPractice(filepath.Join(dir, "practice.json"), g)
	if err != nil {
		fmt.Fprintln(stderr, "Error:", err)
		return 1
	}
	accounts, err := account.Open(accountPath)
	if err != nil {
		fmt.Fprintln(stderr, "Error opening account database:", err)
		return 1
	}
	defer accounts.Close()
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		fmt.Fprintln(stderr, "Error:", err)
		return 1
	}
	server := &http.Server{
		Handler:           webapp.New(g, practice, webapp.Options{Accounts: accounts, SecureCookies: secureCookies}),
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
