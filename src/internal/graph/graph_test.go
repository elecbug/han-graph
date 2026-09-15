package graph

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
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
		"강요": {"強要", "綱要"}, "검사": {"劍士", "檢査"},
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

func TestRepositoryRenewalAndVehicleReadings(t *testing.T) {
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
				words := g.FindWords(query)
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
