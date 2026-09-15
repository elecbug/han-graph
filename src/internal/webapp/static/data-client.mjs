// Cache only for this document's lifetime: a reload picks up a new dataset.
export function createDataClient({origin, seed = {}, fetcher = fetch, limit = 128}) {
  const cache = new Map();
  const keyFor = (path, query) => {
    const url = new URL(path, origin);
    if (query !== undefined) url.searchParams.set('q', query);
    if (url.searchParams.get('q') === '') url.searchParams.delete('q');
    url.searchParams.sort();
    return url.href;
  };
  function remember(key, promise) {
    cache.delete(key);
    cache.set(key, promise);
    while (cache.size > limit) cache.delete(cache.keys().next().value);
    return promise;
  }
  for (const [path, value] of Object.entries(seed)) remember(keyFor(path), Promise.resolve(value));
  return function getJSON(path, query) {
    const key = keyFor(path, query);
    if (cache.has(key)) return remember(key, cache.get(key));
    const request = Promise.resolve().then(async () => {
      const response = await fetcher(key, {signal: AbortSignal.timeout(10000)});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    }).catch(error => {
      if (cache.get(key) === request) cache.delete(key);
      throw error;
    });
    return remember(key, request);
  };
}
