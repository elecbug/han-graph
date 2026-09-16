package webapp

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPracticeRejectsHomonymousOptions(t *testing.T) {
	g, practice, _ := testApp(t)
	// Both entries are valid and distinct in the dictionary. A quiz must still
	// reject them together because learners choose by the Korean word alone.
	practice.Questions[0].Options = []WordRef{{"흡연", "吸煙"}, {"흡연", "恰然"}}
	practice.Questions[0].Answer = practice.Questions[0].Options[0]
	data, err := json.Marshal(practice)
	if err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(t.TempDir(), "practice.json")
	if err := os.WriteFile(file, data, 0600); err != nil {
		t.Fatal(err)
	}
	_, err = LoadPractice(file, g)
	if err == nil || !strings.Contains(err.Error(), "homonyms are not allowed") || !strings.Contains(err.Error(), practice.Questions[0].ID) {
		t.Fatalf("expected the question's duplicate Korean label to be rejected, got %v", err)
	}
}
