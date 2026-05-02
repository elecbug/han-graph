package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path"
)

func main() {
	meta, err := loadMeta(path.Join("data", "meta.jsonl"))
	if err != nil {
		panic(err)
	}

	characters, err := loadCharacters(path.Join("data", "character.jsonl"))
	if err != nil {
		panic(err)
	}

	fmt.Printf("Read %d meta entries\n", len(meta))
	fmt.Printf("Read %d character entries\n", len(characters))
}

type Character struct {
	Type      string   `json:"type"`
	ID        string   `json:"id"`
	Hanja     string   `json:"hanja"`
	MeaningKo []string `json:"meaning_ko"`
	MeaningEn []string `json:"meaning_en"`
}

type Meta struct {
	Type    string `json:"type"`
	ID      string `json:"id"`
	SoundKo string `json:"sound_ko"`
	SoundEn string `json:"sound_en"`
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
		var char Character
		line := scanner.Text()

		err := json.Unmarshal([]byte(line), &char)
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

func loadMeta(filename string) ([]Meta, error) {
	fs, err := os.Open(filename)
	if err != nil {
		return nil, err
	}
	defer fs.Close()

	var metas []Meta
	scanner := bufio.NewScanner(fs)
	for scanner.Scan() {
		var meta Meta
		line := scanner.Text()

		err := json.Unmarshal([]byte(line), &meta)
		if err != nil {
			return nil, err
		}

		metas = append(metas, meta)
	}

	if err := scanner.Err(); err != nil {
		return nil, err
	}

	return metas, nil
}
