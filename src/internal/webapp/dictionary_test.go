package webapp

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"strings"
	"testing"

	"github.com/elecbug/han-graph/internal/account"
	"github.com/elecbug/han-graph/internal/graph"
)

func TestPersonalDictionaryAPIVisibilityAndCacheInvalidation(t *testing.T) {
	g, p, _ := testApp(t)
	store, err := account.Open(filepath.Join(t.TempDir(), "accounts.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	app := New(g, p, Options{Accounts: store})
	request := func(method, path, body string, cookie *http.Cookie, id string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, "https://example.test"+path, strings.NewReader(body))
		if body != "" {
			r.Header.Set("Content-Type", "application/json")
		}
		if cookie != nil {
			r.AddCookie(cookie)
		}
		if id != "" {
			r.Header.Set("X-Account-ID", id)
		}
		w := httptest.NewRecorder()
		app.ServeHTTP(w, r)
		return w
	}
	register := func(name string) (*http.Cookie, string) {
		r := request("POST", "/api/auth/register", `{"username":"`+name+`","password":"a sufficiently long password"}`, nil, "")
		if r.Code != 200 {
			t.Fatal(r.Body.String())
		}
		var snap account.Snapshot
		if err := json.Unmarshal(r.Body.Bytes(), &snap); err != nil {
			t.Fatal(err)
		}
		return r.Result().Cookies()[0], snap.User.ID
	}
	a, aid := register("dictionary_a")
	b, bid := register("dictionary_b")
	wordsURL := "/api/words?q=" + url.QueryEscape("섬광")
	if r := request("GET", wordsURL, "", a, aid); r.Code != 200 || r.Body.String() != "[]\n" {
		t.Fatal("private word existed before registration", r.Body.String())
	}
	batch := `{"characters":[{"type":"character","id":"seom-9000","hanja":"閃","meaning_ko":["번쩍이다"],"meaning_en":["flash"]}],"words":[{"level":"normal","word":"섬광","hanja":"閃光","meaning_ko":"나만의 번쩍이는 빛","meaning_en":"PRIVATE OWNER A FLASH","components":["閃","光"]}],"examples":[{"word":"섬광","hanja":"閃光","example_ko":"하늘에서 섬광이 번쩍였어요.","example_en":"A flash lit up the sky."}]}`
	for _, tc := range []struct {
		cookie *http.Cookie
		id     string
		status int
	}{{nil, "", 401}, {a, bid, 401}, {b, aid, 401}, {a, aid, 200}} {
		r := request("POST", "/api/account/dictionary", batch, tc.cookie, tc.id)
		if r.Code != tc.status {
			t.Fatalf("add %d: %s", r.Code, r.Body.String())
		}
	}
	paths := []string{wordsURL, "/api/search?q=" + url.QueryEscape("섬광"), "/api/search?mode=sound&level=normal&q=" + url.QueryEscape("섬"), "/api/characters?q=" + url.QueryEscape("光"), "/api/neighborhood?q=" + url.QueryEscape("光")}
	for _, path := range paths {
		own := request("GET", path, "", a, aid)
		if own.Code != 200 || !strings.Contains(own.Body.String(), "PRIVATE OWNER A FLASH") {
			t.Fatalf("own lookup %s: %d %s", path, own.Code, own.Body.String())
		}
		if own.Header().Get("Cache-Control") != "no-store" || own.Header().Get("Vary") != "Cookie, X-Account-ID" {
			t.Fatal("private lookup cached publicly")
		}
		for _, who := range []struct {
			cookie *http.Cookie
			id     string
		}{{nil, ""}, {b, bid}, {a, "guest"}} {
			other := request("GET", path, "", who.cookie, who.id)
			if other.Code != 200 || strings.Contains(other.Body.String(), "PRIVATE OWNER A FLASH") {
				t.Fatalf("exposure: %s", other.Body.String())
			}
		}
	}
	ownStats := request("GET", "/api/stats", "", a, aid)
	var stats graph.Stats
	json.Unmarshal(ownStats.Body.Bytes(), &stats)
	if stats.Words != g.Stats().Words+1 || stats.Characters != g.Stats().Characters+1 {
		t.Fatal(stats)
	}
	for _, path := range append(paths, "/api/account/dictionary") {
		if r := request("GET", path, "", b, aid); r.Code != 401 {
			t.Fatalf("read from changed account allowed: %s", path)
		}
	}
	if r := request("GET", "/", "", a, aid); strings.Contains(r.Body.String(), "PRIVATE OWNER A FLASH") {
		t.Fatal("private content entered public HTML bootstrap")
	}
	for _, tc := range []struct {
		method, path, body string
		status             int
	}{
		{"POST", "/api/account/dictionary", batch, 409},
		{"POST", "/api/account/dictionary", `{"words":[],"user_id":"` + bid + `"}`, 400},
		{"POST", "/api/account/dictionary", `{"words":[{"level":"easy","word":"가격","hanja":"價格","meaning_ko":"override","meaning_en":"override","components":["價","格"]}]}`, 409},
		{"POST", "/api/account/dictionary", `{"words":[{"level":"normal","word":"실패","hanja":"失敗","meaning_ko":"bad","meaning_en":"bad","components":["失"]}]}`, 400},
		{"POST", "/api/account/words", `{"words":[{"word":"섬광","hanja":"閃光"}]}`, 200},
		{"PUT", "/api/account/note", `{"word":"섬광","hanja":"閃光","text":"personal word note","revision":0}`, 200},
		{"DELETE", "/api/account/dictionary", `{"kind":"character","id":"seom-9000"}`, 400},
		{"DELETE", "/api/account/dictionary", `{"kind":"word","word":"섬광","hanja":"閃光"}`, 200},
	} {
		r := request(tc.method, tc.path, tc.body, a, aid)
		if r.Code != tc.status {
			t.Fatalf("%s: %d wanted %d: %s", tc.path, r.Code, tc.status, r.Body.String())
		}
	}
	if r := request("GET", wordsURL, "", a, aid); r.Body.String() != "[]\n" {
		t.Fatal("deleted word remained in cached graph", r.Body.String())
	}
	var snap account.Snapshot
	json.Unmarshal(request("GET", "/api/auth/session", "", a, "").Body.Bytes(), &snap)
	if len(snap.Words) != 0 || len(snap.Notes) != 0 || len(snap.Dictionary.Examples) != 0 {
		t.Fatal("deleted word left dependent personal data")
	}
	if r := request("DELETE", "/api/account/dictionary", `{"kind":"character","id":"seom-9000"}`, a, aid); r.Code != 200 {
		t.Fatal(r.Body.String())
	}
	if r := request("POST", "/api/auth/logout", `{}`, a, aid); r.Code != 200 {
		t.Fatal(r.Body.String())
	}
	if r := request("GET", wordsURL, "", a, aid); r.Code != 401 {
		t.Fatal("expired account lookup returned data")
	}
	if len(g.FindWords("섬광")) != 0 {
		t.Fatal("base dictionary was changed")
	}
}
