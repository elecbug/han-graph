package graph

import "testing"

func TestRandomWord(t *testing.T) {
	var empty Graph
	if _, ok := empty.RandomWord("", ""); ok {
		t.Fatal("empty graph returned a word")
	}
	first := Word{Word: "분수", Hanja: "分數"}
	second := Word{Word: "분수", Hanja: "噴水"}
	g := Graph{words: []Word{first}, wordsByQuery: map[string][]int{"분수": {0}}}
	if word, ok := g.RandomWord(first.Word, first.Hanja); !ok || word.Hanja != first.Hanja {
		t.Fatal("a single word must remain selectable")
	}
	g.words = append(g.words, second)
	g.wordsByQuery["분수"] = []int{0, 1}
	for _, excluded := range g.words {
		for range 20 {
			word, ok := g.RandomWord(excluded.Word, excluded.Hanja)
			if !ok || word.Word != "분수" || word.Hanja == excluded.Hanja {
				t.Fatalf("exact exclusion lost the other homograph: %+v", word)
			}
		}
	}
	for _, exclusion := range []Word{{}, {Word: "분수"}, {Word: "missing", Hanja: "分數"}} {
		word, ok := g.RandomWord(exclusion.Word, exclusion.Hanja)
		if !ok || (word.Hanja != first.Hanja && word.Hanja != second.Hanja) {
			t.Fatalf("unknown or incomplete exclusion returned an invalid word: %+v", word)
		}
	}
}
