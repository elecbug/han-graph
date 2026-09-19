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
