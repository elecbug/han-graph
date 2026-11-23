package webapp

import (
	"bytes"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/elecbug/han-graph/internal/account"
	"google.golang.org/api/idtoken"
	"google.golang.org/api/option"
)

type keyTransport func(*http.Request) (*http.Response, error)

func (f keyTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

type googleTestFlow struct {
	store     *account.Store
	user      account.User
	cookies   map[string]*http.Cookie
	request   func(string, map[string]string, string, int) *httptest.ResponseRecorder
	challenge func(string, string) string
	token     func(string, string, string, map[string]any) string
}

func newGoogleTestFlow(t *testing.T) googleTestFlow {
	t.Helper()
	const clientID = "100000-test.apps.googleusercontent.com"
	store, err := account.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	user, err := store.Register("returning", "1234567890")
	if err != nil {
		t.Fatal(err)
	}
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	encode := base64.RawURLEncoding.EncodeToString
	// Use the production ID-token verifier with a test-only RSA public key.
	jwks := `{"keys":[{"kty":"RSA","alg":"RS256","kid":"local","n":"` + encode(key.N.Bytes()) + `","e":"AQAB"}]}`
	validator, err := idtoken.NewValidator(t.Context(), option.WithHTTPClient(&http.Client{Transport: keyTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.String() != "https://www.googleapis.com/oauth2/v3/certs" {
			t.Fatalf("unexpected key source %s", r.URL)
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(jwks)), Header: make(http.Header)}, nil
	})}))
	if err != nil {
		t.Fatal(err)
	}
	g, p, _ := testApp(t)
	handler := New(g, p, Options{Accounts: store, GoogleClientID: clientID, verifyGoogle: validator.Validate})
	cookies := map[string]*http.Cookie{}
	request := func(path string, body map[string]string, id string, want int) *httptest.ResponseRecorder {
		t.Helper()
		payload, _ := json.Marshal(body)
		req := httptest.NewRequest("POST", "https://example.test/api/"+path, bytes.NewReader(payload))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Account-ID", id)
		for _, c := range cookies {
			req.AddCookie(c)
		}
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != want {
			t.Fatalf("%s: got %d want %d: %s", path, rec.Code, want, rec.Body.String())
		}
		for _, c := range rec.Result().Cookies() {
			if c.MaxAge < 0 {
				delete(cookies, c.Name)
			} else {
				cookies[c.Name] = c
			}
		}
		return rec
	}
	challenge := func(intent, id string) string {
		t.Helper()
		rec := request("auth/google/challenge", map[string]string{"intent": intent}, id, 200)
		var data map[string]string
		if err := json.Unmarshal(rec.Body.Bytes(), &data); err != nil || len(data["nonce"]) != 64 {
			t.Fatal("missing nonce", err)
		}
		return data["nonce"]
	}
	token := func(nonce, subject, email string, overrides map[string]any) string {
		t.Helper()
		claims := map[string]any{"iss": "https://accounts.google.com", "aud": clientID, "sub": subject, "email": email, "email_verified": true, "nonce": nonce, "iat": time.Now().Unix(), "exp": time.Now().Add(time.Hour).Unix()}
		for k, v := range overrides {
			claims[k] = v
		}
		body, _ := json.Marshal(claims)
		jwt := encode([]byte(`{"alg":"RS256","kid":"local"}`)) + "." + encode(body)
		sha := sha256.Sum256([]byte(jwt))
		signature, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, sha[:])
		if err != nil {
			t.Fatal(err)
		}
		return jwt + "." + encode(signature)
	}
	return googleTestFlow{store, user, cookies, request, challenge, token}
}

func TestGoogleAccountFlow(t *testing.T) {
	f := newGoogleTestFlow(t)
	user, request, challenge, token := f.user, f.request, f.challenge, f.token
	local := map[string]string{"username": "returning", "password": "1234567890"}
	request("auth/login", local, "", 200)
	link := map[string]string{"username": "returning", "password": "incorrect", "credential": token(challenge("link", user.ID), "first", "reader@gmail.com", nil)}
	request("account/google", link, user.ID, 401)
	link["password"] = local["password"]
	request("account/google", link, user.ID, 200)
	request("account/google", link, user.ID, 400)
	request("auth/logout", map[string]string{}, user.ID, 200)
	nonce := challenge("login", "")
	auth := func(credential string, want int) {
		request("auth/login", map[string]string{"credential": credential}, "", want)
	}
	for _, bad := range []map[string]any{{"iss": "https://example.test"}, {"aud": "other"}, {"email_verified": false}, {"email": "user@outside.test"}, {"exp": time.Now().Add(-time.Minute).Unix()}, {"nonce": "wrong"}} {
		auth(token(nonce, "first", "reader@gmail.com", bad), 400)
	}
	auth(token(nonce, "unlinked", "reader@gmail.com", nil), 401)
	valid := token(nonce, "first", "reader@gmail.com", nil)
	parts := strings.Split(valid, ".")
	auth(parts[0]+"."+parts[1]+"."+base64.RawURLEncoding.EncodeToString(make([]byte, 256)), 400)
	auth(valid, 200)
	link["credential"] = token(challenge("link", user.ID), "replacement", "next@gmail.com", nil)
	request("account/google", link, user.ID, 200)
	request("auth/logout", map[string]string{}, user.ID, 200)
	nonce = challenge("login", "")
	auth(token(nonce, "first", "reader@gmail.com", nil), 401)
	auth(token(nonce, "replacement", "next@gmail.com", nil), 200)
	request("auth/logout", map[string]string{}, user.ID, 200)
	signup := map[string]string{"username": "new_user", "password": "1234567890", "privacy_version": account.PrivacyVersion}
	request("auth/register", signup, "", 400)
	signup["credential"] = token(challenge("register", ""), "second", "student@school.test", map[string]any{"hd": "school.test"})
	signup["password"] = "123456789"
	request("auth/register", signup, "", 400)
	signup["password"] = "1234567890"
	request("auth/register", signup, "", 200)
}

