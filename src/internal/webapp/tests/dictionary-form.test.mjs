import test from 'node:test';
import assert from 'node:assert/strict';
import {wordFormPayload,findMissingCharacters,addMissingCharacters,emptyWordDraft} from '../static/dictionary-form.mjs';

const draft={...emptyWordDraft(),word:'학습노트',hanja:'學習노트',meaning_ko:'배운 내용을 적는 노트',meaning_en:'study notebook',meaning_ru:'учебная тетрадь'};
test('a normal form builds exact mixed spellings and optional translated examples without raw JSON',()=>{
  const payload=wordFormPayload({...draft,example_ko:'학습노트를 썼어요.',example_ru:'Я сделал запись в учебной тетради.'});
  assert.deepEqual(payload.words[0].components,['學','習']);
  assert.equal(payload.words[0].hanja,'學習노트');
  assert.equal(payload.words[0].meaning_ru,'учебная тетрадь');
  assert.equal(payload.examples[0].example_ru,'Я сделал запись в учебной тетради.');
  assert(!Object.hasOwn(payload.examples[0],'example_en'));
  assert.deepEqual(wordFormPayload({...draft,hanja:''}).words[0].components,[]);
  assert.deepEqual(wordFormPayload({...draft,word:'반복',hanja:'水水'}).words[0].components,['水','水']);
});
test('missing characters are unique and inferred from the word without changing existing readings',async()=>{
  const payload=wordFormPayload({...draft,word:'섬섬광',hanja:'閃閃光'});
  const queries=[];
  const missing=await findMissingCharacters(payload.words[0],async glyph=>{queries.push(glyph);return glyph==='光'?[{id:'gwang-000'}]:[];});
  assert.deepEqual(queries,['閃','光']);
  assert.equal(missing.length,1);assert.equal(missing[0].sound_ko,'섬');
  missing[0]={...missing[0],meaning_ko:'번쩍이다',meaning_en:'flash',meaning_ru:'сверкать'};
  const result=addMissingCharacters(payload,missing,[{type:'meta',id:'seom',sound_ko:'섬',sound_en:'seom'}],()=> '9001');
  assert.equal(result.characters[0].id,'seom-9001');assert.deepEqual(result.meta,[]);
  assert.deepEqual(result.characters[0].meaning_ru,['сверкать']);
  assert.equal(payload.characters.length,0);
});
test('new reading groups are generated once and failures remain attached to the field',()=>{
  const payload=wordFormPayload(draft);
  const newCharacter={glyph:'閃',sound_ko:'섬',sound_en:'seom',meaning_ko:'번쩍이다',meaning_en:'flash'};
  const result=addMissingCharacters(payload,[newCharacter,{...newCharacter,glyph:'陝'}],[],()=> '9001');
  assert.equal(result.meta.length,1);assert.equal(result.characters.length,2);
  for(const [data,field] of [[{...draft,hanja:'學習메모'},'hanja'],[{...draft,meaning_ko:' '},'meaning_ko'],[{...draft,example_en:'Example without source'},'example_ko']]) {
    assert.throws(()=>wordFormPayload(data),error=>error.field===field);
  }
  assert.throws(()=>addMissingCharacters(payload,[{...newCharacter,sound_en:'bad-reading'}],[]),error=>error.code==='wordFormReading');
  assert.throws(()=>wordFormPayload({...draft,meaning_ru:'bad\nline'}),error=>error.field==='meaning_ru');
});

test('a private word may contain only its Korean meaning',()=>{
  const result=wordFormPayload({...emptyWordDraft(),word:'노트',meaning_ko:'필기장'});
  assert.equal(result.words[0].meaning_ko,'필기장');
  assert.equal(result.words[0].meaning_en,undefined);
});
