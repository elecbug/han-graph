import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSaved} from '../static/learning.mjs';
import {parseWordbook, mergeWordbook, serializeWordbook} from '../static/wordbook.mjs';
import {layoutNetwork, renderNetworkSVG} from '../static/network.mjs';

test('words without Hanja and mixed words survive saving, merging and JSONL round trips',()=>{
  const words=[{word:'사람',hanja:''},{word:'공부하다',hanja:'工夫하다'},{word:'강',hanja:'江'}];
  assert.deepEqual(normalizeSaved([...words,words[0],{word:'잘못된 값'}]),words);
  assert.deepEqual(parseWordbook(serializeWordbook(words)),words);
  assert.deepEqual(mergeWordbook([words[0]],words),{words,added:2,duplicates:1});
  assert.throws(()=>parseWordbook('{"word":"사람"}'),error=>error.code==='invalid');
  assert.throws(()=>parseWordbook('{"word":"","hanja":""}'),error=>error.code==='invalid');
});

test('a single-character word renders a selected graph label',()=>{
  const word={level:'normal',word:'강',hanja:'江',components:['江']};
  const network={roots:['江'],characters:[{hanja:'江',readings:[]}],words:[word]};
  const layout=layoutNetwork(network,word);
  const svg=renderNetworkSVG(layout,{lang:'ko'});
  assert(svg.includes('강'));
  assert(svg.includes('江'));
  assert(!svg.includes('NaN'));
  assert(!svg.includes('Infinity'));
});
