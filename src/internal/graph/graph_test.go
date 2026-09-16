package graph

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"unicode"
)

// The repeated-glyph word is synthetic and exercises graph structure only.
func fixture(t *testing.T) map[string]string {
	t.Helper()
	files := make(map[string]string)
	encode := func(name string, rows ...any) {
		for _, row := range rows {
			data, err := json.Marshal(row)
			if err != nil {
				t.Fatal(err)
			}
			files[name] += string(data) + "\n"
		}
	}
	encode("meta.jsonl", Meta{"meta", "bun", "분", "bun"}, Meta{"meta", "su", "수", "su"}, Meta{"meta", "sak", "삭", "sak"})
	encode("character.jsonl",
		Character{"character", "bun-000", "分", []string{"나누다"}, []string{"divide"}},
		Character{"character", "bun-200", "噴", []string{"뿜다"}, []string{"spray"}},
		Character{"character", "su-000", "數", []string{"수"}, []string{"number"}},
		Character{"character", "su-001", "水", []string{"물"}, []string{"water"}},
		Character{"character", "sak-000", "數", []string{"자주"}, []string{"frequently"}})
	encode("normal_word.jsonl",
		Word{"normal", "분수", "分數", "나눈 수", "fraction", []string{"分", "數"}, "나눈 수"},
		Word{"normal", "분수", "噴水", "물을 뿜음", "fountain", []string{"噴", "水"}, ""},
		Word{"normal", "반복테스트", "水水", "테스트", "test", []string{"水", "水"}, ""})
	return files
}

func writeFixture(t *testing.T, files map[string]string) string {
	t.Helper()
	dir := t.TempDir()
	for name, content := range files {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0600); err != nil {
			t.Fatal(err)
		}
	}
	return dir
}

func TestWordGraph(t *testing.T) {
	g, err := Load(writeFixture(t, fixture(t)))
	if err != nil {
		t.Fatal(err)
	}
	words := g.FindWords("분수")
	if len(words) != 2 || words[0].Word.Hanja != "分數" || words[1].Word.Hanja != "噴水" {
		t.Fatalf("homographs were lost: %+v", words)
	}
	if len(words[0].Components[1].Readings) != 2 {
		t.Fatal("multiple readings of 數 were lost")
	}
	if matches := g.FindWords("噴水"); len(matches) != 1 || matches[0].Word.MeaningEn != "fountain" {
		t.Fatalf("hanja lookup: %+v", matches)
	}
	if parts := g.FindWords("水水")[0].Components; len(parts) != 2 || parts[0].Hanja != "水" || parts[1].Hanja != "水" {
		t.Fatalf("repeated positions were lost: %+v", parts)
	}
	for _, query := range []string{"水", "su-001"} {
		matches := g.FindCharacters(query)
		if len(matches) != 1 || len(matches[0].Words) != 2 {
			t.Fatalf("%s: reverse index duplicated or lost words: %+v", query, matches)
		}
	}
	if matches := g.FindCharacters("수"); len(matches) != 2 {
		t.Fatalf("reading lookup: %+v", matches)
	}
	for _, match := range g.FindCharacters("數") {
		if len(match.Words) != 1 || match.Words[0].Hanja != "分數" {
			t.Fatalf("readings must share glyph edges: %+v", match)
		}
	}
	if stats := g.Stats(); stats.Characters != 4 || stats.CharacterReadings != 5 || stats.Words != 3 || stats.Edges != 5 || stats.ConnectedCharacters != 4 {
		t.Fatalf("incorrect graph statistics: %+v", stats)
	}
	for _, result := range []any{g.FindWords("missing"), g.FindCharacters("missing")} {
		data, _ := json.Marshal(result)
		if string(data) != "[]" {
			t.Fatalf("empty matches must encode as []: %s", data)
		}
	}
}

func TestInvalidDataset(t *testing.T) {
	cases := []struct {
		name, file, want string
		change           func(string) string
	}{
		{"comment", "normal_word.jsonl", ":5:", func(s string) string { return s + "\n// progress\n" }},
		{"trailing object", "meta.jsonl", ":1:", func(s string) string { return strings.Replace(s, "\n", " {}\n", 1) }},
		{"unknown field", "meta.jsonl", "unknown field", func(s string) string { return strings.Replace(s, `"type":`, `"typo":1,"type":`, 1) }},
		{"empty file", "meta.jsonl", "no records", func(string) string { return "\n" }},
		{"invalid UTF8", "meta.jsonl", "invalid UTF-8", func(s string) string { return s + "\xff" }},
		{"duplicate meta", "meta.jsonl", "duplicate meta id", func(s string) string { return s + strings.Split(s, "\n")[0] }},
		{"unknown meta", "character.jsonl", "unknown meta id", func(s string) string { return strings.Replace(s, "bun-000", "unknown-000", 1) }},
		{"duplicate id", "character.jsonl", "duplicate character id", func(s string) string { return strings.Replace(s, "bun-200", "bun-000", 1) }},
		{"duplicate reading", "character.jsonl", "duplicate hanja/reading", func(s string) string { return strings.Replace(s, "噴", "分", 1) }},
		{"bad id", "character.jsonl", "id=<meta>", func(s string) string { return strings.Replace(s, "bun-000", "bun000", 1) }},
		{"missing meaning", "character.jsonl", "nonempty meaning arrays", func(s string) string { return strings.Replace(s, `["divide"]`, `[]`, 1) }},
		{"wrong order", "normal_word.jsonl", "components must reproduce", func(s string) string { return strings.Replace(s, `"分數"`, `"數分"`, 1) }},
		{"unknown component", "normal_word.jsonl", "unknown component", func(s string) string { return strings.ReplaceAll(s, "噴", "火") }},
		{"duplicate word", "normal_word.jsonl", "duplicate word/hanja", func(s string) string { return s + strings.Split(s, "\n")[0] }},
		{"null record", "normal_word.jsonl", "expected level", func(s string) string { return s + "null\n" }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			files := fixture(t)
			files[tc.file] = tc.change(files[tc.file])
			_, err := Load(writeFixture(t, files))
			if err == nil || !strings.Contains(err.Error(), tc.file) || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("wanted %s / %s, got %v", tc.file, tc.want, err)
			}
		})
	}
}

func TestMissingFile(t *testing.T) {
	files := fixture(t)
	delete(files, "character.jsonl")
	_, err := Load(writeFixture(t, files))
	if err == nil || !strings.Contains(err.Error(), "character.jsonl") {
		t.Fatalf("expected missing filename, got %v", err)
	}
}

func TestRepositoryDataset(t *testing.T) {
	g, err := Load(filepath.Join("..", "..", "..", "dataset"))
	if err != nil {
		t.Fatal(err)
	}
	words := g.FindWords("가격")
	if len(words) == 0 || words[0].Word.Hanja != "價格" || len(words[0].Components) != 2 {
		t.Fatalf("expected seed word 가격: %+v", words)
	}
	found := make(map[string]bool)
	for _, match := range g.FindCharacters("家") {
		for _, word := range match.Words {
			found[word.Word] = true
		}
	}
	if !found["가정"] || !found["작가"] {
		t.Fatalf("expected seed connections for 家: %+v", found)
	}
}

