package webapp

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/elecbug/han-graph/internal/account"
	"google.golang.org/api/idtoken"
)

var googleClientPattern = regexp.MustCompile(`^[0-9]+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$`)
var errGoogleCredential = errors.New("invalid Google credential")

func ValidGoogleClientID(value string) bool { return googleClientPattern.MatchString(value) }

const googleLifetime = 15 * time.Minute

func (o Options) googleCookie(w http.ResponseWriter, r *http.Request, intent, secret string, age int) {
	http.SetCookie(w, &http.Cookie{Name: "han_graph_google_" + intent, Value: secret, Path: "/api/", HttpOnly: true, Secure: o.SecureCookies || r.TLS != nil, SameSite: http.SameSiteStrictMode, MaxAge: age})
}
func googleNonce(secret, intent, owner string) string {
	sum := sha256.Sum256([]byte(secret + "\x00" + intent + "\x00" + owner))
	return hex.EncodeToString(sum[:])
}
func (o Options) googleIdentity(r *http.Request, intent, owner, credential string) (account.GoogleIdentity, error) {
	var empty account.GoogleIdentity
	cookie, err := r.Cookie("han_graph_google_" + intent)
	if o.GoogleClientID == "" || err != nil || len(cookie.Value) != 64 || len(credential) == 0 || len(credential) > 16384 {
		return empty, errGoogleCredential
	}
	validate := o.verifyGoogle
	if validate == nil {
		validate = idtoken.Validate
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	payload, err := validate(ctx, credential, o.GoogleClientID)
	if err != nil || payload == nil {
		return empty, errGoogleCredential
	}
	if payload.Issuer != "accounts.google.com" && payload.Issuer != "https://accounts.google.com" {
		return empty, errGoogleCredential
	}
	now := time.Now()
	if payload.Audience != o.GoogleClientID || payload.Expires <= now.Unix() || payload.IssuedAt < now.Add(-googleLifetime).Unix() || payload.IssuedAt > now.Add(time.Minute).Unix() {
		return empty, errGoogleCredential
	}
	nonce, _ := payload.Claims["nonce"].(string)
	if subtle.ConstantTimeCompare([]byte(googleNonce(cookie.Value, intent, owner)), []byte(nonce)) != 1 {
		return empty, errGoogleCredential
	}
	email, _ := payload.Claims["email"].(string)
	verified, _ := payload.Claims["email_verified"].(bool)
	hostedDomain, _ := payload.Claims["hd"].(string)
	identity := account.GoogleIdentity{Subject: payload.Subject, Email: strings.ToLower(email)}
	// Google is authoritative for Gmail addresses and managed Workspace accounts.
	if !verified || !identity.Valid() || (!strings.HasSuffix(identity.Email, "@gmail.com") && hostedDomain == "") {
		return empty, errGoogleCredential
	}
	return identity, nil
}

func registerGoogleRoutes(mux *http.ServeMux, o Options, store *account.Store, resolve func(http.ResponseWriter, *http.Request, bool) (string, bool), limiter *loginLimiter, beginHash func(http.ResponseWriter) bool, endHash func(), respond func(http.ResponseWriter, account.Snapshot)) {
	mux.HandleFunc("POST /api/auth/google/challenge", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Intent string `json:"intent"`
		}
		if !accountBody(w, r, &body) {
			return
		}
		owner := ""
		switch body.Intent {
		case "link":
			var ok bool
			owner, ok = resolve(w, r, true)
			if !ok {
				return
			}
		case "login", "register":
		default:
			accountError(w, account.ErrInvalid)
			return
		}
		// Only the digest is given to Google. The browser keeps the preimage
		// in a host-only HttpOnly cookie scoped to our API.
		secret := ""
		if cookie, err := r.Cookie("han_graph_google_" + body.Intent); err == nil && len(cookie.Value) == 64 {
			secret = cookie.Value
		} else {
			var salt [32]byte
			if _, err := rand.Read(salt[:]); err != nil {
				accountError(w, err)
				return
			}
			secret = hex.EncodeToString(salt[:])
		}
		o.googleCookie(w, r, body.Intent, secret, int(googleLifetime.Seconds()))
		accountJSON(w, 200, map[string]string{"nonce": googleNonce(secret, body.Intent, owner)})
	})
	mux.HandleFunc("POST /api/account/google", func(w http.ResponseWriter, r *http.Request) {
		id, ok := resolve(w, r, true)
		if !ok {
			return
		}
		if !limiter.allow(r) {
			w.Header().Set("Retry-After", "900")
			accountJSON(w, 429, map[string]string{"error": "rate_limit"})
			return
		}
		var body struct {
			Username   string `json:"username"`
			Password   string `json:"password"`
			Credential string `json:"credential"`
		}
		if !accountBody(w, r, &body) {
			return
		}
		if !beginHash(w) {
			return
		}
		defer endHash()
		db := store.WithContext(r.Context())
		identity, err := o.googleIdentity(r, "link", id, body.Credential)
		if err != nil {
			accountError(w, err)
			return
		}
		if err := db.ChangeGoogle(id, body.Username, body.Password, identity); err != nil {
			accountError(w, err)
			return
		}
		o.googleCookie(w, r, "link", "", -1)
		snapshot, err := db.Snapshot(id)
		if err != nil {
			accountError(w, err)
			return
		}
		respond(w, snapshot)
	})
}
