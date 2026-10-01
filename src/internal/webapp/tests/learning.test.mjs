import test from 'node:test';
import assert from 'node:assert/strict';
import {wordKey, normalizeSaved, createSession, answerQuestion, sessionResult} from '../static/learning.mjs';

const fraction={word:'분수',hanja:'分數'}, mathematics={word:'수학',hanja:'數學'}, fountain={word:'분수',hanja:'噴水'};
const questions=[{id:'first',word_level:'easy',answer:fraction,options:[fraction,mathematics]},{id:'second',word_level:'easy',answer:mathematics,options:[fraction,mathematics]}];

test('saved words retain homographs, remove duplicates and reject corrupt records',()=>{
  assert.notEqual(wordKey(fraction),wordKey(fountain));
  assert.deepEqual(normalizeSaved([fraction,fountain,fraction,null,{word:1,hanja:'水'},{}]),[fraction,fountain]);
  assert.deepEqual(normalizeSaved({}),[]);
});

test('scoring is locked after the first answer and records mistakes once',()=>{
  const session=createSession(questions,()=>0.99);
  assert.equal(answerQuestion(session,0,mathematics),true);
  assert.equal(answerQuestion(session,0,fraction),false);
  let result=sessionResult(session);
  assert.equal(result.correct,0);assert.equal(result.answered,1);assert.equal(result.complete,false);
  assert.equal(answerQuestion(session,1,mathematics),true);
  result=sessionResult(session);
  assert.equal(result.correct,1);assert.equal(result.total,2);assert.equal(result.complete,true);
  assert.deepEqual(result.mistakes.map(q=>q.id),['first']);
});

test('unrecognised answers and invalid question indexes do not change progress',()=>{
  const session=createSession(questions,()=>0.99);
  assert.equal(answerQuestion(session,99,fraction),false);
  assert.equal(answerQuestion(session,0,{word:'missing',hanja:'水'}),false);
  assert.equal(sessionResult(session).answered,0);
});

test('a restarted session has no previous answers and does not mutate question data',()=>{
  const before=JSON.stringify(questions);
  const first=createSession(questions,()=>0.1);
  answerQuestion(first,0,first.questions[0].answer);
  const next=createSession(questions,()=>0.1);
  assert.equal(sessionResult(next).answered,0);
  assert.equal(JSON.stringify(questions),before);
  assert.deepEqual(new Set(next.questions.map(q=>q.id)),new Set(questions.map(q=>q.id)));
});

test('each round samples ten distinct questions from the whole pool and shuffles options',()=>{
  const pool=Array.from({length:100},(_,index)=>({id:`q-${index}`,word_level:'easy',answer:fraction,options:[fraction,mathematics]}));
  const before=JSON.stringify(pool);
  const first=createSession(pool,()=>0);
  const second=createSession(pool,()=>0.999999);
  assert.equal(first.questions.length,10);
  assert.equal(second.questions.length,10);
  assert.equal(new Set(first.questions.map(q=>q.id)).size,10);
  assert.notDeepEqual(first.questions.map(q=>q.id),second.questions.map(q=>q.id));
  assert.ok(first.questions.some(q=>Number(q.id.slice(2))>=10),'sampling must include questions beyond the first ten');
  assert.deepEqual(first.questions[0].options,[mathematics,fraction]);
  assert.deepEqual(second.questions[0].options,[fraction,mathematics]);
  for(let i=0;i<first.questions.length;i++) assert.equal(answerQuestion(first,i,first.questions[i].answer),true);
  assert.deepEqual(sessionResult(first),{total:10,answered:10,correct:10,mistakes:[],complete:true});
  assert.equal(sessionResult(second).answered,0);
  assert.equal(second.recorded,false);
  assert.equal(answerQuestion(first,10,fraction),false);
  assert.equal(JSON.stringify(pool),before);
});

test('practice pools with ten or fewer questions use every available question once',()=>{
  for(const size of [0,1,6,10]) {
    const pool=Array.from({length:size},(_,index)=>({id:`small-${index}`,word_level:'easy',answer:fraction,options:[fraction,mathematics]}));
    const session=createSession(pool,()=>0.5);
    assert.equal(session.questions.length,size);
    assert.equal(new Set(session.questions.map(q=>q.id)).size,size);
    assert.equal(sessionResult(session).total,size);
    assert.equal(sessionResult(session).complete,false);
  }
});

