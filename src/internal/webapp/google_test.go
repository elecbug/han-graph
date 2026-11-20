package webapp

import (
	"bytes"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
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

func TestGoogleAccountFlow(t *testing.T) {
	const clientID = "100000-test.apps.googleusercontent.com"
	store, err := account.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
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
	auth(parts[0]+"."+parts[1]+"."+encode(make([]byte, 256)), 400)
	auth(valid, 200)
	request("auth/logout", map[string]string{}, user.ID, 200)
	signup := map[string]string{"username": "new_user", "password": "1234567890"}
	request("auth/register", signup, "", 400)
	signup["credential"] = token(challenge("register", ""), "second", "student@school.test", map[string]any{"hd": "school.test"})
	signup["password"] = "123456789"
	request("auth/register", signup, "", 400)
	signup["password"] = "1234567890"
	request("auth/register", signup, "", 200)
}
