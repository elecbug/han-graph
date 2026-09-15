import {normalizeSaved, wordKey} from './learning.mjs';

export const MAX_WORDBOOK_BYTES = 1024 * 1024;
export const MAX_SAVED_WORDS = 500;

export class WordbookError extends Error {
  constructor(code, line = 0) {
    super(code);
    this.code = code;
    this.line = line;
  }
}

// The portable identity is the Korean spelling AND its Hanja spelling.
// Extra dataset fields are accepted, but never copied into browser storage.
export function parseWordbook(text) {
  if (typeof text !== 'string') throw new WordbookError('invalid');
  if (new TextEncoder().encode(text).length > MAX_WORDBOOK_BYTES) throw new WordbookError('size');
  const entries = [];
  for (const [index, source] of text.replace(/^\uFEFF/, '').split(/\r?\n/).entries()) {
    if (!source.trim()) continue;
    let value;
    try { value = JSON.parse(source); } catch { throw new WordbookError('invalid', index + 1); }
    if (!value || Array.isArray(value) || typeof value !== 'object' ||
        !['word', 'hanja'].every(key => typeof value[key] === 'string' && value[key].trim() &&
          value[key].length <= 100 && !/[\u0000-\u001f\u007f]/u.test(value[key]))) {
      throw new WordbookError('invalid', index + 1);
    }
    entries.push({word:value.word.trim(), hanja:value.hanja.trim()});
  }
  if (!entries.length) throw new WordbookError('empty');
  return entries;
}

export function mergeWordbook(saved, imported) {
  const merged = normalizeSaved(saved);
  const seen = new Set(merged.map(wordKey));
  let added = 0, duplicates = 0;
  for (const word of imported) {
    const key = wordKey(word);
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key);
    merged.push({word:word.word, hanja:word.hanja});
    added++;
  }
  if (merged.length > MAX_SAVED_WORDS) throw new WordbookError('limit');
  return {words:merged, added, duplicates};
}

export function serializeWordbook(saved) {
  const words = normalizeSaved(saved);
  return words.length ? words.map(word => JSON.stringify(word)).join('\n') + '\n' : '';
}
