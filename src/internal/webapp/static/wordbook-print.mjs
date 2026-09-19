import {wordKey, wordCategory} from './learning.mjs';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
const copy = {
  ko: {
    title:'나의 단어 모음', subtitle:'뜻을 읽고, 구성을 살피고, 오래 기억하기.',
    count:count=>`${count}개의 단어`, missing:'현재 사전에서 설명을 찾을 수 없어요. 저장한 표기는 그대로 남겨 두었어요.',
    meaning:'뜻풀이', hint:'이해의 실마리', characters:'구성 한자',
    easy:'기초', normal:'일반', hard:'심화', classical:'고전',
    note:'한자의 뜻과 독음은 단어와 문맥에 따라 달라질 수 있어요.',
    footer:'하나의 단어에서 시작되는 새로운 이해.',
  },
  en: {
    title:'My word collection', subtitle:'Read the meaning. Notice the parts. Remember the connection.',
    count:count=>`${count} ${count===1?'word':'words'}`, missing:'The description is unavailable in the current dictionary. Your saved spelling is preserved here.',
    meaning:'Meaning', hint:'A clue to the meaning', characters:'Hanja components',
    easy:'Easy', normal:'General', hard:'Advanced', classical:'Classical',
    note:'A character’s meanings and readings can vary with the word and context.',
    footer:'A new understanding starts with one word.',
  },
};

// Keep a successful font load for later previews; a failed load can be retried.
let printFontPromise;
export function loadWordbookPrintFont() {
  if(!printFontPromise) {
    const faces=[['Regular','400'],['SemiBold','600']].map(([name,weight])=>
      new FontFace('HanGraph Print',`url("/fonts/NotoSansKR-${name}.woff2")`,{
        weight,style:'normal',display:'swap',
      }));
    printFontPromise=Promise.all(faces.map(font=>font.load())).then(loaded=>{
      loaded.forEach(font=>document.fonts.add(font));
      return loaded;
    }).catch(error=>{printFontPromise=null;throw error;});
  }
  return printFontPromise;
}

// Query each spelling once, with at most six requests in flight. Preserve the
// original word/Hanja identity and order, including missing dictionary entries.
export async function loadPrintableWords(saved, getJSON, isCurrent = () => true) {
  const refs=saved.map(({word,hanja})=>({word,hanja}));
  const queries=[...new Set(refs.map(ref=>ref.word))], found=new Map();
  for(let i=0;i<queries.length;i+=6) {
    if(!isCurrent())return [];
    const results=await Promise.all(queries.slice(i,i+6).map(query=>getJSON('/api/words',query)));
    for(const matches of results)for(const result of matches)found.set(wordKey(result.word),result);
  }
  return refs.map(ref=>({ref, result:found.get(wordKey(ref))??null}));
}

export function wordbookPrintFilename(date = new Date()) {
  const stamp=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
  return `han-graph-words-${stamp}`;
}

function wordForm(value) {
  return Array.from(value??'').map(glyph=>/\p{Script=Han}/u.test(glyph)
    ? `<strong>${escape(glyph)}</strong>` : `<span>${escape(glyph)}</span>`).join('');
}

function characterDetails(components, language) {
  return components.map(component=>`<span class="print-character"><span class="print-glyph" lang="ko">${escape(component.hanja)}</span>${component.readings.map(reading=>`<span class="print-reading">[<strong lang="ko">${escape(reading.sound_ko)}</strong>/<span lang="en">${escape(reading.sound_en)}</span>] <span lang="${language}">${escape(reading[language==='ko'?'meaning_ko':'meaning_en'].join(', '))}</span></span>`).join(' / ')}</span>`).join(' · ');
}

export function renderPrintableWordbook(entries, {lang='ko', date=new Date()} = {}) {
  const language=lang==='en'?'en':'ko', labels=copy[language];
  const dateLabel=new Intl.DateTimeFormat(language==='ko'?'ko-KR':'en-GB',{year:'numeric',month:'long',day:'numeric'}).format(date);
  const counts=new Map();
  for(const {result} of entries)if(result)counts.set(wordCategory(result.word),(counts.get(wordCategory(result.word))??0)+1);
  const categories=['easy','normal','hard','classical'].filter(level=>counts.has(level));
  return `<section class="print-sheet" aria-label="${labels.title}">
    <header class="print-cover"><div class="print-masthead"><span>漢—GRAPH</span><span>WORDS, CONNECTED.</span></div>
      <p class="print-eyebrow">MY VOCABULARY NOTEBOOK</p><h1>${labels.title}</h1><p class="print-subtitle">${labels.subtitle}</p>
      <div class="print-meta"><strong>${labels.count(entries.length)}</strong><span>${escape(dateLabel)}</span></div>
      ${categories.length?`<p class="print-categories">${categories.map(level=>`${labels[level]} ${counts.get(level)}`).join(' · ')}</p>`:''}
    </header>
    <ol class="print-entries">${entries.map(({ref,result},index)=>{
      const word=result?.word??ref;
      return `<li class="print-entry"><article>
        <header class="print-entry-heading"><span class="print-number">${String(index+1).padStart(2,'0')}</span><div class="print-word-title"><h2 lang="ko">${escape(word.word)}</h2>${word.hanja?`<p class="print-word-form" lang="ko">${wordForm(word.hanja)}</p>`:''}</div>${result?`<span class="print-level">${labels[wordCategory(word)]}</span>`:''}</header>
        <div class="print-entry-content">${result?`<div class="print-definition"><h3>${labels.meaning}</h3><p lang="ko">${escape(word.meaning_ko)}</p><p class="print-english" lang="en">${escape(word.meaning_en)}</p></div>
          ${word.semantic_hint?`<div class="print-hint"><h3>${labels.hint}</h3><p lang="ko">${escape(word.semantic_hint)}</p></div>`:''}
          ${result.components?.length?`<div class="print-breakdown"><h3>${labels.characters}</h3> | <div class="print-characters">${characterDetails(result.components,language)}</div></div>`:''}`
          :`<p class="print-missing">${labels.missing}</p>`}</div>
      </article></li>`;
    }).join('')}</ol>
    <footer class="print-colophon"><p>${labels.note}</p><div><strong>漢—GRAPH</strong><span>${labels.footer}</span></div></footer>
  </section>`;
}