func TestExpandedVocabularyCoverage(t *testing.T) {
	g, err := Load(filepath.Join("..", "..", "..", "dataset"))
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{
		"ga-000", "ga-001", "ga-002", "ga-003", "ga-004", "ga-005", "ga-006", "ga-007", "ga-100", "ga-101",
		"gak-000", "gak-001", "gak-002", "gak-100", "gak-101", "gak-102", "gak-103", "gan-000", "gan-001", "gan-002",
		"gan-100", "gan-101", "gan-102", "gan-103", "gan-104", "gan-105", "gal-000", "gam-000", "gam-001", "gam-002",
		"gam-003", "gam-100", "gam-101", "gap-000", "gang-000", "gang-001", "gang-002", "gang-003", "gang-100", "gang-101",
		"gang-102", "gang-103", "gae-000", "gae-001", "gae-002", "gae-003", "gae-100", "gae-101", "gae-102", "gae-103",
		"gaek-000", "gaeng-000", "geo-000", "geo-001", "geo-002", "geo-003", "geo-004", "geo-100", "geo-101", "geo-102",
		"geon-000", "geon-001", "geon-100", "geon-101", "geol-100", "geol-101", "geom-100", "geom-101", "geom-102", "gyeok-100",
		"gyeok-101", "gyeok-102", "gyeok-103", "gyeon-000", "gyeon-001", "gyeon-002", "gyeon-100", "gyeon-101", "gyeon-102", "gyeon-103",
		"gyeol-000", "gyeol-001", "gyeol-002", "gyeol-100", "gyeom-100", "gyeom-101", "gyeong-000", "gyeong-001", "gyeong-002", "gyeong-003",
		"gyeong-004", "gyeong-005", "gyeong-006", "gyeong-007", "gyeong-008", "gyeong-009", "gyeong-100", "gyeong-101", "gyeong-102", "gyeong-103",
		"gyeong-104", "gyeong-105", "gyeong-106", "gyeong-107", "gyeong-108", "gye-000", "gye-001", "gye-002", "gye-003", "gye-004",
		"gye-005", "gye-100", "gye-101", "gye-102", "gye-103", "gye-104", "gye-105", "gye-106", "gye-107", "gye-108",
		"gye-109", "go-000", "go-001", "go-002", "go-003", "go-004", "go-005", "go-006", "go-100", "go-101",
		"go-102", "go-103", "go-104", "go-105", "go-106", "gok-000", "gok-001", "gok-002", "gok-100", "gon-000",
		"gon-001", "gol-000", "gong-000", "gong-001", "gong-002", "gong-003", "gong-004", "gong-100", "gong-101", "gong-102",
		"gong-103", "gong-104", "gong-105", "gwa-000", "gwa-001", "gwa-002", "gwa-003", "gwa-100", "gwa-101", "gwak-100",
		"gwan-000", "gwan-001", "gwan-002", "gwan-100", "gwan-101", "gwan-102", "gwan-103", "gwan-104", "gwan-105", "gwang-000",
		"gwang-001", "gwang-100", "gwang-101", "gwae-100", "goe-100", "goe-101", "goe-102", "goe-103", "gyo-000", "gyo-001",
		"gyo-002", "gyo-003", "gyo-100", "gyo-101", "gyo-102", "gyo-103", "gu-000", "gu-001", "gu-002", "gu-003",
		"gu-004", "gu-005", "gu-006", "gu-007", "gu-100", "gu-101", "gu-102", "gu-103", "gu-104", "gu-105",
		"gu-106", "gu-107", "gu-108", "gu-109", "gu-110", "gu-111", "guk-000", "guk-100", "guk-101", "gun-000",
		"gun-001", "gun-002", "gun-100", "gul-100", "gung-000", "gung-100", "gung-101", "gwon-000", "gwon-001", "gwon-002",
		"gwon-100", "gwon-101", "gwol-100", "gwe-100", "gwi-000", "gwi-001", "gwi-100", "gyu-100", "gyu-101", "gyu-102",
		"gyun-000", "gyun-100", "geuk-000", "geuk-100", "geuk-101", "geun-000", "geun-001", "geun-002", "geun-100", "geun-101",
		"geun-102", "geum-000", "geum-001", "geum-002", "geum-100", "geum-101", "geum-102", "geup-000", "geup-001", "geup-002",
		"geup-100", "geung-100", "gi-000", "gi-001", "gi-002", "gi-003", "gi-004", "gi-005", "gi-006", "gi-007",
		"gi-008", "gi-009", "gi-100", "gi-101", "gi-102", "gi-103", "gi-104", "gi-105", "gi-106", "gi-107",
		"gi-108", "gi-109", "gi-110", "gi-111", "gi-112", "gi-113", "gi-114", "gin-100", "gil-000", "na-100",
		"nak-100", "nan-000", "nan-001", "nam-000", "nam-001", "nap-100", "nang-100", "nae-000", "nae-001", "nae-100",
		"nae-101", "nyeo-000", "nyeon-000", "nyeom-000", "nyeong-100", "no-000", "no-100", "no-101", "nong-000", "noe-100",
		"noe-101", "neung-000", "ni-100", "da-000", "da-100", "dan-000", "dan-001", "dan-002", "dan-003", "dan-004",
		"dan-100", "dan-101", "dan-102", "dan-103", "dan-104", "dan-105", "dal-000", "dam-000", "dam-100", "dam-101",
		"dap-000", "dap-100", "dap-101", "dang-000", "dang-001", "dang-100", "dang-101", "dang-102", "dae-000", "dae-001",
		"dae-002", "dae-003", "dae-100", "dae-101", "dae-102", "dae-103", "deok-000", "do-000", "do-001", "do-002",
		"do-003", "do-004", "do-005", "do-006", "do-007", "do-100", "do-101", "do-102", "do-103", "do-104",
		"do-105", "do-106", "do-107", "do-108", "do-109", "do-110", "do-111", "dok-000", "dok-001", "dok-100",
		"dok-101", "dok-102", "don-100", "don-101", "dol-100", "dong-000", "dong-001", "dong-002", "dong-003", "dong-004",
		"dong-005", "dong-100", "dong-101", "du-000", "du-001", "du-002", "dun-100", "dun-101", "deuk-000", "deung-000",
		"deung-001", "deung-002", "deung-100", "ra-100", "rak-000", "rak-001", "rak-100", "ran-000", "ran-100", "ran-101",
		"ran-102", "ram-100", "ram-101", "rang-000", "rang-001", "rang-100", "rae-000", "raeng-000", "ryak-100", "ryak-101",
		"ryang-000", "ryang-001", "ryang-002", "ryang-003", "ryang-100", "ryang-101", "ryang-102", "ryeo-000", "ryeo-100", "ryeo-101",
		"ryeo-102", "ryeok-000", "ryeok-001", "ryeok-100", "ryeon-000", "ryeon-001", "ryeon-100", "ryeon-101", "ryeon-102", "ryeon-103",
		"ryeon-104", "ryeol-000", "ryeol-001", "ryeol-100", "ryeol-101", "ryeom-100", "ryeop-100", "ryeong-000", "ryeong-001", "ryeong-100",
		"ryeong-101", "ryeong-102", "rye-000", "rye-001", "rye-100", "ro-000", "ro-001", "ro-002", "ro-003", "ro-100",
		"rok-000", "rok-100", "rok-101", "rok-102", "ron-000", "rong-100", "roe-100", "roe-101", "ryo-000", "ryo-100",
		"ryo-101", "ryong-100", "ru-100", "ru-101", "ru-102", "ru-103", "ru-104", "ryu-000", "ryu-001", "ryu-002",
		"ryu-100", "ryuk-000", "ryuk-001", "ryun-000", "ryun-100", "ryul-000", "ryul-100", "ryul-101", "ryung-100", "reung-100",
		"ri-000", "ri-001", "ri-002", "ri-003", "ri-100", "ri-101", "ri-102", "ri-103", "ri-104", "rin-100",
		"rim-000", "rim-100", "rip-000", "ma-000", "ma-100", "ma-101", "mak-000", "mak-100", "mak-101", "man-000",
		"man-001", "man-002", "man-100", "man-101", "mal-000", "mang-000", "mang-001", "mang-002", "mang-003", "mang-100",
		"mang-101", "mang-102", "mae-000", "mae-001", "mae-002", "mae-003", "mae-100", "mae-101", "mae-102", "maek-000",
		"maek-100", "maeng-100", "maeng-101", "maeng-102", "maeng-103", "myeon-000", "myeon-001", "myeon-002", "myeon-003", "myeon-100",
		"myeol-100", "myeong-000", "myeong-001", "myeong-002", "myeong-003", "myeong-100", "myeong-101", "mo-000", "mo-001", "mo-002",
		"mo-100", "mo-101", "mo-102", "mo-103", "mo-104", "mo-105", "mo-106", "mo-107", "mok-000", "mok-001",
		"mok-100", "mok-101", "mol-100", "mong-100", "mong-101", "myo-000", "myo-001", "myo-100", "myo-101", "myo-102",
		"mu-000", "mu-001", "mu-002", "mu-003", "mu-004", "mu-005", "mu-100", "mu-101", "muk-000", "muk-100",
		"mun-000", "mun-001", "mun-002", "mun-003", "mul-000", "mul-001", "mi-000", "mi-001", "mi-002", "mi-003",
		"mi-004", "mi-100", "mi-101", "mi-102", "min-000", "min-100", "min-101", "mil-000", "mil-100", "bak-000",
		"bak-100", "bak-101", "bak-102", "bak-103", "bak-104", "ban-000", "ban-001", "ban-002", "ban-100", "ban-101",
		"ban-102", "ban-103", "ban-104", "ban-105", "bal-000", "bal-100", "bal-101", "bang-000", "bang-001", "bang-002",
		"bang-003", "bang-004", "bang-100", "bang-101", "bang-102", "bang-103", "bang-104", "bae-000", "bae-001", "bae-100",
		"bae-101", "bae-102", "bae-103", "bae-104", "bae-105", "baek-000", "baek-001", "baek-100", "beon-000", "beon-100",
		"beon-101", "beon-102", "beol-000", "beol-100", "beom-000", "beom-100", "beom-101", "beop-000", "byeok-100", "byeok-101",
		"byeon-000", "byeon-100", "byeon-101", "byeon-102", "byeol-000", "byeong-000", "byeong-001", "byeong-002", "byeong-100", "byeong-101",
		"bo-000", "bo-001", "bo-002", "bo-100", "bo-101", "bo-102", "bo-103", "bok-000", "bok-001", "bok-002",
		"bok-003", "bok-100", "bok-101", "bok-102", "bok-103", "bon-000", "bong-000", "bong-001", "bong-100", "bong-101",
		"bong-102", "bong-103", "bu-000", "bu-001", "bu-002", "bu-003", "bu-004", "bu-005", "bu-006", "bu-007",
		"bu-100", "bu-101", "bu-102", "bu-103", "bu-104", "bu-105", "bu-106", "bu-107", "bu-108", "bu-109",
		"buk-000", "bun-000", "bun-100", "bun-101", "bun-102", "bun-103", "bun-104", "bun-105", "bul-000", "bul-001",
		"bul-100", "bung-000", "bung-100", "bi-000", "bi-001", "bi-002", "bi-003", "bi-004", "bi-005", "bi-100",
		"bi-101", "bi-102", "bi-103", "bi-104", "bi-105", "bi-106", "bi-107", "bin-000", "bin-100", "bin-101",
		"bing-000", "bing-100", "sa-000", "sa-001", "sa-002", "sa-003", "sa-004", "sa-005", "sa-006", "sa-007",
		"sa-008", "sa-009", "sa-010", "sa-011", "sa-012", "sa-013", "sa-014", "sa-015", "sa-100", "sa-101",
		"sa-102", "sa-103", "sa-104", "sa-105", "sa-106", "sa-107", "sa-108", "sa-109", "sa-110", "sa-111",
		"sa-112", "sa-113", "sa-114", "sa-115", "sak-100", "sak-101", "san-000", "san-001", "san-002", "san-003",
		"sal-000", "sam-000", "sang-000", "sang-001", "sang-002", "sang-003", "sang-004", "sang-005", "sang-006", "sang-007",
		"sang-008", "sang-009", "sang-100", "sang-101", "sang-102", "sang-103", "sang-104", "sang-105", "sang-106", "sang-107",
		"sang-108", "sang-109", "sae-100", "saek-000", "saek-100", "saeng-000", "seo-000", "seo-001", "seo-002", "seo-003",
		"seo-100", "seo-101", "seo-102", "seo-103", "seo-104", "seo-105", "seo-106", "seo-107", "seok-000", "seok-001",
		"seok-002", "seok-003", "seok-004", "seok-100", "seok-101", "seon-000", "seon-001", "seon-002", "seon-003", "seon-004",
		"seon-005", "seon-006", "seon-100", "seon-101", "seon-102", "seol-000", "seol-001", "seol-002", "seol-003", "seop-100",
		"seop-101", "seong-000", "seong-001", "seong-002", "seong-003", "seong-004", "seong-005", "seong-006", "seong-007", "seong-008",
		"seong-009", "se-000", "se-001", "se-002", "se-003", "se-004", "se-005", "so-000", "so-001", "so-002",
		"so-003", "so-004", "so-005", "so-100", "so-101", "so-102", "so-103", "so-104", "so-105", "so-106",
		"so-107", "so-108", "sok-000", "sok-001", "sok-002", "sok-100", "sok-101", "sok-102", "son-000", "son-100",
		"song-000", "song-001", "song-100", "song-101", "song-102", "swae-100", "swae-101", "soe-100", "su-000", "su-001",
		"su-002", "su-003", "su-004", "su-005", "su-006", "su-007", "su-008", "su-009", "su-010", "su-011",
		"su-012", "su-013", "su-014", "su-015", "su-100", "su-101", "su-102", "su-103", "su-104", "su-105",
		"su-106", "su-107", "su-108", "su-109", "su-110", "suk-000", "suk-001", "suk-002", "suk-100", "suk-101",
		"suk-102", "sun-000", "sun-001", "sun-100", "sun-101", "sun-102", "sun-103", "sun-104", "sun-105", "sul-000",
		"sul-100", "sul-101", "sung-000", "seup-000", "seup-001", "seup-100", "seup-101", "seung-000", "seung-001", "seung-002",
	} {
		matches := g.FindCharacters(id)
		if len(matches) != 1 || len(matches[0].Words) < 5 {
			t.Errorf("%s needs at least five connected words: %+v", id, matches)
		}
	}
	for query, forms := range map[string][]string{
		"가경": {"佳景", "佳境"}, "가정": {"家庭", "假定"}, "가설": {"假設", "架設"},
		"고가": {"高架", "高價"}, "국가": {"國歌", "國家"}, "시각": {"時刻", "視覺"}, "각하": {"却下", "閣下"},
		"간사": {"姦邪", "幹事"},
		"감사": {"感謝", "監査"}, "감정": {"感情", "鑑定"}, "강건": {"剛健", "康健"},
		"강요": {"強要", "綱要"}, "검사": {"劍士", "檢査"}, "경신": {"更新", "庚申"},
		"경향": {"京鄕", "傾向"}, "경사": {"慶事", "傾斜"}, "공경": {"恭敬", "公卿"}, "경로": {"敬老", "徑路"},
		"경도": {"傾倒", "硬度"}, "경계": {"境界", "警戒"}, "구경": {"九卿", "口徑", "究竟"}, "계간": {"季刊", "溪澗"},
		"계수": {"溪水", "係數"}, "계류": {"溪流", "繫留"}, "계승": {"繼承", "階乘"},
		"고전": {"古典", "苦戰"}, "사고": {"事故", "思考"},
		"가공": {"架空", "加工"},
		"과실": {"果實", "過失"}, "과장": {"課長", "誇張"},
		"관리": {"官吏", "管理"}, "관용": {"寬容", "慣用"},
		"괴수": {"怪獸", "愧羞"}, "교정": {"校庭", "校正", "矯正"}, "교외": {"校外", "郊外"},
		"구조": {"救助", "構造"}, "구명": {"救命", "究明"}, "구형": {"舊型", "球形"},
		"구생": {"俱生", "苟生"}, "구기": {"俱起", "球技"}, "기구": {"器具", "機構"},
		"문구": {"文句", "文具"}, "지구": {"地區", "地球"}, "경구": {"警句", "驚懼"},
		"규정": {"糾正", "規定"},
		"극단": {"極端", "劇團"}, "근면": {"勤勉", "僅免"}, "금수": {"禽獸", "錦繡"},
		"기간": {"基幹", "其間", "期間"}, "시기": {"時期", "猜忌"},
		"경기": {"競技", "京畿"}, "기도": {"企圖", "祈禱"}, "기원": {"起源", "祈願", "紀元"},
		"기한": {"期限", "飢寒"}, "기사": {"記事", "騎士", "己巳"}, "기수": {"旗手", "騎手", "旣遂"}, "나락": {"那落", "奈落"},
		"단서": {"但書", "端緖"},
		"강단": {"剛斷", "講壇"}, "단정": {"端正", "斷定"}, "단기": {"短期", "檀紀"},
		"지도": {"地圖", "指導"}, "도장": {"圖章", "塗裝"}, "교도": {"矯導", "敎徒"},
		"수도": {"首都", "水稻"}, "전도": {"顚倒", "前途"}, "독자": {"獨自", "讀者"},
		"동지": {"冬至", "同志"}, "공동": {"共同", "空洞"},
		"동시": {"同時", "童詩"}, "동상": {"凍傷", "銅像"}, "단락": {"段落", "短絡"}, "산란": {"産卵", "散亂"},
		"화랑": {"花郞", "畫廊"},
		"장려": {"奬勵", "壯麗"}, "고려": {"考慮", "高麗"}, "연대": {"連帶", "聯隊"},
		"관례": {"冠禮", "慣例"}, "노력": {"努力", "勞力"},
		"누대": {"屢代", "樓臺"},
		"이화": {"李花", "梨花"}, "향리": {"鄕里", "鄕吏"},
		"매점": {"買占", "賣店"}, "매장": {"埋藏", "埋葬"},
		"비명": {"悲鳴", "碑銘"},
		"경모": {"輕侮", "敬慕"}, "공모": {"公募", "共謀"}, "모의": {"模擬", "謀議"},
		"모년": {"暮年", "某年"}, "기묘": {"己卯", "奇妙"}, "종묘": {"宗廟", "種苗"},
		"무술": {"戊戌", "武術"}, "전문": {"傳聞", "專門"},
		"백미": {"白米", "白眉"}, "반주": {"飯酒", "伴奏"},
		"반려": {"伴侶", "返戾"}, "공방": {"攻防", "工房"}, "방향": {"方向", "芳香"},
		"예방": {"禮訪", "豫防"}, "이방": {"吏房", "異邦"},
		"배출": {"排出", "輩出"}, "배수": {"倍數", "排水"}, "범인": {"凡人", "犯人"},
		"병자": {"丙子", "病者"}, "보도": {"報道", "步道"}, "보고": {"報告", "寶庫"},
		"보급": {"普及", "補給"}, "기복": {"祈福", "起伏"},
		"부자": {"富者", "父子"}, "부유": {"富裕", "浮游"},
		"명부": {"冥府", "名簿"},
		"시비": {"是非", "侍婢"}, "비상": {"非常", "飛上"},
		"사관": {"仕官", "史官"},
		"고사": {"枯死", "古寺"},
		"교사": {"敎師", "校舍"},
		"농사": {"農事", "農舍"},
		"사례": {"事例", "謝禮"},
		"상사": {"相似", "上司"},
		"사양": {"斜陽", "辭讓"},
		"조사": {"調査", "弔辭"},
		"사금": {"沙金", "賜金"},
		"사장": {"沙場", "社長"},
		"봉사": {"奉仕", "奉祀"},
		"사회": {"司會", "社會"},
		"사원": {"寺院", "社員"},
		"대사": {"大使", "大蛇"},
		"사심": {"私心", "邪心"},
		"사기": {"詐欺", "邪氣"},
		"부상": {"浮上", "負傷"},
		"상실": {"喪失", "桑實"},
		"상가": {"商街", "喪家"},
		"초상": {"初霜", "肖像"},
		"서열": {"序列", "暑熱"},
		"서정": {"庶政", "敍情"},
		"해석": {"解析", "解釋"},
		"보석": {"寶石", "保釋"},
		"신선": {"神仙", "新鮮"},
		"선행": {"先行", "善行"},
		"개선": {"改善", "凱旋"},
		"고소": {"苦笑", "告訴"},
		"소명": {"召命", "昭明"},
		"소소": {"昭昭", "昭蘇"},
		"소원": {"疏遠", "訴願"},
		"상소": {"上疏", "上訴"},
		"준수": {"遵守", "俊秀"},
		"우수": {"憂愁", "優秀"},
		"수색": {"搜索", "愁色"},
		"필수": {"必須", "必需"},
		"수요": {"須要", "需要"},
		"수훈": {"垂訓", "殊勳"},
		"장수": {"長壽", "將帥"},
		"수련": {"修鍊", "睡蓮"},
		"수행": {"遂行", "隨行"},
		"수반": {"首班", "隨伴"},
		"수급": {"受給", "需給"},
		"군수": {"郡守", "軍需"},
		"정숙": {"貞淑", "靜肅"},
		"기술": {"技術", "記述"},
		"습득": {"拾得", "習得"},
		"전승": {"全勝", "傳承"},
		"문단": {"文壇", "文段"}, "농담": {"弄談", "濃淡"}, "정당": {"正當", "政黨"}, "당대": {"唐代", "當代"},
	} {
		found := map[string]bool{}
		for _, result := range g.FindWords(query) {
			found[result.Word.Hanja] = true
		}
		for _, form := range forms {
			if !found[form] {
				t.Errorf("missing homograph %s (%s)", query, form)
			}
		}
	}
	contribution := g.FindWords("공헌")
	if len(contribution) != 1 || contribution[0].Word.Hanja != "貢獻" {
		t.Fatalf("공헌 needs its modern 貢獻 spelling: %+v", contribution)
	}
	if len(g.FindWords("功獻")) != 0 {
		t.Fatal("superseded spelling of 공헌 must not remain as a separate word")
	}
	gray := g.FindCharacters("灰")
	if len(gray) != 1 || gray[0].ID != "hoe-200" || gray[0].SoundKo != "회" {
		t.Fatalf("incorrect 灰 reading: %+v", gray)
	}
	if len(g.FindCharacters("hui-200")) != 0 {
		t.Fatal("obsolete incorrect reading ID still resolves")
	}
	carve := g.FindWords("조각")
	if len(carve) == 0 || carve[0].Components[0].Readings[0].SoundKo != "조" {
		t.Fatal("missing 彫 reading for 조각")
	}
	repeated := g.FindWords("각각")
	if len(repeated) != 1 || len(repeated[0].Components) != 2 {
		t.Fatal("각각 must retain both characters")
	}
	count := 0
	for _, word := range g.FindCharacters("各")[0].Words {
		if word.Word == "각각" {
			count++
		}
	}
	if count != 1 {
		t.Fatal("repeated character must have exactly one reverse edge")
	}
	all := g.FindWords("일체개고")
	if len(all) != 1 || len(all[0].Components) != 4 || all[0].Components[1].Hanja != "切" {
		t.Fatalf("incorrect 일체개고 breakdown: %+v", all)
	}
	cutReadings := map[string]string{}
	for _, reading := range all[0].Components[1].Readings {
		cutReadings[reading.ID] = reading.SoundKo
	}
	if len(cutReadings) != 2 || cutReadings["jeol-100"] != "절" || cutReadings["che-200"] != "체" {
		t.Fatalf("missing contextual 切 reading: %+v", cutReadings)
	}
	if !strings.Contains(all[0].Word.SemanticHint, "切[체]") {
		t.Fatal("일체개고 must explain the 체 reading")
	}
}

