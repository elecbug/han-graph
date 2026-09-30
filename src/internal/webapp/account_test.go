package webapp

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/elecbug/han-graph/internal/account"
)

func TestPrivateAccountAPI(t *testing.T) {
	g, p, _ := testApp(t)
	store, err := account.Open(filepath.Join(t.TempDir(), "accounts.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	app := New(g, p, Options{Accounts: store, SecureCookies: true})
	request := func(method, path, body string, cookie *http.Cookie, id, origin string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, "https://example.test"+path, strings.NewReader(body))
		if body != "" {
			req.Header.Set("Content-Type", "application/json")
		}
		if cookie != nil {
			req.AddCookie(cookie)
		}
		if id != "" {
			req.Header.Set("X-Account-ID", id)
		}
		if origin != "" {
			req.Header.Set("Origin", origin)
		}
		response := httptest.NewRecorder()
		app.ServeHTTP(response, req)
		return response
	}
	register := func(name string) (*http.Cookie, string) {
		r := request("POST", "/api/auth/register", `{"username":"`+name+`","password":"a sufficiently long password"}`, nil, "", "https://example.test")
		if r.Code != 200 {
			t.Fatal(r.Code, r.Body.String())
		}
		var snap account.Snapshot
		if err := json.Unmarshal(r.Body.Bytes(), &snap); err != nil {
			t.Fatal(err)
		}
		cookie := r.Result().Cookies()[0]
		if !cookie.HttpOnly || !cookie.Secure || cookie.SameSite != http.SameSiteLaxMode || cookie.Path != "/" {
			t.Fatalf("unsafe cookie: %+v", cookie)
		}
		if strings.Contains(r.Body.String(), "password") || strings.Contains(r.Body.String(), "Hash") || strings.Contains(r.Body.String(), cookie.Value) {
			t.Fatal("credentials leaked")
		}
		return cookie, snap.User.ID
	}
	a, aid := register("reader_a")
	b, bid := register("reader_b")
	words := `{"words":[{"word":"가격","hanja":"價格"}]}`
	note := `{"word":"가격","hanja":"價格","text":"<script>private note</script>","revision":0}`
	for _, tc := range []struct {
		method, path, body string
		cookie             *http.Cookie
		id, origin         string
		status             int
	}{
		{"POST", "/api/account/words", words, nil, "", "", 401},
		{"POST", "/api/account/words", words, a, bid, "", 401},
		{"POST", "/api/account/words", words, b, aid, "", 401},
		{"POST", "/api/account/words", words, a, aid, "https://evil.test", 403},
		{"POST", "/api/auth/login", `{}`, nil, "", "https://evil.test", 403},
		{"POST", "/api/account/words", words + `{}`, a, aid, "", 400},
		{"POST", "/api/account/words", `{"words":[],"user_id":"` + bid + `"}`, a, aid, "", 400},
		{"POST", "/api/account/words", words, a, aid, "", 200},
		{"PUT", "/api/account/note", note, a, aid, "", 200},
		{"PUT", "/api/account/note", note, a, aid, "", 409},
		{"PUT", "/api/account/note", `{"word":"가격","hanja":"假格","text":"bad identity"}`, a, aid, "", 400},
	} {
		r := request(tc.method, tc.path, tc.body, tc.cookie, tc.id, tc.origin)
		if r.Code != tc.status {
			t.Errorf("%s %s: got %d want %d: %s", tc.method, tc.path, r.Code, tc.status, r.Body.String())
		}
		if r.Header().Get("Cache-Control") != "no-store" {
			t.Error("private response must not be cached")
		}
	}
	r := request("GET", "/api/auth/session", "", b, "", "")
	var snap account.Snapshot
	json.Unmarshal(r.Body.Bytes(), &snap)
	if r.Code != 200 || len(snap.Words) != 0 || len(snap.Notes) != 0 || snap.User.ID != bid {
		t.Fatalf("cross-account exposure: %s", r.Body.String())
	}
	r = request("POST", "/api/auth/logout", `{}`, a, aid, "")
	if r.Code != 200 {
		t.Fatal(r.Body.String())
	}
	if r.Result().Cookies()[0].MaxAge != -1 {
		t.Fatal("logout did not clear cookie")
	}
	r = request("POST", "/api/account/words", words, a, aid, "")
	if r.Code != 401 {
		t.Fatal("old cookie works after logout")
	}
}
func TestLoginRateLimit(t *testing.T) {
	limiter := loginLimiter{entries: map[string]loginAttempt{}}
	r := httptest.NewRequest("POST", "/", nil)
	for range 30 {
		if !limiter.allow(r) {
			t.Fatal("limited too early")
		}
	}
	if limiter.allow(r) {
		t.Fatal("unbounded login attempts")
	}
	r.RemoteAddr = "198.51.100.2:1234"
	if !limiter.allow(r) {
		t.Fatal("independent address blocked")
	}
}