func TestGooglePasswordRecovery(t *testing.T) {
	f := newGoogleTestFlow(t)
	const sub = "linked-reader"
	const email = "reader@gmail.com"
	if err := f.store.LinkGoogle(f.user.ID, account.GoogleIdentity{Subject: sub, Email: email}); err != nil {
		t.Fatal(err)
	}
	const verify, reset = "auth/recovery/verify", "auth/recovery/reset"
	newPassword := "new recovery password"
	body := map[string]string{"credential": f.token(f.challenge("login", ""), sub, email, nil)}
	nonce := f.challenge("recover", "")
	cookie := f.cookies["han_graph_google_recover"]
	if !cookie.HttpOnly || !cookie.Secure || cookie.SameSite != http.SameSiteStrictMode {
		t.Fatal("recovery cookie protections")
	}
	stale := *cookie
	secret, err := hex.DecodeString(stale.Value)
	if err != nil {
		t.Fatal(err)
	}
	binary.BigEndian.PutUint64(secret, uint64(time.Now().Add(-account.RecoveryLifetime-time.Minute).UnixMicro()))
	stale.Value = hex.EncodeToString(secret)
	f.cookies["han_graph_google_recover"] = &stale
	f.request(verify, map[string]string{"credential": f.token(googleNonce(stale.Value, "recover", ""), sub, email, nil)}, "", 401)
	f.cookies["han_graph_google_recover"] = cookie
	f.request(verify, body, "", 400)
	body["credential"] = f.token(nonce, "other-subject", email, nil)
	f.request(verify, body, "", 401)
	body["credential"] = f.token(nonce, sub, email, map[string]any{"email_verified": false})
	f.request(verify, body, "", 400)
	body["credential"] = f.token(nonce, sub, email, nil)
	delete(f.cookies, "han_graph_google_recover")
	f.request(verify, body, "", 400)
	f.cookies["han_graph_google_recover"] = cookie
	rec := f.request(verify, body, "", 200)
	if _, ok := f.cookies[sessionCookie]; ok || !strings.Contains(rec.Body.String(), email) {
		t.Fatal("verification should only return the verified address")
	}
	f.request(reset, body, "", 400)
	body["new_password"] = "123456789"
	f.request(reset, body, "", 400)
	body["new_password"] = newPassword
	f.request(reset, body, "", 200)
	if _, ok := f.cookies["han_graph_google_recover"]; ok {
		t.Fatal("reset did not clear recovery cookie")
	}
	f.cookies["han_graph_google_recover"] = cookie
	f.request(reset, body, "", 401)
	if _, ok := f.cookies[sessionCookie]; ok {
		t.Fatal("recovery created a login session")
	}
	f.request("auth/login", map[string]string{"username": f.user.Username, "password": "1234567890"}, "", 401)
	f.request("auth/login", map[string]string{"username": f.user.Username, "password": newPassword}, "", 200)
	_, err = f.store.RegisterGoogle("another-reader", "another password", account.GoogleIdentity{Subject: "other", Email: "other@gmail.com"})
	if err != nil {
		t.Fatal(err)
	}
	nonce = f.challenge("recover", f.user.ID)
	body = map[string]string{"credential": f.token(nonce, "other", "other@gmail.com", nil)}
	f.request(verify, body, f.user.ID, 401)
	body["new_password"] = "must not be written"
	f.request(reset, body, f.user.ID, 401)
	if _, err := f.store.Login("another-reader", "another password"); err != nil {
		t.Fatal(err)
	}
	body = map[string]string{"credential": f.token(nonce, sub, email, nil)}
	f.request(verify, body, "", 400)
	f.request(verify, body, f.user.ID, 200)
	body["new_password"] = "settings recovery password"
	f.request(reset, body, f.user.ID, 200)
	if _, ok := f.cookies[sessionCookie]; ok {
		t.Fatal("settings recovery did not clear login cookie")
	}
}
