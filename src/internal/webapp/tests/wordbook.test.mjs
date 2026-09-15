import test from 'node:test';
import assert from 'node:assert/strict';
import {parseWordbook, mergeWordbook, serializeWordbook, MAX_WORDBOOK_BYTES} from '../static/wordbook.mjs';

const fraction={word:'분수',hanja:'分數'}, fountain={word:'분수',hanja:'噴水'};

test('JSONL round trip retains homographs, order, and words absent from the dataset',()=>{
  const entries=[fraction,fountain,{word:'외부 단어',hanja:'外部單語'}];
  const text=serializeWordbook(entries);
  assert(text.endsWith('\n'));
  assert(!text.includes('\r'));
  assert.deepEqual(text.trimEnd().split('\n').map(JSON.parse),entries);
  assert.deepEqual(parseWordbook(text),entries);
});

test('imports accept BOM, CRLF, blank lines and full dataset rows while stripping extra fields',()=>{
  const text='\uFEFF\r\n'+JSON.stringify({...fraction,word:' 분수 ',meaning_ko:'수의 비율',components:['分','數']})+'\r\n\r\n'+JSON.stringify(fountain);
  assert.deepEqual(parseWordbook(text),[fraction,fountain]);
  assert.deepEqual(mergeWordbook([fraction],parseWordbook(text)),{words:[fraction,fountain],added:1,duplicates:1});
  assert.deepEqual(mergeWordbook([],parseWordbook(serializeWordbook([fraction])+serializeWordbook([fraction]))),{words:[fraction],added:1,duplicates:1});
});

test('an invalid line aborts the whole import, with the original line number',()=>{
  const saved=[fraction];
  for(const invalid of ['{', '[]', 'null', '42', '{}', '{"word":"분수","hanja":3}', '{"word":" ","hanja":"水"}', JSON.stringify({word:'bad\nword',hanja:'水'}),JSON.stringify({word:'a'.repeat(101),hanja:'水'})]) {
    assert.throws(()=>mergeWordbook(saved,parseWordbook(JSON.stringify(fountain)+'\n\n'+invalid)),error=>error.code==='invalid'&&error.line===3);
    assert.deepEqual(saved,[fraction]);
  }
  assert.throws(()=>parseWordbook('\uFEFF\n  '),error=>error.code==='empty');
});

test('oversized files and imports exceeding capacity fail without truncation or mutation',()=>{
  assert.throws(()=>parseWordbook(' '.repeat(MAX_WORDBOOK_BYTES+1)),error=>error.code==='size');
  const full=Array.from({length:500},(_,i)=>({word:'항목'+i,hanja:'字'+i}));
  const before=JSON.stringify(full);
  assert.deepEqual(mergeWordbook(full,[full[0]]),{words:full,added:0,duplicates:1});
  assert.throws(()=>mergeWordbook(full,[fraction]),error=>error.code==='limit');
  assert.equal(JSON.stringify(full),before);
});
