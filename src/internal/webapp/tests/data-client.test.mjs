import test from 'node:test';
import assert from 'node:assert/strict';
import {createDataClient} from '../static/data-client.mjs';

const origin = 'http://localhost:8080';
const reply = value => ({ok:true, json:async () => value});

test('initial view uses HTML data without making API requests', async () => {
  const seed = {
    '/api/stats': {words:100}, '/api/practice': {questions:[]},
    '/api/search': {words:[{word:'가정',hanja:'家庭'}]},
    '/api/words?q=가정': [{word:{hanja:'家庭',components:['家','庭']}}],
    '/api/characters?q=家': [{hanja:'家'}],
    '/api/neighborhood?q=家庭': {roots:['家','庭'],characters:[],words:[]},
  };
  const get = createDataClient({origin,seed,fetcher:() => assert.fail('unexpected network request')});
  const [stats,practice,search] = await Promise.all([get('/api/stats'),get('/api/practice'),get('/api/search','')]);
  assert.equal(stats.words,100);
  assert.deepEqual(practice.questions,[]);
  const words = await get('/api/words',search.words[0].word);
  assert.equal((await get('/api/characters',words[0].word.components[0]))[0].hanja,'家');
  assert.deepEqual((await get('/api/neighborhood',words[0].word.hanja)).roots,['家','庭']);
});

test('simultaneous and repeated requests share one fetch; failed requests can retry', async () => {
  let calls=0;
  const get = createDataClient({origin,fetcher:async () => {
    if (++calls===1) return {ok:false,status:503};
    return reply(['ok']);
  }});
  const first=get('/api/words','가정');
  assert.equal(first,get('/api/words','가정'));
  await assert.rejects(first,/503/);
  assert.deepEqual(await get('/api/words','가정'),['ok']);
  assert.deepEqual(await get('/api/words','가정'),['ok']);
  assert.equal(calls,2);
});

test('cache evicts least recently used results and does not cross reloads', async () => {
  let calls=0;
  const fetcher=async () => reply(++calls);
  const get=createDataClient({origin,limit:2,fetcher});
  await get('/a'); await get('/b'); await get('/a'); await get('/c');
  assert.equal(await get('/a'),1);
  assert.equal(await get('/b'),4);
  const reloaded=createDataClient({origin,fetcher});
  assert.equal(await reloaded('/a'),5);
});
