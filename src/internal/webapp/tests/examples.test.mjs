import test from 'node:test';
import assert from 'node:assert/strict';
import {exampleLines} from '../static/examples.mjs';

const entry={example:'가게마다 가격이 달라요.',example_en:'Prices vary from store to store.'};

test('Korean examples include a secondary English translation',()=>{
  assert.deepEqual(exampleLines(entry,'ko'),[
    {text:entry.example,lang:'ko',secondary:false},
    {text:entry.example_en,lang:'en',secondary:true},
  ]);
});

test('English mode shows only the English example',()=>{
  assert.deepEqual(exampleLines(entry,'en'),[
    {text:entry.example_en,lang:'en',secondary:false},
  ]);
});

test('legacy datasets do not fall back to Korean in English mode',()=>{
  assert.deepEqual(exampleLines({example:entry.example},'en'),[]);
  assert.equal(exampleLines({example:entry.example},'ko').length,1);
  assert.deepEqual(exampleLines(undefined),[]);
  assert.deepEqual(exampleLines({}),[]);
});
