import test from 'node:test';
import assert from 'node:assert/strict';
import {wordKey, normalizeSaved, createSession, answerQuestion, sessionResult} from '../static/learning.mjs';

const fraction={word:'분수',hanja:'分數'}, fountain={word:'분수',hanja:'噴水'};
const questions=[{id:'first',answer:fraction,options:[fraction,fountain]},{id:'second',answer:fountain,options:[fraction,fountain]}];

test('saved words retain homographs, remove duplicates and reject corrupt records',()=>{
  assert.notEqual(wordKey(fraction),wordKey(fountain));
  assert.deepEqual(normalizeSaved([fraction,fountain,fraction,null,{word:1,hanja:'水'},{}]),[fraction,fountain]);
  assert.deepEqual(normalizeSaved({}),[]);
});

test('scoring is locked after the first answer and records mistakes once',()=>{
  const session=createSession(questions,()=>0.99);
  assert.equal(answerQuestion(session,0,fountain),true);
  assert.equal(answerQuestion(session,0,fraction),false);
  let result=sessionResult(session);
  assert.equal(result.correct,0);assert.equal(result.answered,1);assert.equal(result.complete,false);
  assert.equal(answerQuestion(session,1,fountain),true);
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
