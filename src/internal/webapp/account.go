package webapp

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"google.golang.org/api/idtoken"
	"io"
	"log"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/elecbug/han-graph/internal/account"
	"github.com/elecbug/han-graph/internal/graph"
	grpcstatus "google.golang.org/grpc/status"
)

type Options struct {
	SignupMode     string
	BetaInviteCode string
	Audio          KoreanAudio
	GoogleClientID string
	verifyGoogle   func(context.Context, string, string) (*idtoken.Payload, error)
	Accounts       *account.Store
	SecureCookies  bool
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
	var input *graph.InputError
	if errors.As(err, &input) {
		status, code = http.StatusBadRequest, "dictionary_invalid"
		if input.Duplicate {
			status, code = http.StatusConflict, "dictionary_duplicate"
		}
		accountJSON(w, status, map[string]string{"error": code, "detail": input.Error()})
		return
	}
	switch {
	case errors.Is(err, account.ErrInvalid):
		status, code = 400, "invalid"
	case errors.Is(err, account.ErrGoogleTaken):
		status, code = 409, "google_taken"
	case errors.Is(err, account.ErrGoogleUnknown):
		status, code = 401, "google_unknown"
	case errors.Is(err, account.ErrRecoveryExpired):
		status, code = 401, "recovery_expired"
	case errors.Is(err, errGoogleCredential):
		status, code = 400, "google_invalid"
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
	if status == http.StatusInternalServerError {
		log.Printf("Storage request failed (type=%T, code=%s)", err, grpcstatus.Code(err))
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

func (options Options) setSessionCookie(w http.ResponseWriter, r *http.Request, token string) {
	age := int(account.SessionLifetime.Seconds())
	expires := time.Now().Add(account.SessionLifetime)
	if token == "" {
		age = -1
		expires = time.Unix(1, 0)
	}
	http.SetCookie(w, &http.Cookie{Name: sessionCookie, Value: token, Path: "/", MaxAge: age, Expires: expires, HttpOnly: true, Secure: options.SecureCookies || r.TLS != nil, SameSite: http.SameSiteLaxMode})
}

type loginAttempt struct {
	count   int
	expires time.Time
}
type loginLimiter struct {
	sync.Mutex
	entries     map[string]loginAttempt
	maxAttempts int
	expiryTimer *time.Timer
}

func (l *loginLimiter) expire() {
	l.Lock()
	defer l.Unlock()
	now := time.Now()
	var next time.Time
	for key, attempt := range l.entries {
		if !attempt.expires.After(now) {
			delete(l.entries, key)
		} else if next.IsZero() || attempt.expires.Before(next) {
			next = attempt.expires
		}
	}
	if next.IsZero() {
		l.expiryTimer = nil
	} else {
		l.expiryTimer.Reset(time.Until(next))
	}
}

func (l *loginLimiter) allow(r *http.Request) bool {
	return l.allowKey(r, "")
}
func (l *loginLimiter) allowKey(r *http.Request, scope string) bool {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	key := host + "\x00" + scope
	now := time.Now()
	l.Lock()
	defer l.Unlock()
	attempt, exists := l.entries[key]
	if !exists || !attempt.expires.After(now) {
		if !exists && len(l.entries) >= 10000 {
			return false
		}
		attempt = loginAttempt{expires: now.Add(15 * time.Minute)}
		if l.expiryTimer == nil {
			l.expiryTimer = time.AfterFunc(15*time.Minute, l.expire)
		}
	}
	limit := l.maxAttempts
	if limit == 0 {
		limit = 30
	}
	if attempt.count >= limit {
		return false
	}
	attempt.count++
	l.entries[key] = attempt
	return true
}

func (l *loginLimiter) allowAttempt(w http.ResponseWriter, r *http.Request) bool {
	if l.allow(r) {
		return true
	}
	return denyAttempt(w)
}
func denyAttempt(w http.ResponseWriter) bool {
	w.Header().Set("Retry-After", "900")
	accountJSON(w, 429, map[string]string{"error": "rate_limit"})
	return false
}
func registerAccounts(mux *http.ServeMux, g *graph.Graph, practice Practice, options Options) {
	store := options.Accounts
	limiter := loginLimiter{entries: make(map[string]loginAttempt)}
	schoolNetwork := loginLimiter{entries: make(map[string]loginAttempt), maxAttempts: 300}
	perLogin := loginLimiter{entries: make(map[string]loginAttempt), maxAttempts: 10}
	if options.SignupMode == "" {
		options.SignupMode = "open"
	}
	hashing := make(chan struct{}, 2)
	waiting := make(chan struct{}, 64)
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
		id, err := store.WithContext(r.Context()).Resolve(cookieToken(r))
		if err != nil {
			accountError(w, err)
			return "", false
		}
		// A different tab may have changed the browser's session cookie. Never save
		// edits prepared for one account into another account.
		if expected := r.Header.Get("X-Account-ID"); (write || expected != "") && expected != id {
			accountError(w, account.ErrUnauthorized)
			return "", false
		}
		return id, true
	}

	beginHash := func(w http.ResponseWriter, r *http.Request) bool {
		select {
		case waiting <- struct{}{}:
			defer func() { <-waiting }()
		default:
			w.Header().Set("Retry-After", "2")
			accountJSON(w, 429, map[string]string{"error": "rate_limit"})
			return false
		}
		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancel()
		select {
		case hashing <- struct{}{}:
			return true
		case <-ctx.Done():
			w.Header().Set("Retry-After", "2")
			accountJSON(w, 429, map[string]string{"error": "rate_limit"})
			return false
		}
	}
	registerPracticeHistory(mux, store, practice, resolve)
	feedbackLimiter := loginLimiter{entries: make(map[string]loginAttempt), maxAttempts: 120}
	mux.HandleFunc("POST /api/feedback", func(w http.ResponseWriter, r *http.Request) {
		if !available(w) || !feedbackLimiter.allowAttempt(w, r) {
			return
		}
		var body struct {
			ID       string `json:"id"`
			Message  string `json:"message"`
			Language string `json:"language"`
		}
		r.Body = http.MaxBytesReader(w, r.Body, 32<<10)
		if !accountBody(w, r, &body) {
			return
		}
		if err := store.WithContext(r.Context()).SubmitFeedback(body.ID, body.Message, body.Language); err != nil {
			accountError(w, err)
			return
		}
		accountJSON(w, http.StatusCreated, map[string]bool{"received": true})
	})
	mux.HandleFunc("GET /api/account/statistics", func(w http.ResponseWriter, r *http.Request) {
		id, ok := resolve(w, r, false)
		if !ok {
			return
		}
		query := r.URL.Query()
		days, err := store.WithContext(r.Context()).MonthlyStudy(id, query.Get("month"), query.Get("zone"))
		if err != nil {
			accountError(w, err)
			return
		}
		accountJSON(w, http.StatusOK, days)
	})
	mux.HandleFunc("POST /api/account/activity", func(w http.ResponseWriter, r *http.Request) {
		id, ok := resolve(w, r, true)
		if !ok {
			return
		}
		var input struct {
			Intervals []account.ActivityInterval `json:"intervals"`
		}
		if !accountBody(w, r, &input) {
			return
		}
		if err := store.WithContext(r.Context()).SaveActivity(id, input.Intervals); err != nil {
			accountError(w, err)
			return
		}
		accountJSON(w, http.StatusOK, map[string]bool{"saved": true})
	})
	sessionResponse := func(w http.ResponseWriter, data account.Snapshot) {
		accountJSON(w, http.StatusOK, struct {
			account.Snapshot
			GoogleClientID string `json:"google_client_id"`
			SignupMode     string `json:"signup_mode"`
			PrivacyVersion string `json:"privacy_version"`
		}{data, options.GoogleClientID, options.SignupMode, account.PrivacyVersion})
	}
	mux.HandleFunc("GET /api/auth/session", func(w http.ResponseWriter, r *http.Request) {
		if store == nil {
			accountJSON(w, 200, map[string]any{"user": nil, "words": []account.Ref{}, "notes": []account.Note{}, "enabled": false})
			return
		}
		id, err := store.WithContext(r.Context()).Resolve(cookieToken(r))
		if errors.Is(err, account.ErrUnauthorized) {
			sessionResponse(w, account.Snapshot{Words: []account.Ref{}, Notes: []account.Note{}})
			return
		}
		if err != nil {
			accountError(w, err)
			return
		}
		result, err := store.WithContext(r.Context()).Snapshot(id)
		if err != nil {
			accountError(w, err)
			return
		}
		sessionResponse(w, result)
	})
	if options.GoogleClientID != "" {
		registerGoogleRoutes(mux, options, store, resolve, &limiter, beginHash, func() { <-hashing }, sessionResponse)
	}
	mux.HandleFunc("PUT /api/account/credentials", func(w http.ResponseWriter, r *http.Request) {
		id, ok := resolve(w, r, true)
		if !ok || !limiter.allowAttempt(w, r) {
			return
		}
		var input account.CredentialChange
		if !accountBody(w, r, &input) || !beginHash(w, r) {
			return
		}
		defer func() { <-hashing }()
		db := store.WithContext(r.Context())
		if err := db.ChangeCredentials(id, cookieToken(r), input); err != nil {
			accountError(w, err)
			return
		}
		data, err := db.Snapshot(id)
		if err != nil {
			accountError(w, err)
			return
		}
		sessionResponse(w, data)
	})
	mux.HandleFunc("DELETE /api/account", func(w http.ResponseWriter, r *http.Request) {
		id, ok := resolve(w, r, true)
		if !ok || !limiter.allowAttempt(w, r) {
			return
		}
		var input struct {
			Username        string `json:"username"`
			CurrentPassword string `json:"current_password"`
			Confirm         bool   `json:"confirm"`
		}
		if !accountBody(w, r, &input) {
			return
		}
		if !input.Confirm {
			accountError(w, account.ErrInvalid)
			return
		}
		if !beginHash(w, r) {
			return
		}
		defer func() { <-hashing }()
		if err := store.WithContext(r.Context()).DeleteAccount(id, input.Username, input.CurrentPassword); err != nil {
			accountError(w, err)
			return
		}
		options.setSessionCookie(w, r, "")
		sessionResponse(w, account.Snapshot{Words: []account.Ref{}, Notes: []account.Note{}})
	})
	for _, action := range []string{"register", "login"} {
		mux.HandleFunc("POST /api/auth/"+action, func(w http.ResponseWriter, r *http.Request) {
			if !available(w) {
				return
			}
			if action == "register" && options.SignupMode == "closed" {
				accountJSON(w, http.StatusForbidden, map[string]string{"error": "signup_closed"})
				return
			}
			if !schoolNetwork.allowAttempt(w, r) {
				return
			}
			var credentials struct {
				Username       string `json:"username"`
				Password       string `json:"password"`
				Credential     string `json:"credential"`
				InviteCode     string `json:"invite_code"`
				PrivacyVersion string `json:"privacy_version"`
			}
			if !accountBody(w, r, &credentials) {
				return
			}
			if action == "register" || credentials.Credential == "" {
				name := account.NormalizeUsername(credentials.Username)
				if len(name) > 32 {
					accountError(w, account.ErrInvalid)
					return
				}
				if !perLogin.allowKey(r, action+"/"+name) {
					denyAttempt(w)
					return
				}
			}
			if action == "register" {
				if credentials.PrivacyVersion != account.PrivacyVersion {
					accountJSON(w, http.StatusBadRequest, map[string]string{"error": "privacy_required"})
					return
				}
				if options.SignupMode == "invite" {
					got, want := sha256.Sum256([]byte(credentials.InviteCode)), sha256.Sum256([]byte(options.BetaInviteCode))
					if options.BetaInviteCode == "" || subtle.ConstantTimeCompare(got[:], want[:]) != 1 {
						accountJSON(w, http.StatusForbidden, map[string]string{"error": "invite_invalid"})
						return
					}
				}
			}
			if !beginHash(w, r) {
				return
			}
			defer func() { <-hashing }()
			db := store.WithContext(r.Context())
			var user account.User
			var token string
			var err error
			usingGoogle := credentials.Credential != "" || (action == "register" && options.GoogleClientID != "")
			if usingGoogle {
				identity, verifyErr := options.googleIdentity(r, action, "", credentials.Credential)
				if verifyErr != nil {
					accountError(w, verifyErr)
					return
				}
				if action == "register" {
					user, err = db.RegisterWithNotice(credentials.Username, credentials.Password, identity.GoogleIdentity, credentials.PrivacyVersion)
				} else {
					user.ID, token, err = db.GoogleSession(identity.Subject, cookieToken(r))
				}
			} else if action == "register" {
				user, err = db.RegisterWithNotice(credentials.Username, credentials.Password, account.GoogleIdentity{}, credentials.PrivacyVersion)
			} else {
				user.ID, token, err = db.PasswordSession(credentials.Username, credentials.Password, cookieToken(r))
			}

			if err != nil {
				accountError(w, err)
				return
			}
			if action == "register" {
				token, err = db.StartSession(user.ID, cookieToken(r))
				if err != nil {
					accountError(w, err)
					return
				}
			}
			result, err := store.WithContext(r.Context()).Snapshot(user.ID)
			if err != nil {
				accountError(w, err)
				return
			}
			if usingGoogle {
				options.googleCookie(w, r, action, "", -1)
			}
			options.setSessionCookie(w, r, token)
			sessionResponse(w, result)
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
		if err := store.WithContext(r.Context()).EndSession(cookieToken(r)); err != nil {
			accountError(w, err)
			return
		}
		options.setSessionCookie(w, r, "")
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
		result, err := store.WithContext(r.Context()).AddWords(id, body.Words)
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
		result, err := store.WithContext(r.Context()).RemoveWord(id, body)
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
		result, err := store.WithContext(r.Context()).SaveNote(id, body, g)
		if err != nil {
			accountError(w, err)
			return
		}
		accountJSON(w, 200, result)
	})

	mux.HandleFunc("GET /api/account/dictionary", func(w http.ResponseWriter, r *http.Request) {
		id, ok := resolve(w, r, false)
		if !ok {
			return
		}
		if expected := r.Header.Get("X-Account-ID"); expected != "" && expected != id {
			accountError(w, account.ErrUnauthorized)
			return
		}
		snap, err := store.WithContext(r.Context()).Snapshot(id)
		if err != nil {
			accountError(w, err)
			return
		}
		accountJSON(w, 200, snap.Dictionary)
	})
	mux.HandleFunc("POST /api/account/dictionary", func(w http.ResponseWriter, r *http.Request) {
		id, ok := resolve(w, r, true)
		if !ok {
			return
		}
		var body graph.Additions
		if !accountBody(w, r, &body) {
			return
		}
		result, err := store.WithContext(r.Context()).AddDictionary(id, g, body)
		if err != nil {
			accountError(w, err)
			return
		}
		accountJSON(w, 200, result)
	})
	mux.HandleFunc("PUT /api/account/dictionary/tag", func(w http.ResponseWriter, r *http.Request) {
		id, ok := resolve(w, r, true)
		if !ok {
			return
		}
		var body struct {
			account.Ref
			Tag     string `json:"tag"`
			Enabled *bool  `json:"enabled"`
		}
		if !accountBody(w, r, &body) {
			return
		}
		if body.Enabled == nil {
			accountError(w, account.ErrInvalid)
			return
		}
		result, err := store.WithContext(r.Context()).SetDictionaryTag(id, body.Ref, body.Tag, *body.Enabled)
		if err != nil {
			accountError(w, err)
			return
		}
		accountJSON(w, 200, result)
	})
	mux.HandleFunc("DELETE /api/account/dictionary", func(w http.ResponseWriter, r *http.Request) {
		id, ok := resolve(w, r, true)
		if !ok {
			return
		}
		var body account.DictionaryRemoval
		if !accountBody(w, r, &body) {
			return
		}
		result, err := store.WithContext(r.Context()).RemoveDictionary(id, g, body)
		if err != nil {
			accountError(w, err)
			return
		}
		accountJSON(w, 200, result)
	})
}
