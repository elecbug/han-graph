package webapp

import (
	_ "embed"
	"encoding/json"
	"html/template"
	"net/http"
	"slices"
	"strings"

	"github.com/elecbug/han-graph/internal/account"
	"golang.org/x/text/language"
)

//go:embed privacy.json
var privacyText []byte

type noticeLanguage struct {
	Code, Name, English, LanguageMenu, Title, Updated, Contact string
	Paragraphs                                                 []string
}

var noticeTemplate = template.Must(template.New("privacy").Parse(`<!doctype html>
<html lang="{{.Text.Code}}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{{.Text.Title}} · HAN-GRAPH</title><link rel="stylesheet" href="/styles.css"></head>
<body class="privacy-document"><main><a class="footer-brand" href="/">漢-GRAPH</a>
<h1>{{.Text.Title}}</h1><p class="notice-byline">HAN-GRAPH Team · {{.Text.Updated}} <time datetime="{{.Date}}">{{.Date}}</time></p>
{{range .Text.Paragraphs}}<p>{{.}}</p>{{end}}
<p><a class="primary-button" href="/?lang={{.Text.Code}}#feedback">{{.Text.Contact}}</a></p>
<nav aria-label="{{.Text.LanguageMenu}}">{{range .Languages}}<a href="/privacy?lang={{.Code}}" lang="{{.Code}}" hreflang="{{.Code}}">{{.Name}}({{.English}})</a> {{end}}</nav>
</main></body></html>`))

func registerPrivacy(mux *http.ServeMux) {
	var notices []noticeLanguage
	if err := json.Unmarshal(privacyText, &notices); err != nil {
		panic(err)
	}
	tags := make([]language.Tag, len(notices))
	for i, n := range notices {
		tags[i] = language.Make(n.Code)
	}
	matcher := language.NewMatcher(tags)
	mux.HandleFunc("GET /privacy", func(w http.ResponseWriter, r *http.Request) {
		preferred, _, _ := language.ParseAcceptLanguage(r.Header.Get("Accept-Language"))
		_, browser, _ := matcher.Match(preferred...)
		menu := slices.Clone(notices)
		priority := []string{notices[browser].Code, "ko", "en"}
		slices.SortStableFunc(menu, func(a, b noticeLanguage) int {
			rank := func(code string) int {
				if i := slices.Index(priority, code); i >= 0 {
					return i
				}
				return len(priority)
			}
			if d := rank(a.Code) - rank(b.Code); d != 0 {
				return d
			}
			return strings.Compare(a.English, b.English)
		})
		if requested := strings.TrimSpace(r.URL.Query().Get("lang")); requested != "" {
			preferred = append([]language.Tag{language.Make(requested)}, preferred...)
		}
		_, index, _ := matcher.Match(preferred...)
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Content-Language", notices[index].Code)
		w.Header().Set("Vary", "Accept-Language")
		w.Header().Set("Cache-Control", "no-cache")
		noticeTemplate.Execute(w, struct {
			Text      noticeLanguage
			Languages []noticeLanguage
			Date      string
		}{notices[index], menu, account.PrivacyVersion})
	})
}