func TestRepositoryHintReadings(t *testing.T) {
	g, err := Load(filepath.Join("..", "..", "..", "dataset"))
	if err != nil {
		t.Fatal(err)
	}
	annotation := regexp.MustCompile(`^\[([가-힣]+)\]`)
	for _, word := range g.words {
		for offset, glyph := range word.SemanticHint {
			if !unicode.Is(unicode.Han, glyph) {
				continue
			}
			match := annotation.FindStringSubmatch(word.SemanticHint[offset+len(string(glyph)):])
			if match == nil {
				t.Errorf("%s (%s): hint needs a reading immediately after %c", word.Word, word.Hanja, glyph)
				continue
			}
			readings := g.FindCharacters(string(glyph))
			// Hints may compare spellings whose characters are outside the current collection.
			if len(readings) == 0 {
				continue
			}
			found := false
			for _, reading := range readings {
				if reading.SoundKo == match[1] {
					found = true
				}
			}
			if !found {
				t.Errorf("%s (%s): unregistered hint reading %c[%s]", word.Word, word.Hanja, glyph, match[1])
			}
		}
	}
}

func TestRepositoryAlternateReading(t *testing.T) {
	g, err := Load(filepath.Join("..", "..", "..", "dataset"))
	if err != nil {
		t.Fatal(err)
	}
	wantReadings := map[string]string{"gang-003": "강", "hang-200": "항"}
	readings := g.FindCharacters("降")
	if len(readings) != len(wantReadings) {
		t.Fatalf("降 must retain both readings: %+v", readings)
	}
	for id, sound := range wantReadings {
		matches := g.FindCharacters(id)
		if len(matches) != 1 || matches[0].Hanja != "降" || matches[0].SoundKo != sound {
			t.Fatalf("incorrect reading for %s: %+v", id, matches)
		}
		// Reading IDs share glyph edges, including words that use the other sound.
		found := map[string]bool{}
		for _, word := range matches[0].Words {
			found[word.Hanja] = true
		}
		if !found["降水"] || !found["降伏"] {
			t.Errorf("%s lost shared glyph connections: %+v", id, found)
		}
	}
	for query, annotation := range map[string]string{"강수": "降[강]", "항복": "降[항]"} {
		words := g.FindWords(query)
		if len(words) != 1 || len(words[0].Components) != 2 || words[0].Components[0].Hanja != "降" {
			t.Fatalf("incorrect breakdown of %s: %+v", query, words)
		}
		candidates := words[0].Components[0].Readings
		if len(candidates) != len(wantReadings) {
			t.Fatalf("%s lost reading candidates: %+v", query, candidates)
		}
		for _, candidate := range candidates {
			if wantReadings[candidate.ID] != candidate.SoundKo {
				t.Errorf("unexpected reading for %s: %+v", query, candidate)
			}
		}
		if !strings.Contains(words[0].Word.SemanticHint, annotation) {
			t.Errorf("%s needs its contextual reading %s in the hint", query, annotation)
		}
	}
}

