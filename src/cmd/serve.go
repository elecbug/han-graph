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
	"time"

	"github.com/elecbug/han-graph/internal/graph"
	"github.com/elecbug/han-graph/internal/webapp"
)

func serve(g *graph.Graph, dir, addr string, stdout, stderr io.Writer) int {
	practice, err := webapp.LoadPractice(filepath.Join(dir, "practice.json"), g)
	if err != nil {
		fmt.Fprintln(stderr, "Error:", err)
		return 1
	}
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		fmt.Fprintln(stderr, "Error:", err)
		return 1
	}
	server := &http.Server{
		Handler:           webapp.New(g, practice),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	done := make(chan struct{})
	defer close(done)
	go func() {
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
	return 0
}
