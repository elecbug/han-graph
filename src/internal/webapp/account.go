package webapp

import (
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/elecbug/han-graph/internal/account"
	"github.com/elecbug/han-graph/internal/graph"
)

type Options struct {
	Accounts      *account.Store
	SecureCookies bool
}

const sessionCookie = "han_graph_session"

func accountJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(value)
}
func accountError(w http.ResponseWriter, err error) {
	status, code := http.StatusInternalServerError, "server_error"
	switch {
	case errors.Is(err, account.ErrInvalid):
		status, code = 400, "invalid"
	case errors.Is(err, account.ErrCredentials):
		status, code = 401, "credentials"
	case errors.Is(err, account.ErrUnauthorized):
		status, code = 401, "unauthorized"
	case errors.Is(err, account.ErrExists):
		status, code = 409, "username_taken"
	case errors.Is(err, account.ErrConflict):
		status, code = 409, "conflict"
	case errors.Is(err, account.ErrLimit):
		status, code = 422, "limit"
	}
	accountJSON(w, status, map[string]string{"error": code})
}
func accountBody(w http.ResponseWriter, r *http.Request, value any) bool {
	if strings.Split(r.Header.Get("Content-Type"), ";")[0] != "application/json" {
		accountJSON(w, 415, map[string]string{"error": "json_required"})
		return false
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1024*1024)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(value); err != nil {
		accountError(w, account.ErrInvalid)
		return false
	}
	if decoder.Decode(new(any)) != io.EOF {
		accountError(w, account.ErrInvalid)
		return false
	}
	return true
}
func cookieToken(r *http.Request) string {
	c, err := r.Cookie(sessionCookie)
	if err != nil {
		return ""
	}
	return c.Value
}

type loginAttempt struct {
	count   int
	expires time.Time
}
type loginLimiter struct {
	sync.Mutex
	entries map[string]loginAttempt
}

