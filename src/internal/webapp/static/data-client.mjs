// Cache only for this document's lifetime: a reload picks up a new dataset.
export function createDataClient({origin, seed = {}, fetcher = fetch, limit = 128}) {
  const cache = new Map();
  let owner = 'guest', revision = 0, generation = 0, controller = new AbortController();
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
  function getJSON(path, query) {
    const key = keyFor(path, query);
    if (cache.has(key)) return remember(key, cache.get(key));
    const accountOwner = owner, requestGeneration = generation, signal = AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]);
    const request = Promise.resolve().then(async () => {
      if(requestGeneration!==generation) throw new DOMException('Account changed','AbortError');
      const response = await fetcher(key, {signal, cache:'no-store', headers:{'X-Account-ID':accountOwner}});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const value = await response.json();
      if(requestGeneration!==generation) throw new DOMException('Account changed','AbortError');
      return value;
    }).catch(error => {
      if (cache.get(key) === request) cache.delete(key);
      throw error;
    });
    return remember(key, request);
  }
  getJSON.setScope = (nextOwner = 'guest', nextRevision = 0) => {
    if(owner===nextOwner && revision===nextRevision) return false;
    owner=nextOwner; revision=nextRevision; generation++;
    controller.abort(); controller=new AbortController(); cache.clear();
    return true;
  };
  return getJSON;
}