func TestRepositoryContextualReadings(t *testing.T) {
	g, err := Load(filepath.Join("..", "..", "..", "dataset"))
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		glyph    string
		readings map[string]string
		words    map[string]string
	}{
		{"更", map[string]string{"gaeng-000": "갱", "gyeong-200": "경"}, map[string]string{"갱신": "更[갱]", "경신": "更[경]"}},
		{"車", map[string]string{"geo-004": "거", "cha-200": "차"}, map[string]string{"거마": "車[거]", "자동차": "車[차]"}},
		{"率", map[string]string{"ryul-101": "률", "sol-200": "솔", "yul-202": "율"}, map[string]string{"경솔": "率[솔]", "통솔": "率[솔]", "확률": "率[률]", "비율": "率[율]", "보급률": "率[률]"}},
		{"不", map[string]string{"bul-000": "불", "bu-201": "부"}, map[string]string{"중과부적": "不[부]"}},
		{"令", map[string]string{"ryeong-000": "령", "yeong-200": "영"}, map[string]string{"교언영색": "令[영]"}},
		{"龜", map[string]string{"gu-111": "구", "gwi-200": "귀", "gyun-200": "균"}, map[string]string{"구미": "龜[구]", "귀감": "龜[귀]", "균열": "龜[균]"}},
		{"裂", map[string]string{"ryeol-101": "렬", "yeol-200": "열"}, map[string]string{"균열": "裂[열]", "분열": "裂[열]", "결렬": "裂[렬]", "열상": "裂[열]"}},
		{"茶", map[string]string{"da-100": "다", "cha-201": "차"}, map[string]string{"국화차": "茶[차]", "다도": "茶[다]"}},
		{"陸", map[string]string{"ryuk-001": "륙", "yuk-200": "육"}, map[string]string{"육군": "陸[육]", "육도": "陸[육]"}},
		{"旅", map[string]string{"ryeo-000": "려", "yeo-200": "여"}, map[string]string{"여권": "旅[여]", "여행": "旅[여]", "여정": "旅[여]"}},
		{"利", map[string]string{"ri-000": "리", "i-200": "이"}, map[string]string{"이기": "利[이]", "이익": "利[이]", "이해관계": "利[이]"}},
		{"樂", map[string]string{"rak-000": "락", "ak-201": "악", "nak-200": "낙"}, map[string]string{"악기": "樂[악]", "오락": "樂[락]", "낙원": "樂[낙]", "낙관": "樂[낙]", "악보": "樂[악]"}},
		{"豈", map[string]string{"gi-112": "기", "gae-200": "개"}, map[string]string{"개제": "豈[개]", "기유차리": "豈[기]"}},
		{"諾", map[string]string{"nak-100": "낙", "rak-200": "락"}, map[string]string{"승낙": "諾[낙]", "허락": "諾[락]", "수락": "諾[락]"}},
		{"易", map[string]string{"yeok-001": "역", "i-201": "이"}, map[string]string{"난이도": "易[이]"}},
		{"娘", map[string]string{"nang-100": "낭", "rang-201": "랑"}, map[string]string{"낭자": "娘[낭]", "영랑": "娘[랑]", "낭랑": "娘[랑]"}},
		{"奈", map[string]string{"nae-100": "내", "na-200": "나"}, map[string]string{"막무가내": "奈[내]", "나락": "奈[나]"}},
		{"女", map[string]string{"nyeo-000": "녀", "yeo-201": "여"}, map[string]string{"자녀": "女[녀]", "여자": "女[여]"}},
		{"年", map[string]string{"nyeon-000": "년", "yeon-200": "연"}, map[string]string{"학년": "年[년]", "연도": "年[연]", "연말": "年[연]", "매년": "年[년]", "백년": "年[년]", "연배": "年[연]", "연보": "年[연]"}},
		{"寧", map[string]string{"nyeong-100": "녕", "yeong-201": "영"}, map[string]string{"안녕": "寧[녕]", "영일": "寧[영]"}},
		{"怒", map[string]string{"no-000": "노", "ro-200": "로"}, map[string]string{"분노": "怒[노]", "희로애락": "怒[로]"}},
		{"殺", map[string]string{"sal-000": "살", "swae-200": "쇄"}, map[string]string{"뇌쇄": "殺[쇄]", "뇌쇄적": "殺[쇄]", "쇄도": "殺[쇄]"}},
		{"泥", map[string]string{"ni-100": "니", "i-202": "이"}, map[string]string{"오니": "泥[니]", "이토": "泥[이]"}},
		{"綠", map[string]string{"rok-000": "록", "nok-200": "녹"}, map[string]string{"녹차": "綠[녹]"}},
		{"弄", map[string]string{"rong-100": "롱", "nong-200": "농"}, map[string]string{"농담": "弄[농]"}},
		{"冷", map[string]string{"raeng-000": "랭", "naeng-200": "냉"}, map[string]string{"냉담": "冷[냉]"}},
		{"糖", map[string]string{"dang-101": "당", "tang-200": "탕"}, map[string]string{"설탕": "糖[탕]", "사탕": "糖[탕]", "당분": "糖[당]"}},
		{"連", map[string]string{"ryeon-001": "련", "yeon-201": "연"}, map[string]string{"연대": "連[연]", "연락": "連[연]", "연봉": "連[연]"}},
		{"列", map[string]string{"ryeol-000": "렬", "yeol-201": "열"}, map[string]string{"열도": "列[열]", "배열": "列[열]", "병렬": "列[렬]"}},
		{"狀", map[string]string{"sang-105": "상", "jang-201": "장"}, map[string]string{"도전장": "狀[장]", "독촉장": "狀[장]"}},
		{"朗", map[string]string{"rang-200": "랑", "nang-200": "낭"}, map[string]string{"낭독": "朗[낭]"}},
		{"洞", map[string]string{"dong-004": "동", "tong-200": "통"}, map[string]string{"동굴": "洞[동]", "통찰": "洞[통]"}},
		{"漏", map[string]string{"ru-103": "루", "nu-200": "누"}, map[string]string{"누두": "漏[누]"}},
		{"羅", map[string]string{"ra-100": "라", "na-201": "나"}, map[string]string{"나열": "羅[나]", "망라": "羅[라]"}},
		{"落", map[string]string{"rak-001": "락", "nak-201": "낙"}, map[string]string{"낙하": "落[낙]", "하락": "落[락]", "붕락": "落[락]"}},
		{"卵", map[string]string{"ran-000": "란", "nan-200": "난"}, map[string]string{"산란": "卵[란]", "난자": "卵[난]"}},
		{"亂", map[string]string{"ran-100": "란", "nan-201": "난"}, map[string]string{"혼란": "亂[란]", "난리": "亂[난]", "분란": "亂[란]"}},
		{"欄", map[string]string{"ran-101": "란", "nan-202": "난"}, map[string]string{"공란": "欄[란]", "난간": "欄[난]"}},
		{"蘭", map[string]string{"ran-102": "란", "nan-203": "난"}, map[string]string{"난초": "蘭[난]", "춘란": "蘭[란]"}},
		{"濫", map[string]string{"ram-100": "람", "nam-200": "남"}, map[string]string{"남용": "濫[남]", "범람": "濫[람]"}},
		{"浪", map[string]string{"rang-000": "랑", "nang-201": "낭"}, map[string]string{"낭비": "浪[낭]", "풍랑": "浪[랑]"}},
		{"郞", map[string]string{"rang-001": "랑", "nang-202": "낭"}, map[string]string{"낭군": "郞[낭]", "신랑": "郞[랑]"}},
		{"廊", map[string]string{"rang-100": "랑", "nang-203": "낭"}, map[string]string{"낭하": "廊[낭]", "회랑": "廊[랑]"}},
		{"來", map[string]string{"rae-000": "래", "nae-200": "내"}, map[string]string{"내일": "來[내]", "미래": "來[래]", "내빈": "來[내]"}},
		{"掠", map[string]string{"ryak-100": "략", "yak-200": "약"}, map[string]string{"약탈": "掠[약]", "노략": "掠[략]"}},
		{"省", map[string]string{"seong-006": "성", "saeng-200": "생"}, map[string]string{"생략": "省[생]"}},
		{"略", map[string]string{"ryak-101": "략", "yak-201": "약"}, map[string]string{"약도": "略[약]", "생략": "略[략]"}},
		{"兩", map[string]string{"ryang-000": "량", "yang-200": "양"}, map[string]string{"양국": "兩[양]", "양분": "兩[양]"}},
		{"涼", map[string]string{"ryang-001": "량", "yang-201": "양"}, map[string]string{"양풍": "涼[양]", "청량감": "涼[량]"}},
		{"良", map[string]string{"ryang-002": "량", "yang-202": "양"}, map[string]string{"양호": "良[양]", "선량": "良[량]"}},
		{"梁", map[string]string{"ryang-100": "량", "yang-203": "양"}, map[string]string{"양목": "梁[양]", "동량": "梁[량]"}},
		{"糧", map[string]string{"ryang-101": "량", "yang-204": "양"}, map[string]string{"양식": "糧[양]", "식량": "糧[량]"}},
		{"諒", map[string]string{"ryang-102": "량", "yang-205": "양"}, map[string]string{"양해": "諒[양]", "해량": "諒[량]"}},
		{"念", map[string]string{"nyeom-000": "념", "yeom-200": "염"}, map[string]string{"염려": "念[염]", "염불": "念[염]", "기념비": "念[념]"}},
		{"歷", map[string]string{"ryeok-001": "력", "yeok-200": "역"}, map[string]string{"역사": "歷[역]", "경력": "歷[력]"}},
		{"履", map[string]string{"ri-101": "리", "i-203": "이"}, map[string]string{"이력": "履[이]", "이행": "履[이]", "여리박빙": "履[리]"}},
		{"曆", map[string]string{"ryeok-100": "력", "yeok-201": "역"}, map[string]string{"역법": "曆[역]", "양력": "曆[력]"}},
		{"練", map[string]string{"ryeon-000": "련", "yeon-202": "연"}, map[string]string{"연습": "練[연]", "훈련": "練[련]"}},
		{"憐", map[string]string{"ryeon-100": "련", "yeon-203": "연"}, map[string]string{"연민": "憐[연]", "가련": "憐[련]"}},
		{"戀", map[string]string{"ryeon-101": "련", "yeon-204": "연"}, map[string]string{"연애": "戀[연]", "실연": "戀[연]"}},
		{"聯", map[string]string{"ryeon-102": "련", "yeon-205": "연"}, map[string]string{"연합": "聯[연]", "연대": "聯[연]"}},
		{"蓮", map[string]string{"ryeon-103": "련", "yeon-206": "연"}, map[string]string{"연근": "蓮[연]", "홍련": "蓮[련]"}},
		{"鍊", map[string]string{"ryeon-104": "련", "yeon-207": "연"}, map[string]string{"연마": "鍊[연]", "단련": "鍊[련]"}},
		{"劣", map[string]string{"ryeol-100": "렬", "yeol-202": "열"}, map[string]string{"열등": "劣[열]", "우열": "劣[열]"}},
		{"廉", map[string]string{"ryeom-100": "렴", "yeom-201": "염"}, map[string]string{"염가": "廉[염]", "저렴": "廉[렴]"}},
		{"獵", map[string]string{"ryeop-100": "렵", "yeop-200": "엽"}, map[string]string{"엽총": "獵[엽]", "수렵": "獵[렵]"}},
		{"領", map[string]string{"ryeong-001": "령", "yeong-202": "영"}, map[string]string{"영수증": "領[영]", "대통령": "領[령]"}},
		{"嶺", map[string]string{"ryeong-100": "령", "yeong-203": "영"}, map[string]string{"영동": "嶺[영]", "분수령": "嶺[령]"}},
		{"零", map[string]string{"ryeong-101": "령", "yeong-204": "영"}, map[string]string{"영점": "零[영]", "영세": "零[영]"}},
		{"靈", map[string]string{"ryeong-102": "령", "yeong-205": "영"}, map[string]string{"영혼": "靈[영]", "영령": "靈[령]"}},
		{"例", map[string]string{"rye-000": "례", "ye-201": "예"}, map[string]string{"예외": "例[예]", "관례": "例[례]", "범례": "例[례]"}},
		{"禮", map[string]string{"rye-001": "례", "ye-202": "예"}, map[string]string{"예절": "禮[예]", "실례": "禮[례]"}},
		{"隷", map[string]string{"rye-100": "례", "ye-203": "예"}, map[string]string{"예속": "隷[예]", "예서": "隷[예]"}},
		{"勞", map[string]string{"ro-000": "로", "no-201": "노"}, map[string]string{"노동": "勞[노]", "근로": "勞[로]"}},
		{"老", map[string]string{"ro-001": "로", "no-202": "노"}, map[string]string{"노인": "老[노]", "장로": "老[로]"}},
		{"路", map[string]string{"ro-002": "로", "no-203": "노"}, map[string]string{"가로등": "路[로]"}},
		{"露", map[string]string{"ro-003": "로", "no-204": "노"}, map[string]string{"노출": "露[노]", "백로": "露[로]"}},
		{"祿", map[string]string{"rok-100": "록", "nok-201": "녹"}, map[string]string{"녹봉": "祿[녹]", "국록": "祿[록]"}},
		{"鹿", map[string]string{"rok-102": "록", "nok-202": "녹"}, map[string]string{"녹용": "鹿[녹]", "지록위마": "鹿[록]"}},
		{"錄", map[string]string{"rok-101": "록", "nok-203": "녹"}, map[string]string{"목록": "錄[록]", "부록": "錄[록]"}},
		{"論", map[string]string{"ron-000": "론", "non-200": "논"}, map[string]string{"논리": "論[논]", "토론": "論[론]"}},
		{"雷", map[string]string{"roe-101": "뢰", "noe-200": "뇌"}, map[string]string{"뇌우": "雷[뇌]", "낙뢰": "雷[뢰]"}},
		{"料", map[string]string{"ryo-000": "료", "yo-201": "요"}, map[string]string{"요금": "料[요]", "재료": "料[료]", "비료": "料[료]"}},
		{"龍", map[string]string{"ryong-100": "룡", "yong-202": "용"}, map[string]string{"용궁": "龍[용]", "등용문": "龍[용]", "청룡": "龍[룡]", "용봉": "龍[용]"}},
		{"屢", map[string]string{"ru-100": "루", "nu-201": "누"}, map[string]string{"누차": "屢[누]", "누누": "屢[누]"}},
		{"樓", map[string]string{"ru-101": "루", "nu-202": "누"}, map[string]string{"누정": "樓[누]", "망루": "樓[루]"}},
		{"淚", map[string]string{"ru-102": "루", "nu-203": "누"}, map[string]string{"누선": "淚[누]", "낙루": "淚[루]"}},
		{"累", map[string]string{"ru-104": "루", "nu-204": "누"}, map[string]string{"누적": "累[누]", "연루": "累[루]"}},
		{"柳", map[string]string{"ryu-000": "류", "yu-201": "유"}, map[string]string{"유암화명": "柳[유]", "양류": "柳[류]"}},
		{"留", map[string]string{"ryu-002": "류", "yu-202": "유"}, map[string]string{"유학": "留[유]", "계류": "留[류]"}},
		{"六", map[string]string{"ryuk-000": "륙", "yuk-201": "육"}, map[string]string{"육하원칙": "六[육]", "육각": "六[육]"}},
		{"倫", map[string]string{"ryun-000": "륜", "yun-200": "윤"}, map[string]string{"윤리": "倫[윤]", "인륜": "倫[륜]"}},
		{"輪", map[string]string{"ryun-100": "륜", "yun-201": "윤"}, map[string]string{"윤곽": "輪[윤]", "연륜": "輪[륜]"}},
		{"律", map[string]string{"ryul-000": "률", "yul-200": "율"}, map[string]string{"계율": "律[율]", "법률": "律[률]", "운율": "律[율]"}},
		{"栗", map[string]string{"ryul-100": "률", "yul-201": "율"}, map[string]string{"율란": "栗[율]", "생률": "栗[률]", "건율": "栗[율]"}},
		{"隆", map[string]string{"ryung-100": "륭", "yung-200": "융"}, map[string]string{"융성": "隆[융]", "흥륭": "隆[륭]"}},
		{"李", map[string]string{"ri-001": "리", "i-204": "이"}, map[string]string{"이씨": "李[이]", "도리": "李[리]"}},
		{"里", map[string]string{"ri-003": "리", "i-205": "이"}, map[string]string{"이장": "里[이]", "천리": "里[리]"}},
		{"吏", map[string]string{"ri-100": "리", "i-206": "이"}, map[string]string{"이방": "吏[이]", "서리": "吏[리]"}},
		{"梨", map[string]string{"ri-102": "리", "i-207": "이"}, map[string]string{"이화주": "梨[이]", "이즙": "梨[이]"}},
		{"裏", map[string]string{"ri-103": "리", "i-208": "이"}, map[string]string{"이면": "裏[이]", "표리": "裏[리]"}},
		{"鄰", map[string]string{"rin-100": "린", "in-200": "인"}, map[string]string{"인접": "鄰[인]", "근린": "鄰[린]"}},
		{"林", map[string]string{"rim-000": "림", "im-200": "임"}, map[string]string{"임업": "林[임]", "삼림": "林[림]"}},
		{"臨", map[string]string{"rim-100": "림", "im-201": "임"}, map[string]string{"임박": "臨[임]", "군림": "臨[림]"}},
		{"爛", map[string]string{"ran-200": "란", "nan-204": "난"}, map[string]string{"천진난만": "爛[난]"}},
		{"誓", map[string]string{"seo-106": "서", "se-200": "세"}, map[string]string{"맹세": "誓[세]"}},
		{"陵", map[string]string{"reung-100": "릉", "neung-200": "능"}, map[string]string{"능묘": "陵[능]", "왕릉": "陵[릉]"}},
		{"理", map[string]string{"ri-002": "리", "i-209": "이"}, map[string]string{"이발": "理[이]", "논리": "理[리]"}},
		{"怯", map[string]string{"geop-200": "겁"}, map[string]string{"비겁": "怯[겁]"}},
	} {
		t.Run(tc.glyph, func(t *testing.T) {
			if matches := g.FindCharacters(tc.glyph); len(matches) != len(tc.readings) {
				t.Fatalf("missing readings: %+v", matches)
			}
			for id, sound := range tc.readings {
				matches := g.FindCharacters(id)
				if len(matches) != 1 || matches[0].Hanja != tc.glyph || matches[0].SoundKo != sound {
					t.Fatalf("incorrect reading for %s: %+v", id, matches)
				}
				found := map[string]bool{}
				for _, word := range matches[0].Words {
					found[word.Word] = true
				}
				for word := range tc.words {
					if !found[word] {
						t.Errorf("%s lost shared word %s", id, word)
					}
				}
			}
			for query, annotation := range tc.words {
				var words []WordResult
				for _, match := range g.FindWords(query) {
					if strings.Contains(match.Word.Hanja, tc.glyph) {
						words = append(words, match)
					}
				}
				if len(words) != 1 || !strings.Contains(words[0].Word.SemanticHint, annotation) {
					t.Fatalf("%s needs contextual reading %s: %+v", query, annotation, words)
				}
				found := map[string]string{}
				for _, part := range words[0].Components {
					if part.Hanja == tc.glyph {
						for _, reading := range part.Readings {
							found[reading.ID] = reading.SoundKo
						}
					}
				}
				if len(found) != len(tc.readings) {
					t.Fatalf("%s lost component readings: %+v", query, found)
				}
				for id, sound := range tc.readings {
					if found[id] != sound {
						t.Errorf("%s has incorrect reading %s: %+v", query, id, found)
					}
				}
			}
		})
	}
	words := g.FindWords("更新")
	if len(words) != 2 || words[0].Word.Word != "갱신" || words[1].Word.Word != "경신" {
		t.Fatalf("shared Hanja spelling must retain both words: %+v", words)
	}
	found := map[string]int{}
	for _, word := range g.Neighborhood("更新").Words {
		if word.Hanja == "更新" {
			found[word.Word]++
		}
	}
	if found["갱신"] != 1 || found["경신"] != 1 {
		t.Fatalf("neighborhood lost or duplicated shared spelling: %+v", found)
	}
	pleading := g.FindWords("애걸복걸")
	if len(pleading) != 1 || len(pleading[0].Components) != 4 || pleading[0].Components[1].Hanja != "乞" || pleading[0].Components[3].Hanja != "乞" {
		t.Fatalf("repeated component positions were lost: %+v", pleading)
	}
	count := 0
	for _, word := range g.FindCharacters("乞")[0].Words {
		if word.Word == "애걸복걸" {
			count++
		}
	}
	if count != 1 {
		t.Fatalf("애걸복걸 needs exactly one reverse edge per glyph, got %d", count)
	}
}
