package account

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"maps"
	"slices"

	"cloud.google.com/go/firestore"
)

// Each ordered list has its own manifest. Keeping unchanged pages at both ends
// lets a one-note edit or deletion fit in a transaction even for a large account.
const pageSize = 128 << 10

func recordLists(r *record) map[string]any {
	return map[string]any{
		"words": &r.Words, "notes": &r.Notes,
		"dictionaryWords": &r.Dictionary.Words, "examples": &r.Dictionary.Examples,
		"characters": &r.Dictionary.Characters, "readings": &r.Dictionary.Meta,
	}
}

type pageDocument struct{ Data []byte }

func readPages(tx *firestore.Transaction, collection *firestore.CollectionRef, manifest map[string][]string, r *record) (map[string][]byte, error) {
	data := map[string][]byte{}
	for _, keys := range manifest {
		for _, k := range keys {
			data[k] = nil
		}
	}
	if len(data) == 0 {
		return data, nil
	}
	keys := slices.Sorted(maps.Keys(data))
	refs := make([]*firestore.DocumentRef, 0, len(keys))
	for _, k := range keys {
		refs = append(refs, collection.Doc(k))
	}
	docs, err := tx.GetAll(refs)
	if err != nil {
		return nil, err
	}
	for i, doc := range docs {
		if !doc.Exists() {
			return nil, fmt.Errorf("missing account page %s", keys[i])
		}
		var page pageDocument
		if err := doc.DataTo(&page); err != nil {
			return nil, err
		}
		data[keys[i]] = page.Data
	}
	for field, dest := range recordLists(r) {
		parts := manifest[field]
		if len(parts) == 0 {
			continue
		}
		var buf bytes.Buffer
		for _, key := range parts {
			buf.Write(data[key])
		}
		if err := json.Unmarshal(buf.Bytes(), dest); err != nil {
			return nil, fmt.Errorf("read account %s: %w", field, err)
		}
	}
	return data, nil
}

func pageKeys(body []byte, old []string, previous, next map[string][]byte) []string {
	left, right := 0, len(old)
	for left < right && bytes.HasPrefix(body, previous[old[left]]) {
		data := previous[old[left]]
		next[old[left]] = data
		body = body[len(data):]
		left++
	}
	for right > left && bytes.HasSuffix(body, previous[old[right-1]]) {
		data := previous[old[right-1]]
		next[old[right-1]] = data
		body = body[:len(body)-len(data)]
		right--
	}
	keys := slices.Clone(old[:left])
	// Split the changed span evenly to avoid a tiny extra page on each edit.
	for pages := (len(body) + pageSize - 1) / pageSize; pages > 0; pages-- {
		n := (len(body) + pages - 1) / pages
		part := body[:n]
		digest := sha256.Sum256(part)
		key := hex.EncodeToString(digest[:])
		next[key] = part
		keys = append(keys, key)
		body = body[n:]
	}
	return append(keys, old[right:]...)
}

func writePages(tx *firestore.Transaction, collection *firestore.CollectionRef, manifest map[string][]string, previous map[string][]byte, r *record) (map[string][]string, error) {
	updated := map[string][]string{}
	next := map[string][]byte{}
	for field, source := range recordLists(r) {
		body, err := json.Marshal(source)
		if err != nil {
			return nil, err
		}
		if bytes.Equal(body, []byte("null")) || bytes.Equal(body, []byte("[]")) {
			continue
		}
		updated[field] = pageKeys(body, manifest[field], previous, next)
	}
	for key, data := range next {
		if _, exists := previous[key]; !exists {
			if err := tx.Set(collection.Doc(key), pageDocument{data}); err != nil {
				return nil, err
			}
		}
	}
	for key := range previous {
		if _, keep := next[key]; !keep {
			if err := tx.Delete(collection.Doc(key)); err != nil {
				return nil, err
			}
		}
	}
	return updated, nil
}