func (l *loginLimiter) allow(r *http.Request) bool {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	now := time.Now()
	l.Lock()
	defer l.Unlock()
	for key, attempt := range l.entries {
		if !attempt.expires.After(now) {
			delete(l.entries, key)
		}
	}
	attempt, exists := l.entries[host]
	if !exists {
		if len(l.entries) >= 10000 {
			return false
		}
		attempt.expires = now.Add(15 * time.Minute)
	}
	if attempt.count >= 30 {
		return false
	}
	attempt.count++
	l.entries[host] = attempt
	return true
}
func registerAccounts(mux *http.ServeMux, g *graph.Graph, options Options) {
	store := options.Accounts
	limiter := loginLimiter{entries: make(map[string]loginAttempt)}
	hashing := make(chan struct{}, 2)
	available := func(w http.ResponseWriter) bool {
		if store == nil {
			accountJSON(w, 503, map[string]string{"error": "accounts_unavailable"})
			return false
		}
		return true
	}
	resolve := func(w http.ResponseWriter, r *http.Request, write bool) (string, bool) {
		if !available(w) {
			return "", false
		}
		id, err := store.Resolve(cookieToken(r))
		if err != nil {
			accountError(w, err)
			return "", false
		}
		// A different tab may have changed the browser's session cookie. Never save
		// edits prepared for one account into another account.
		if write && r.Header.Get("X-Account-ID") != id {
			accountError(w, account.ErrUnauthorized)
			return "", false
		}
		return id, true
	}
	setCookie := func(w http.ResponseWriter, r *http.Request, token string) {
		age := int(account.SessionLifetime.Seconds())
		expires := time.Now().Add(account.SessionLifetime)
		if token == "" {
			age = -1
			expires = time.Unix(1, 0)
		}
		http.SetCookie(w, &http.Cookie{Name: sessionCookie, Value: token, Path: "/", MaxAge: age, Expires: expires, HttpOnly: true, Secure: options.SecureCookies || r.TLS != nil, SameSite: http.SameSiteLaxMode})
	}
	mux.HandleFunc("GET /api/auth/session", func(w http.ResponseWriter, r *http.Request) {
		if store == nil {
			accountJSON(w, 200, map[string]any{"user": nil, "words": []account.Ref{}, "notes": []account.Note{}, "enabled": false})
			return
		}
		id, err := store.Resolve(cookieToken(r))
		if errors.Is(err, account.ErrUnauthorized) {
			accountJSON(w, 200, account.Snapshot{Words: []account.Ref{}, Notes: []account.Note{}})
			return
		}
		if err != nil {
			accountError(w, err)
			return
		}
		result, err := store.Snapshot(id)
		if err != nil {
			accountError(w, err)
			return
		}
		accountJSON(w, 200, result)
	})
	for _, action := range []string{"register", "login"} {
		mux.HandleFunc("POST /api/auth/"+action, func(w http.ResponseWriter, r *http.Request) {
			if !available(w) {
				return
			}
			if !limiter.allow(r) {
				w.Header().Set("Retry-After", "900")
				accountJSON(w, 429, map[string]string{"error": "rate_limit"})
				return
			}
			var credentials struct {
				Username string `json:"username"`
				Password string `json:"password"`
			}
			if !accountBody(w, r, &credentials) {
				return
			}
			select {
			case hashing <- struct{}{}:
				defer func() { <-hashing }()
			default:
				w.Header().Set("Retry-After", "2")
				accountJSON(w, 429, map[string]string{"error": "rate_limit"})
				return
			}
			var user account.User
			var err error
			if action == "register" {
				user, err = store.Register(credentials.Username, credentials.Password)
			} else {
				user, err = store.Login(credentials.Username, credentials.Password)
			}
			if err != nil {
				accountError(w, err)
				return
			}
			token, err := store.StartSession(user.ID, cookieToken(r))
			if err != nil {
				accountError(w, err)
				return
			}
			result, err := store.Snapshot(user.ID)
			if err != nil {
				accountError(w, err)
				return
			}
			setCookie(w, r, token)
			accountJSON(w, 200, result)
		})
	}
	mux.HandleFunc("POST /api/auth/logout", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := resolve(w, r, true); !ok {
			return
		}
		var empty struct{}
		if !accountBody(w, r, &empty) {
			return
		}
		if err := store.EndSession(cookieToken(r)); err != nil {
			accountError(w, err)
			return
		}
		setCookie(w, r, "")
		accountJSON(w, 200, account.Snapshot{Words: []account.Ref{}, Notes: []account.Note{}})
	})
	mux.HandleFunc("POST /api/account/words", func(w http.ResponseWriter, r *http.Request) {
		id, ok := resolve(w, r, true)
		if !ok {
			return
		}
		var body struct {
			Words []account.Ref `json:"words"`
		}
		if !accountBody(w, r, &body) {
			return
		}
		result, err := store.AddWords(id, body.Words)
		if err != nil {
			accountError(w, err)
			return
		}
		accountJSON(w, 200, result)
	})
	mux.HandleFunc("DELETE /api/account/words", func(w http.ResponseWriter, r *http.Request) {
		id, ok := resolve(w, r, true)
		if !ok {
			return
		}
		var body account.Ref
		if !accountBody(w, r, &body) {
			return
		}
		result, err := store.RemoveWord(id, body)
		if err != nil {
			accountError(w, err)
			return
		}
		accountJSON(w, 200, result)
	})
	mux.HandleFunc("PUT /api/account/note", func(w http.ResponseWriter, r *http.Request) {
		id, ok := resolve(w, r, true)
		if !ok {
			return
		}
		var body account.Note
		if !accountBody(w, r, &body) {
			return
		}
		found := false
		for _, match := range g.FindWords(body.Word) {
			if match.Word.Hanja == body.Hanja {
				found = true
				break
			}
		}
		if !found {
			accountError(w, account.ErrInvalid)
			return
		}
		result, err := store.SaveNote(id, body)
		if err != nil {
			accountError(w, err)
			return
		}
		accountJSON(w, 200, result)
	})
}
