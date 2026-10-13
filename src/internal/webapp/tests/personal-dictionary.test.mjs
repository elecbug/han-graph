import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDictionaryRecords,parseDictionaryInput,DICTIONARY_SAMPLE,DictionaryInputError,MAX_DICTIONARY_BYTES} from '../static/personal-dictionary.mjs';

test('repository JSONL, individual pretty objects, and arrays retain all word fields',()=>{
 const word=JSON.parse(DICTIONARY_SAMPLE.words),other={...word,word:'노트',hanja:'',components:[]};
 assert.deepEqual(parseDictionaryRecords(DICTIONARY_SAMPLE.words,'words'),[word]);
 assert.deepEqual(parseDictionaryRecords(JSON.stringify([word,other]),'words'),[word,other]);
 assert.deepEqual(parseDictionaryRecords('\uFEFF'+JSON.stringify(word)+'\r\n\r\n'+JSON.stringify(other)+'\r\n','words'),[word,other]);
 const input=parseDictionaryInput({words:DICTIONARY_SAMPLE.words,examples:DICTIONARY_SAMPLE.examples});
 assert.deepEqual(input.words,[word]);assert.deepEqual(input.characters,[]);assert.equal(input.examples[0].word,word.word);
});
test('standalone character and sound registration does not require a word',()=>{
 const input=parseDictionaryInput({characters:DICTIONARY_SAMPLE.characters,meta:DICTIONARY_SAMPLE.meta});
 assert.deepEqual(input.words,[]);assert.equal(input.characters[0].type,'character');assert.equal(input.meta[0].type,'meta');
});
test('invalid rows, primitives, empty input, and oversized batches produce actionable errors',()=>{
 for(const text of ['null','"word"','5','[null]','[[{}]]'])assert.throws(()=>parseDictionaryRecords(text,'words'),DictionaryInputError);
 const good=JSON.stringify(JSON.parse(DICTIONARY_SAMPLE.words));
 assert.throws(()=>parseDictionaryRecords(good+'\n\n{bad','words'),e=>e.code==='dictionaryJSON'&&e.field==='words'&&e.line===3);
 assert.throws(()=>parseDictionaryInput({words:' \n '}),e=>e.code==='dictionaryEmpty');
 assert.throws(()=>parseDictionaryInput({words:' '.repeat(MAX_DICTIONARY_BYTES+1)}),e=>e.code==='dictionarySize');
});

test('downloaded dictionary bundles can be pasted back and combined with optional inputs',()=>{
 const bundle=parseDictionaryInput({words:DICTIONARY_SAMPLE.words,characters:DICTIONARY_SAMPLE.characters,examples:DICTIONARY_SAMPLE.examples});
 assert.deepEqual(parseDictionaryInput({words:JSON.stringify(bundle,null,2)}),bundle);
 const withReading=parseDictionaryInput({words:JSON.stringify(bundle),meta:DICTIONARY_SAMPLE.meta});
 assert.deepEqual(withReading.meta,[JSON.parse(DICTIONARY_SAMPLE.meta)]);
 for(const invalid of [{words:null},{words:{}},{characters:[null]},{words:[],unknown:[]},{examples:'invalid'}])assert.throws(()=>parseDictionaryInput({words:JSON.stringify(invalid)}),e=>e.code==='dictionaryJSON'&&e.field==='words');
});
