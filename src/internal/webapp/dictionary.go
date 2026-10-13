package webapp

import (
	"errors"
	"net/http"
	"sync"

	"github.com/elecbug/han-graph/internal/account"
	"github.com/elecbug/han-graph/internal/graph"
)

type dictionaryKey struct {
	user     string
	revision uint64
}
type dictionaryViews struct {
	base  *graph.Graph
	store *account.Store
	mu    sync.Mutex
	cache map[dictionaryKey]*graph.Graph
}

func (d *dictionaryViews) view(w http.ResponseWriter, r *http.Request) (*graph.Graph, bool) {
	w.Header().Set("Vary", "Cookie, X-Account-ID")
	expected := r.Header.Get("X-Account-ID")
	// The public bootstrap is reusable. The client opts into account data only
	// after resolving its session, and binds every lookup to that account.
	if expected == "guest" {
		return d.base, true
	}
	if d.store == nil {
		if expected != "" {
			accountError(w, account.ErrUnauthorized)
			return nil, false
		}
		return d.base, true
	}
	id, err := d.store.Resolve(cookieToken(r))
	if errors.Is(err, account.ErrUnauthorized) && expected == "" {
		return d.base, true
	}
	if err != nil {
		accountError(w, err)
		return nil, false
	}
	if expected != "" && expected != id {
		accountError(w, account.ErrUnauthorized)
		return nil, false
	}
	snap, err := d.store.Snapshot(id)
	if err != nil {
		accountError(w, err)
		return nil, false
	}
	if snap.Dictionary.Empty() {
		return d.base, true
	}
	key := dictionaryKey{id, snap.DictionaryRevision}
	d.mu.Lock()
	defer d.mu.Unlock()
	if cached := d.cache[key]; cached != nil {
		return cached, true
	}
	merged, err := d.base.WithAdditions(snap.Dictionary)
	if err != nil {
		accountError(w, err)
		return nil, false
	}
	// Retire old revisions and bound memory, even if many accounts sign in.
	for old := range d.cache {
		if old.user == id {
			delete(d.cache, old)
		}
	}
	if len(d.cache) >= 16 {
		for old := range d.cache {
			delete(d.cache, old)
			break
		}
	}
	d.cache[key] = merged
	return merged, true
}
