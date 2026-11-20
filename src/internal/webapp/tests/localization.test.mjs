import test from 'node:test';
import assert from 'node:assert/strict';
import {copy, LANGUAGES, normalizeLanguage, localized, countText} from '../static/localization.mjs';
import {exampleLines} from '../static/examples.mjs';
import {renderPrintableWordbook} from '../static/wordbook-print.mjs';
import {layoutNetwork, renderNetworkSVG} from '../static/network.mjs';

test('all languages have every UI message and the same interpolation variables',()=>{
  const keys=Object.keys(copy.ko).sort();
  const variables=text=>[...text.matchAll(/\{\w+\}/g)].map(match=>match[0]).sort();
  for(const language of LANGUAGES) {
    assert.deepEqual(Object.keys(copy[language]).sort(),keys,language);
    for(const key of keys)assert.deepEqual(variables(copy[language][key]),variables(copy.ko[key]),`${language}.${key}`);
    assert.equal(normalizeLanguage(language),language);
  }
  for(const value of [null,'fr',{},''])assert.equal(normalizeLanguage(value),'ko');
});

test('Russian quantities use the correct singular, few and many forms',()=>{
  assert.equal(countText(1,'words','ru'),'1 слово');
  assert.equal(countText(2,'words','ru'),'2 слова');
  assert.equal(countText(5,'words','ru'),'5 слов');
  assert.equal(countText(21,'questions','ru'),'21 задание');
  assert.equal(countText(12,'questions','ru'),'12 заданий');
  assert.equal(countText(2,'characters','en'),'2 characters');
});

test('new locales display counts in their own scripts and number forms',()=>{
  assert.equal(countText(2,'questions','zh'),'2道题');
  assert.equal(countText(2,'questions','ja'),'2問');
  assert.equal(countText(1,'words','es'),'1 palabra');
  assert.equal(countText(2,'words','es'),'2 palabras');
  assert.equal(countText(2,'characters','vi'),'2 chữ Hán');
});

test('meanings, hints, examples and private translation fallbacks never mix interface languages',()=>{
  const entry={meaning_ko:'한국어 뜻',meaning_en:'English meaning',meaning_ru:'Русское значение',meaning_uz:'Oʻzbekcha maʼno',meaning_ky:'Кыргызча маани',semantic_hint:'한국어 힌트',semantic_hint_en:'English hint',semantic_hint_ru:'Русская подсказка'};
  const examples={example:'한국어 예문',example_en:'English example',example_ru:'Русский пример',example_uz:'Oʻzbekcha misol',example_ky:'Кыргызча мисал'};
  Object.assign(entry,{meaning_zh:'词义',meaning_ja:'意味',meaning_es:'significado',meaning_vi:'nghĩa'});
  Object.assign(examples,{example_zh:'例句',example_ja:'例文',example_es:'Ejemplo',example_vi:'Ví dụ'});
  for(const language of LANGUAGES) {
    assert.equal(localized(entry,'meaning',language),entry[`meaning_${language}`]);
    assert.deepEqual(exampleLines(examples,language),[{text:examples[language==='ko'?'example':`example_${language}`],lang:language,secondary:false}]);
  }
  assert.equal(localized(entry,'semantic_hint','en'),'English hint');
  assert.equal(localized({semantic_hint:'한국어 힌트'},'semantic_hint','en'),'');
  assert.equal(localized({meaning_ko:'한국어 뜻',meaning_en:'English meaning'},'meaning','ru'),copy.ru.translationMissing);
  assert.equal(localized({prompt_ko:'문맥',prompt_en:'Context'},'prompt','ru'),copy.ru.translationMissing);
  assert.deepEqual(exampleLines({example:'한국어 예문'},'ru'),[]);
});

test('Russian PDF contains Russian descriptions, components and examples without Korean or English descriptions',()=>{
  const word={word:'검은색',hanja:'검은色',level:'easy',meaning_ko:'한국어 뜻',meaning_en:'English meaning',meaning_ru:'чёрный цвет',semantic_hint:'한국어 힌트',semantic_hint_en:'English hint',semantic_hint_ru:'色[색] означает цвет.'};
  const result={word,example:'한국어 예문',example_en:'English example',example_ru:'Я выбрал чёрный цвет.',components:[{hanja:'色',readings:[{sound_ko:'색',sound_en:'saek',meaning_ko:['빛깔'],meaning_en:['color'],meaning_ru:['цвет']}]}]};
  const html=renderPrintableWordbook([{ref:word,result}],{lang:'ru',date:new Date(2026,10,17)});
  for(const text of ['Мой словарик','чёрный цвет','цвет','Я выбрал чёрный цвет.','ноября','검은색','saek'])assert(html.includes(text),text);
  for(const text of ['한국어 뜻','English meaning','한국어 힌트','English hint','한국어 예문','English example'])assert(!html.includes(text),text);
  const english=renderPrintableWordbook([{ref:word,result}],{lang:'en'});
  assert(english.includes('English meaning'));
  assert(!english.includes('한국어 뜻'));
});

test('Russian graph tooltips and category labels use Russian while preserving Korean headwords',()=>{
  const word={word:'물',hanja:'水',components:['水'],level:'easy',meaning_ko:'한국어 뜻',meaning_en:'English meaning',meaning_ru:'вода'};
  const graph={roots:['水'],words:[word],characters:[{hanja:'水',readings:[{sound_ko:'수',sound_en:'su',meaning_ko:['물'],meaning_en:['water'],meaning_ru:['вода']}]}]};
  const svg=renderNetworkSVG(layoutNetwork(graph,word),{lang:'ru',wordLabel:'Изучить слово',characterLabel:'Иероглиф',label:'Граф связей'});
  for(const text of ['вода','Базовая','Изучить слово','물','水','수'])assert(svg.includes(text),text);
  for(const text of ['한국어 뜻','English meaning','water','Easy'])assert(!svg.includes(text),text);
});
