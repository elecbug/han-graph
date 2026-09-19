import test from 'node:test';
import assert from 'node:assert/strict';
import {loadPrintableWords, renderPrintableWordbook, wordbookPrintFilename} from '../static/wordbook-print.mjs';

const fraction={word:'분수',hanja:'分數'}, fountain={word:'분수',hanja:'噴水'};
const result=(ref,extra={})=>({word:{...ref,meaning_ko:'한국어 뜻',meaning_en:'English meaning',level:'easy',...extra},components:[]});

test('printing preserves homographs, saved order, and missing entries; lookup failures are not missing words',async()=>{
  const missing={word:'없는 단어',hanja:'無'}, saved=[fountain,missing,fraction], queries=[];
  const entries=await loadPrintableWords(saved,async(path,query)=>{
    assert.equal(path,'/api/words');queries.push(query);
    return query==='분수'?[result(fraction),result(fountain)]:[];
  });
  assert.deepEqual(queries,['분수','없는 단어']);
  assert.deepEqual(entries.map(entry=>entry.ref),saved);
  assert.deepEqual(entries.map(entry=>entry.result?.word.hanja??null),['噴水',null,'分數']);
  assert.deepEqual(saved,[fountain,missing,fraction]);
  const html=renderPrintableWordbook(entries);
  assert(html.indexOf('噴')<html.indexOf('없는 단어'));
  assert(html.includes('현재 사전에서 설명을 찾을 수 없어요'));
  await assert.rejects(loadPrintableWords(saved,async()=>{throw new Error('offline');}),/offline/);
});

test('a full 500-word collection loads without truncation and limits concurrent requests',async()=>{
  const saved=Array.from({length:500},(_,i)=>({word:`단어${i}`,hanja:'字'}));
  let active=0, peak=0;
  const entries=await loadPrintableWords(saved,async(path,query)=>{
    active++;peak=Math.max(peak,active);
    await new Promise(resolve=>setImmediate(resolve));
    active--;
    return [result({word:query,hanja:'字'})];
  });
  assert.equal(entries.length,500);
  assert.deepEqual(entries.map(entry=>entry.ref),saved);
  assert(peak>1 && peak<=6);
  const html=renderPrintableWordbook(entries);
  assert.equal((html.match(/class="print-entry"/g)??[]).length,500);
  assert(html.includes('단어499'));
});

test('leaving a print preview stops subsequent batches and retains the original selection snapshot',async()=>{
  const saved=Array.from({length:20},(_,i)=>({word:`단어${i}`,hanja:'字'}));
  let calls=0,current=true;
  const loading=loadPrintableWords(saved,async()=>{calls++;await new Promise(resolve=>setImmediate(resolve));return [];},()=>current);
  current=false;
  assert.deepEqual(await loading,[]);
  assert.equal(calls,6);
  const refs=[fountain];
  const pending=loadPrintableWords(refs,async()=>{await new Promise(resolve=>setImmediate(resolve));return [result(fountain)];});
  refs.splice(0,1,fraction);
  assert.deepEqual((await pending)[0].ref,fountain);
});

test('the document includes bilingual definitions, hints, component readings and mixed Hangul/Hanja',()=>{
  const ref={word:'검은색',hanja:'검은色'};
  const entry={ref,result:{...result(ref,{semantic_hint:'色[색]은 빛깔을 뜻해요.'}),components:[{
    hanja:'色',readings:[{sound_ko:'색',sound_en:'saek',meaning_ko:['빛깔'],meaning_en:['color']}],
  }]}};
  const date=new Date(2026,8,19);
  const ko=renderPrintableWordbook([entry],{date});
  for(const text of ['나의 단어 모음','한국어 뜻','English meaning','色[색]은 빛깔을 뜻해요.','saek','빛깔','기초','2026','19'])assert(ko.includes(text),text);
  assert(ko.includes('<span>검</span><span>은</span><strong>色</strong>'));
  const en=renderPrintableWordbook([entry],{lang:'en',date});
  for(const text of ['My word collection','한국어 뜻','English meaning','color','Easy','1 word'])assert(en.includes(text),text);
  assert.equal(wordbookPrintFilename(date),'han-graph-words-2026-09-19');
});

test('imported spellings and all dictionary text are rendered as text, including in the fallback',()=>{
  const payload='<img src=x onerror="alert(1)"> & <script>bad()</script>';
  const ref={word:payload,hanja:payload};
  const entry={ref,result:result(ref,{meaning_ko:payload,meaning_en:payload,semantic_hint:payload,level:payload})};
  entry.result.components=[{hanja:payload,readings:[{sound_ko:payload,sound_en:payload,meaning_ko:[payload],meaning_en:[payload]}]}];
  for(const html of [renderPrintableWordbook([entry]),renderPrintableWordbook([{ref,result:null}])]) {
    assert(!html.includes('<img'));
    assert(!html.includes('<script'));
    assert(html.includes('&lt;img'));
    assert(!html.includes('undefined'));
  }
});

test('words without a Hanja breakdown remain printable without blank character sections',()=>{
  const ref={word:'나무',hanja:''};
  const html=renderPrintableWordbook([{ref,result:result(ref)}]);
  assert(html.includes('나무'));
  assert(html.includes('English meaning'));
  assert(!html.includes('class="print-breakdown"'));
  assert(!html.includes('class="print-word-form"'));
});
