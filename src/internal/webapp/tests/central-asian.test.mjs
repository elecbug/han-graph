import test from 'node:test';
import assert from 'node:assert/strict';
import {copy, localized, localizedDate, countText, normalizeLanguage} from '../static/localization.mjs';
import {exampleLines} from '../static/examples.mjs';
import {renderPrintableWordbook} from '../static/wordbook-print.mjs';
import {wordFormPayload,emptyWordDraft,findMissingCharacters,addMissingCharacters} from '../static/dictionary-form.mjs';
import {layoutNetwork,renderNetworkSVG} from '../static/network.mjs';

const word={word:'학습노트',hanja:'學習노트',level:'normal',components:['學','習'],meaning_ko:'한국어 뜻',meaning_en:'English meaning',meaning_ru:'Русское значение',meaning_uz:'oʻquv daftari',meaning_ky:'окуу дептери',semantic_hint:'한국어 힌트',semantic_hint_en:'English hint',semantic_hint_ru:'Русская подсказка',semantic_hint_uz:'Soʻzni oʻrganish uchun daftar.',semantic_hint_ky:'Сөздү үйрөнүү үчүн дептер.'};
const result={word,example:'한국어 예문',example_en:'English example',example_ru:'Русский пример',example_uz:'Soʻzni daftarimga yozdim.',example_ky:'Сөздү дептериме жаздым.',components:[{hanja:'學',readings:[{sound_ko:'학',sound_en:'hak',meaning_ko:['배우다'],meaning_en:['learn'],meaning_ru:['учиться'],meaning_uz:['oʻrganmoq'],meaning_ky:['үйрөнүү']}]}]};

const additionalLocales={
  zh:['学习笔记本','记录学到的内容。','我记下了新词。','学习'],
  ja:['学習ノート','学んだことをまとめる。','新しい単語を書き留めました。','学ぶ'],
  es:['cuaderno de estudio','Sirve para organizar lo aprendido.','Anoté las palabras nuevas.','aprender'],
  ne:['अध्ययन कापी','यसमा सिकेका कुरा टिपिन्छन्।','मैले नयाँ शब्द टिपेँ।','सिक्नु'],
  mn:['сургалтын дэвтэр','Сурснаа бичихэд хэрэглэнэ.','Шинэ үгсээ тэмдэглэлээ.','сурах'],
  th:['สมุดเรียน','ใช้จดสิ่งที่เรียนรู้','ฉันจดคำศัพท์ใหม่','เรียนรู้'],
  vi:['vở học tập','Dùng để ghi lại kiến thức đã học.','Tôi ghi lại các từ mới.','học'],
};
for(const [language,[meaning,hint,example,character]] of Object.entries(additionalLocales)) {
  word[`meaning_${language}`]=meaning;
  word[`semantic_hint_${language}`]=hint;
  result[`example_${language}`]=example;
  result.components[0].readings[0][`meaning_${language}`]=[character];
}
for(const language of ['uz','ky',...Object.keys(additionalLocales)]) {
  test(`${language} uses its own meanings, examples, PDF and fallback labels`,()=>{
    assert.equal(normalizeLanguage(language),language);
    assert.equal(localized(word,'meaning',language),word[`meaning_${language}`]);
    assert.deepEqual(exampleLines(result,language),[{text:result[`example_${language}`],lang:language,secondary:false}]);
    assert.equal(localized({meaning_ko:'한국어 뜻',meaning_en:'English meaning'},'meaning',language),copy[language].translationMissing);
    const html=renderPrintableWordbook([{ref:word,result}],{lang:language,date:new Date(2026,10,17)});
    for(const text of [word[`meaning_${language}`],word[`semantic_hint_${language}`],result[`example_${language}`],result.components[0].readings[0][`meaning_${language}`][0]])assert(html.includes(text),text);
    for(const text of ['한국어 뜻','English meaning','Русское значение','Русская подсказка','한국어 예문','English example'])assert(!html.includes(text),text);
    assert(!html.includes('undefined'));
    assert(html.includes(localizedDate(new Date(2026,10,17),language)));
  });
  test(`${language} remains local in graph categories and accessible meanings`,()=>{
    const network={roots:['學'],words:[word],characters:[result.components[0],{hanja:'習',readings:[]}]};
    const svg=renderNetworkSVG(layoutNetwork(network,word),{lang:language});
    assert(svg.includes(copy[language].levelNormal));assert(svg.includes(word[`meaning_${language}`]));
    assert(svg.includes(copy[language].graphRegion));assert(svg.includes(copy[language].openWord));
    assert(!svg.includes('English meaning'));assert(!svg.includes('Русское значение'));
  });
}

