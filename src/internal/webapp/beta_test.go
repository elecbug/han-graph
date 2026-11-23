package webapp

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/elecbug/han-graph/internal/account"
)

func TestCampusSignupAndPrivateFeedback(t *testing.T) {
	g, p, _ := testApp(t)
	store, err := account.Open(filepath.Join(t.TempDir(), "accounts.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	const invite = "test-invitation"
	app := New(g, p, Options{Accounts: store, SignupMode: "invite", BetaInviteCode: invite})
	call := func(method, route string, input any) *httptest.ResponseRecorder {
		t.Helper()
		body, err := json.Marshal(input)
		if err != nil {
			t.Fatal(err)
		}
		req := httptest.NewRequest(method, route, bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		out := httptest.NewRecorder()
		app.ServeHTTP(out, req)
		return out
	}
	guest := call("GET", "/api/auth/session", nil)
	if guest.Code != 200 || !strings.Contains(guest.Body.String(), `"signup_mode":"invite"`) || strings.Contains(guest.Body.String(), invite) {
		t.Fatal("invalid public signup settings")
	}
	signup := map[string]string{"username": "campus_reader", "password": "study-password", "invite_code": invite}
	if got := call("POST", "/api/auth/register", signup); got.Code != 400 {
		t.Fatal("missing notice", got.Code)
	}
	signup["privacy_version"] = account.PrivacyVersion
	signup["invite_code"] = "wrong-code"
	if got := call("POST", "/api/auth/register", signup); got.Code != 403 {
		t.Fatal("incorrect invitation", got.Code)
	}
	signup["invite_code"] = invite
	if got := call("POST", "/api/auth/register", signup); got.Code != 200 {
		t.Fatal("invited registration", got.Code)
	}
	app = New(g, p, Options{Accounts: store, SignupMode: "closed"})
	if got := call("POST", "/api/auth/register", signup); got.Code != 403 {
		t.Fatal("signup closed", got.Code)
	}
	if got := call("POST", "/api/auth/login", map[string]string{"username": signup["username"], "password": signup["password"]}); got.Code != 200 {
		t.Fatal("existing account login", got.Code)
	}
	input := map[string]string{"id": "00112233445566778899aabbccddeeff", "message": " 가의 발음 문의 ", "language": "ko"}
	for range 2 {
		if got := call("POST", "/api/feedback", input); got.Code != 201 {
			t.Fatal("feedback", got.Code)
		}
	}
	n := 0
	err = store.VisitFeedback(func(id string, f account.Feedback) error {
		n++
		if id != input["id"] || f.Message != "가의 발음 문의" || f.Language != "ko" || f.CreatedAt.IsZero() {
			return fmt.Errorf("unexpected feedback")
		}
		return nil
	})
	if err != nil || n != 1 {
		t.Fatal("feedback retry", n, err)
	}
	input["message"] = "changed"
	if got := call("POST", "/api/feedback", input); got.Code != 409 {
		t.Fatal("overwriting receipt", got.Code)
	}
	for _, message := range []string{"  ", strings.Repeat("가", 2001)} {
		input["message"] = message
		if got := call("POST", "/api/feedback", input); got.Code != 400 {
			t.Fatal("invalid message", got.Code)
		}
	}
	for _, route := range []string{"/api/feedback", "/api/feedback/" + input["id"]} {
		if got := call("GET", route, nil); got.Code < 400 || strings.Contains(got.Body.String(), "발음 문의") {
			t.Fatal("public feedback read", got.Code)
		}
	}
	if err := store.ResolveFeedback(input["id"]); err != nil {
		t.Fatal(err)
	}
	if err := store.VisitFeedback(func(string, account.Feedback) error { return fmt.Errorf("resolved feedback remains") }); err != nil {
		t.Fatal(err)
	}
	for _, lang := range []string{"ko", "en", "ru", "uz", "ky", "zh", "ja", "es", "vi", "ne", "mn", "th"} {
		got := call("GET", "/privacy?lang="+lang, nil)
		if got.Code != http.StatusOK || got.Header().Get("Content-Language") != lang || !strings.Contains(got.Body.String(), "HAN-GRAPH Team") || !strings.Contains(got.Body.String(), "#feedback") {
			t.Fatal("privacy route", lang)
		}
	}
}

func TestClassroomSharesNetworkQuota(t *testing.T) {
	g, p, _ := testApp(t)
	store, err := account.Open(filepath.Join(t.TempDir(), "classroom.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	app := New(g, p, Options{Accounts: store})
	attempt := func(action string, student int) *httptest.ResponseRecorder {
		t.Helper()
		body, err := json.Marshal(map[string]string{
			"username": fmt.Sprintf("student_%d", student), "password": "classroom-test-password",
			"privacy_version": account.PrivacyVersion,
		})
		if err != nil {
			t.Fatal(err)
		}
		req := httptest.NewRequest(http.MethodPost, "/api/auth/"+action, bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.RemoteAddr = "192.0.2.1:1234"
		out := httptest.NewRecorder()
		app.ServeHTTP(out, req)
		return out
	}
	for i := range 50 {
		for _, action := range []string{"register", "login"} {
			if got := attempt(action, i); got.Code != http.StatusOK {
				t.Fatal("classmate blocked", i, action, got.Code)
			}
		}
	}
	for i := range 9 {
		if got := attempt("login", 0); got.Code != http.StatusOK {
			t.Fatal("early limit", i, got.Code)
		}
	}
	if got := attempt("login", 0); got.Code != http.StatusTooManyRequests || got.Header().Get("Retry-After") == "" {
		t.Fatal("missing per-user limit", got.Code)
	}
	if got := attempt("login", 1); got.Code != http.StatusOK {
		t.Fatal("classmate shares another student's limit", got.Code)
	}
}
