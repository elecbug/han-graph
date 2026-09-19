import test from 'node:test';
import {createDataClient} from '../static/data-client.mjs';
import assert from 'node:assert/strict';
import {filterNetwork,layoutNetwork,renderNetworkSVG} from '../static/network.mjs';
import {filterPracticeQuestions,practiceSettings,PRACTICE_LEVELS,createSession,answerQuestion,sessionResult} from '../static/learning.mjs';

const normal={word:'흡연',hanja:'吸煙',level:'normal',components:['吸','煙'],meaning_ko:'담배 피움',meaning_en:'smoking'};
const classical={word:'흡연',hanja:'恰然',level:'classical',components:['恰','然'],meaning_ko:'마음에 맞는 모양',meaning_en:'fitting'};
const easy={word:'흡수',hanja:'吸收',level:'easy',components:['吸','收']};
const hard={word:'흡착',hanja:'吸着',level:'hard',components:['吸','着']};
const network={roots:['吸','恰'],characters:['吸','煙','恰','然','收','着'].map(hanja=>({hanja,readings:[]})),words:[easy,normal,hard,classical]};

test('graph filters prune leaves, retain roots, preserve homographs and leave the source intact',()=>{
  const before=JSON.stringify(network);
  const filtered=filterNetwork(network,'classical');
  assert.deepEqual(filtered.words,[classical]);
  assert.deepEqual(filtered.characters.map(c=>c.hanja),['吸','恰','然']);
  for(const word of [easy,normal,hard,classical]) {
    const category=filterNetwork(network,word.level);
    assert.deepEqual(category.words,[word]);
    assert.deepEqual(new Set(category.characters.map(c=>c.hanja)),new Set([...network.roots,...word.components]));
  }
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
    assert.ok(svg.includes(lang==='ko'?'고전':'Classical'));
    assert.ok(svg.includes(lang==='ko'?'일반':'General'));
    for(const [category,label] of [['easy',lang==='ko'?'기초':'Easy'],['hard',lang==='ko'?'심화':'Advanced']]) {
      assert(svg.includes(`network-edge ${category}`));
      assert(svg.includes(`network-line-link ${category}`));
      assert(svg.includes(`, ${label}\"`),'accessible category label');
      assert(svg.includes(`>${label}</text>`),'visible category label');
    }
    assert.match(svg,/aria-label="[^\"]*흡연 \(恰然\),/);
  }
  for(const edge of layout.edges) assert.equal(edge.height,60);
});

const quizWords=[{word:'가격',hanja:'價格'},{word:'보완',hanja:'補完'},{word:'개연성',hanja:'蓋然性'},{word:'자왈',hanja:'子曰'}];
const questions=Array.from({length:72},(_,i)=>({id:`q-${i}`,word_level:['easy','normal','hard','classical'][Math.floor(i/18)],answer:quizWords[Math.floor(i/18)],options:quizWords}));
test('practice samples only the chosen word category and retains it through grading',()=>{
  const before=JSON.stringify(questions);
  for(const level of PRACTICE_LEVELS) {
    const settings={level};
    const expected=questions.filter(q=>q.word_level===level);
    assert.deepEqual(filterPracticeQuestions(questions,settings),expected);
    const session=createSession(questions,()=>0.3,settings);
    assert.equal(session.questions.length,Math.min(10,expected.length));
    assert.ok(session.questions.every(q=>expected.includes(questions.find(original=>original.id===q.id))));
    assert.equal(new Set(session.questions.map(q=>q.id)).size,session.questions.length);
    session.questions.forEach((q,i)=>assert.equal(answerQuestion(session,i,q.answer),true));
    assert.equal(sessionResult(session).correct,session.questions.length);
    assert.ok(!('difficulty' in session));
    assert.equal(session.level,level);
  }
  assert.equal(JSON.stringify(questions),before);
  assert.equal(createSession([],Math.random,{level:'classical'}).questions.length,0);
  for(const level of ['all','medium','invalid'])assert.throws(()=>filterPracticeQuestions(questions,{level}),RangeError);
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
  const easy=await getJSON('/api/search?level=easy','하');
  const hard=await getJSON('/api/search?level=hard','하');
  assert.equal(new Set([general,classical,easy,hard].map(result=>result.url)).size,4);
  assert.deepEqual(await getJSON('/api/search?level=easy','하'),easy);
  assert.equal(calls.length,5);
});

test('old practice settings migrate to one of the four categories',()=>{
  assert.deepEqual(PRACTICE_LEVELS,['easy','normal','hard','classical']);
  for(const level of PRACTICE_LEVELS)assert.deepEqual(practiceSettings({level,difficulty:'hard'}),{level});
  for(const value of [null,{},42,{level:'all',difficulty:'medium'},{level:'invalid'}])assert.deepEqual(practiceSettings(value),{level:'easy'});
});