test('most questions compare meanings, with a different contrast group in each slot',()=>{
  const comparisons=Array.from({length:12},(_,group)=>[1,2].map(n=>({id:`contrast-${group}-${n}`,contrast_group:`group-${group}`,word_level:'easy',answer:fraction,options:[fraction,mathematics]}))).flat();
  const general=Array.from({length:20},(_,i)=>({id:`general-${i}`,word_level:'easy',answer:fraction,options:[fraction,mathematics]}));
  const other={id:'wrong-category',contrast_group:'hard-group',word_level:'hard',answer:fraction,options:[fraction,mathematics]};
  const pool=[...comparisons,...general,other],before=JSON.stringify(pool);
  for(const random of [()=>0,()=>0.99999,()=>0.4]) {
    const session=createSession(pool,random,{level:'easy'});
    const selected=session.questions.filter(q=>q.contrast_group);
    assert.equal(session.questions.length,10);
    assert.equal(selected.length,8);
    assert.equal(new Set(selected.map(q=>q.contrast_group)).size,8);
    assert.equal(new Set(session.questions.map(q=>q.id)).size,10);
    assert(session.questions.every(q=>q.word_level==='easy'));
  }
  assert.equal(JSON.stringify(pool),before);
});

test('small comparison pools fill remaining slots from general questions',()=>{
  const comparison={...questions[0],contrast_group:'small-group'};
  const general=Array.from({length:15},(_,i)=>({...questions[1],id:`general-${i}`}));
  const session=createSession([comparison,...general],()=>0.5);
  assert.equal(session.questions.length,10);
  assert.equal(session.questions.filter(q=>q.contrast_group).length,1);
  const onlyComparisons=Array.from({length:12},(_,i)=>({...comparison,id:`only-${i}`,contrast_group:`group-${i}`}));
  assert.equal(createSession(onlyComparisons,()=>0.5).questions.length,10);
});

test('homonym choices and corrupt options never enter a practice round',()=>{
  const homonyms={...questions[0],id:'homonyms',options:[fraction,fountain]};
  const spaced={...questions[0],id:'spaced',options:[fraction,{word:'분 수',hanja:'噴水'}]};
  const decomposed={...questions[0],id:'decomposed',options:[fraction,{word:'분수'.normalize('NFD'),hanja:'噴水'}]};
  const corrupt=[null,{...questions[0],id:"null-answer",answer:null},{...questions[0],id:'null-option',options:[fraction,null]},{...questions[0],id:'blank',options:[fraction,{word:' ',hanja:'水'}]},{...questions[0],id:'missing-answer',answer:{word:'없음',hanja:'無'}}];
  assert.deepEqual(createSession([homonyms,spaced,decomposed,...corrupt,...questions],()=>0.9).questions.map(q=>q.id),['first','second']);
});


test('rounds prefer new answer words across comparisons and general contexts',()=>{
  const ref = index => ({word:`단어${index}`,hanja:`字${index}`});
  const make = (id,answer,group) => ({id,word_level:'easy',answer:ref(answer),options:[ref(answer),ref(99)],...(group ? {contrast_group:group} : {})});
  const pool=[make('first',0,'first-group'),make('same-answer',0,'second-group'),make('alternate',1,'second-group')];
  for(let i=2;i<8;i++) pool.push(make(`contrast-${i}`,i,`group-${i}`));
  pool.push(make('general-repeat',0),make('general-first',8),make('general-second',9));
  const session=createSession(pool,()=>0.99999);
  assert.equal(session.questions.length,10);
  assert.equal(session.questions.filter(q=>q.contrast_group).length,8);
  assert.equal(new Set(session.questions.map(q=>wordKey(q.answer))).size,10);
  assert.ok(session.questions.some(q=>q.id==='alternate'));
  assert.ok(!session.questions.some(q=>q.id==='general-repeat'));
});

test('answer variety never reduces round size when all general answers repeat',()=>{
  const pool=Array.from({length:8},(_,i)=>({id:`contrast-${i}`,contrast_group:`group-${i}`,word_level:'easy',answer:{word:`단어${i}`,hanja:`字${i}`},options:[{word:`단어${i}`,hanja:`字${i}`},mathematics]}));
  pool.push(...Array.from({length:2},(_,i)=>({...questions[0],id:`general-${i}`,answer:pool[0].answer,options:pool[0].options})));
  const session=createSession(pool,()=>0.99999);
  assert.equal(session.questions.length,10);
  assert.equal(session.questions.filter(q=>!q.contrast_group).length,2);
});
