package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
)

func main() {
	characters, err := loadCharacters("data\\character.jsonl")
	if err != nil {
		panic(err)
	}

	fmt.Printf("Read %d characters\n", len(characters))
}

type Character struct {
	Type      string   `json:"type"`
	ID        string   `json:"id"`
	Hanja     string   `json:"hanja"`
	MeaningKo []string `json:"meaning_ko"`
	MeaningEn []string `json:"meaning_en"`
}

func loadCharacters(filename string) ([]Character, error) {
	fs, err := os.Open(filename)
	if err != nil {
		return nil, err
	}
	defer fs.Close()

	var chars []Character
	scanner := bufio.NewScanner(fs)
	for scanner.Scan() {
		line := scanner.Text()
		char, err := parseJSONLine(line)
		if err != nil {
			return nil, err
		}
		chars = append(chars, char)
	}

	if err := scanner.Err(); err != nil {
		return nil, err
	}

	return chars, nil
}

func parseJSONLine(line string) (Character, error) {
	var word Character
	err := json.Unmarshal([]byte(line), &word)
	return word, err
}
