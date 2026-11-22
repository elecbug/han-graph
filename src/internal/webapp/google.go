package webapp

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/binary"
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

type verifiedGoogle struct {
	account.GoogleIdentity
	recoveryStarted time.Time
}

func (o Options) googleIdentity(r *http.Request, intent, owner, credential string) (verifiedGoogle, error) {
	var empty verifiedGoogle
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
	result := verifiedGoogle{GoogleIdentity: identity}
	if intent == "recover" {
		// The signed nonce covers the timestamp and random bytes together.
		secret, err := hex.DecodeString(cookie.Value)
		if err != nil {
			return empty, errGoogleCredential
		}
		result.recoveryStarted = time.UnixMicro(int64(binary.BigEndian.Uint64(secret)))
		if result.recoveryStarted.After(now) || result.recoveryStarted.Unix() > payload.IssuedAt ||
			!now.Before(result.recoveryStarted.Add(account.RecoveryLifetime)) {
			return empty, account.ErrRecoveryExpired
		}
	}
	return result, nil
}

func registerGoogleRoutes(mux *http.ServeMux, o Options, store *account.Store, resolve func(http.ResponseWriter, *http.Request, bool) (string, bool), limiter *loginLimiter, beginHash func(http.ResponseWriter) bool, endHash func(), respond func(http.ResponseWriter, account.Snapshot)) {
	recoveryOwner := func(w http.ResponseWriter, r *http.Request) (string, bool) {
		if r.Header.Get("X-Account-ID") == "" {
			return "", true
		}
		return resolve(w, r, true)
	}
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
		case "recover":
			var ok bool
			owner, ok = recoveryOwner(w, r)
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
		if cookie, err := r.Cookie("han_graph_google_" + body.Intent); body.Intent != "recover" && err == nil && len(cookie.Value) == 64 {
			secret = cookie.Value
		} else {
			var salt [32]byte
			if _, err := rand.Read(salt[:]); err != nil {
				accountError(w, err)
				return
			}
			if body.Intent == "recover" {
				binary.BigEndian.PutUint64(salt[:8], uint64(time.Now().UnixMicro()))
			}
			secret = hex.EncodeToString(salt[:])
		}
		lifetime := googleLifetime
		if body.Intent == "recover" {
			lifetime = account.RecoveryLifetime
		}
		o.googleCookie(w, r, body.Intent, secret, int(lifetime.Seconds()))
		accountJSON(w, 200, map[string]string{"nonce": googleNonce(secret, body.Intent, owner)})
	})
	for _, step := range []string{"verify", "reset"} {
		mux.HandleFunc("POST /api/auth/recovery/"+step, func(w http.ResponseWriter, r *http.Request) {
			if store == nil {
				accountJSON(w, 503, map[string]string{"error": "accounts_unavailable"})
				return
			}
			if !limiter.allowAttempt(w, r) {
				return
			}
			var body struct {
				Credential  string  `json:"credential"`
				NewPassword *string `json:"new_password"`
			}
			if !accountBody(w, r, &body) {
				return
			}
			if (step == "reset") != (body.NewPassword != nil) {
				accountError(w, account.ErrInvalid)
				return
			}
			owner, ok := recoveryOwner(w, r)
			if !ok {
				return
			}
			if !beginHash(w) {
				return
			}
			defer endHash()
			proof, err := o.googleIdentity(r, "recover", owner, body.Credential)
			if err != nil {
				accountError(w, err)
				return
			}
			err = store.WithContext(r.Context()).RecoverPassword(owner, proof.Subject, proof.recoveryStarted, body.NewPassword)
			if err != nil {
				accountError(w, err)
				return
			}
			if step == "reset" {
				o.googleCookie(w, r, "recover", "", -1)
				if owner != "" {
					o.setSessionCookie(w, r, "")
				}
			}
			accountJSON(w, 200, map[string]string{"email": proof.Email})
		})
	}
	mux.HandleFunc("POST /api/account/google", func(w http.ResponseWriter, r *http.Request) {
		id, ok := resolve(w, r, true)
		if !ok {
			return
		}
		if !limiter.allowAttempt(w, r) {
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
		if err := db.ChangeGoogle(id, cookieToken(r), body.Username, body.Password, identity.GoogleIdentity); err != nil {
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