test('all four new translations survive word, example and character registration', async () => {
  const draft = {...emptyWordDraft(), ...word, example_ko: '학습노트에 썼어요.'};
  for (const language of Object.keys(additionalLocales)) {
    draft[`example_${language}`] = result[`example_${language}`];
  }
  const payload = wordFormPayload(draft);
  const missing = await findMissingCharacters(payload.words[0], async () => []);
  for (const character of missing) {
    Object.assign(character, {meaning_ko: '배우다', meaning_en: 'learn'});
    for (const [language, values] of Object.entries(additionalLocales)) {
      character[`meaning_${language}`] = values[3];
    }
  }
  const groups = [{id:'hak', sound_ko:'학'}, {id:'seup', sound_ko:'습'}];
  const registered = addMissingCharacters(payload, missing, groups, () => '9001');
  for (const [language, [meaning, , example, character]] of Object.entries(additionalLocales)) {
    assert.equal(registered.words[0][`meaning_${language}`], meaning);
    assert.equal(registered.examples[0][`example_${language}`], example);
    assert.deepEqual(registered.characters[0][`meaning_${language}`], [character]);
  }
});

test('browsers without Kyrgyz date support use a numeric date instead of another language',()=>{
  const supported = Intl.DateTimeFormat.supportedLocalesOf;
  try {
    Intl.DateTimeFormat.supportedLocalesOf = () => [];
    assert.equal(localizedDate(new Date(2026,10,7),'ky'),'07.11.2026');
  } finally {
    Intl.DateTimeFormat.supportedLocalesOf = supported;
  }
});

test('Uzbek and Kyrgyz translations are optional but retained in the friendly registration form',async()=>{
  const draft={...emptyWordDraft(),...word,example_ko:'학습노트에 썼어요.',example_uz:result.example_uz,example_ky:result.example_ky};
  const payload=wordFormPayload(draft);
  assert.equal(payload.words[0].meaning_uz,word.meaning_uz);assert.equal(payload.words[0].meaning_ky,word.meaning_ky);
  assert.equal(payload.examples[0].example_ky,result.example_ky);
  const missing=await findMissingCharacters(payload.words[0],async()=>[]);
  for(const item of missing)Object.assign(item,{meaning_ko:'뜻',meaning_en:'meaning',meaning_uz:'maʼno',meaning_ky:'маани'});
  const registered=addMissingCharacters(payload,missing,[{id:'hak',sound_ko:'학',sound_en:'hak'},{id:'seup',sound_ko:'습',sound_en:'seup'}],()=> '9001');
  assert.deepEqual(registered.characters[0].meaning_uz,['maʼno']);assert.deepEqual(registered.characters[1].meaning_ky,['маани']);
  const noOptional=wordFormPayload({...emptyWordDraft(),word:'물',hanja:'水',meaning_ko:'물',meaning_en:'water'});
  assert(!Object.hasOwn(noOptional.words[0],'meaning_uz'));
  assert.throws(()=>wordFormPayload({...draft,example_ko:''}),error=>error.code==='wordFormExample');
  assert.equal(countText(2,'words','uz'),'2 ta soʻz');assert.equal(countText(2,'words','ky'),'2 сөз');
});
