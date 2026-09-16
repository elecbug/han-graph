import test from 'node:test';
import {createDataClient} from '../static/data-client.mjs';
import assert from 'node:assert/strict';
import {filterNetwork,layoutNetwork,renderNetworkSVG} from '../static/network.mjs';
import {filterPracticeQuestions,createSession,answerQuestion,sessionResult} from '../static/learning.mjs';

const normal={word:'흡연',hanja:'吸煙',level:'normal',components:['吸','煙'],meaning_ko:'담배 피움',meaning_en:'smoking'};
const classical={word:'흡연',hanja:'恰然',level:'classical',components:['恰','然'],meaning_ko:'마음에 맞는 모양',meaning_en:'fitting'};
const network={roots:['吸','恰'],characters:['吸','煙','恰','然'].map(hanja=>({hanja,readings:[]})),words:[normal,classical]};

test('graph filters prune leaves, retain roots, preserve homographs and leave the source intact',()=>{
  const before=JSON.stringify(network);
  const filtered=filterNetwork(network,'classical');
  assert.deepEqual(filtered.words,[classical]);
  assert.deepEqual(filtered.characters.map(c=>c.hanja),['吸','恰','然']);
  assert.deepEqual(filterNetwork(network,'normal').words,[normal]);
  assert.equal(filterNetwork(network,'all'),network);
  assert.equal(JSON.stringify(network),before);
  assert.throws(()=>filterNetwork(network,'invalid'),RangeError);
  const empty=filterNetwork({...network,words:[normal]},'classical');
  assert.equal(empty.words.length,0);
  assert.deepEqual(empty.characters.map(c=>c.hanja),network.roots);
  assert.equal(layoutNetwork(empty).edges.length,0);
});

test('graph categories have visible text, distinct classes and accessible labels in both languages',()=>{
  const layout=layoutNetwork(network,classical);
  for(const lang of ['ko','en']) {
    const svg=renderNetworkSVG(layout,{lang});
    assert.match(svg,/network-edge classical current/);
    assert.match(svg,/network-line-link classical current/);
    assert.match(svg,/class="edge-category"/);
    assert.ok(svg.includes(lang==='ko'?'고전·문어':'Classical'));
    assert.ok(svg.includes(lang==='ko'?'일반':'General'));
    assert.match(svg,/aria-label="[^\"]*흡연 \(恰然\),/);
  }
  for(const edge of layout.edges) assert.equal(edge.height,60);
});

const questions=Array.from({length:36},(_,i)=>({id:`q-${i}`,difficulty:['easy','medium','hard'][i%3],word_level:i<18?'normal':'classical',answer:i%2?classical:normal,options:[normal,classical]}));
test('practice combines difficulty and category before sampling and retains settings through grading',()=>{
  const before=JSON.stringify(questions);
  for(const difficulty of ['all','easy','medium','hard']) for(const level of ['all','normal','classical']) {
    const settings={difficulty,level};
    const expected=questions.filter(q=>(difficulty==='all'||q.difficulty===difficulty)&&(level==='all'||q.word_level===level));
    assert.deepEqual(filterPracticeQuestions(questions,settings),expected);
    const session=createSession(questions,()=>0.3,settings);
    assert.equal(session.questions.length,Math.min(10,expected.length));
    assert.ok(session.questions.every(q=>expected.includes(questions.find(original=>original.id===q.id))));
    assert.equal(new Set(session.questions.map(q=>q.id)).size,session.questions.length);
    session.questions.forEach((q,i)=>assert.equal(answerQuestion(session,i,q.answer),true));
    assert.equal(sessionResult(session).correct,session.questions.length);
    assert.equal(session.difficulty,difficulty);
    assert.equal(session.level,level);
  }
  assert.equal(JSON.stringify(questions),before);
  assert.equal(createSession([],Math.random,{difficulty:'hard',level:'classical'}).questions.length,0);
  assert.throws(()=>filterPracticeQuestions(questions,{difficulty:'invalid'}),RangeError);
});


test('category and reading filters have independent cache entries with canonical query order',async()=>{
  const calls=[];
  const getJSON=createDataClient({origin:'http://localhost',seed:{'/api/search':{kind:'all'}},fetcher:async url=>{
    calls.push(url);return {ok:true,json:async()=>({url})};
  }});
  assert.deepEqual(await getJSON('/api/search',''),{kind:'all'});
  const general=await getJSON('/api/search?level=normal','하');
  const classical=await getJSON('/api/search?level=classical','하');
  const reading=await getJSON('/api/search?mode=sound&level=classical','하');
  assert.notDeepEqual(general,classical);
  assert.notDeepEqual(reading,classical);
  assert.deepEqual(await getJSON('/api/search?level=classical&mode=sound','하'),reading);
  assert.equal(calls.length,3);
});
