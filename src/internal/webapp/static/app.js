import {wordKey, normalizeSaved, createSession, answerQuestion, sessionResult} from './learning.mjs';
import {createDataClient} from './data-client.mjs';
import {layoutNetwork, renderNetworkSVG} from './network.mjs';
import {bindNetworkDrag} from './network-view.mjs';

let seed = {};
try { seed = JSON.parse(document.getElementById('bootstrap-data')?.textContent ?? '{}'); } catch { /* Fall back to the API. */ }
const getJSON = createDataClient({origin: location.origin, seed});

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
const icons = {
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>',
  bookmark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4Z"/></svg>',
};
const copy = {
  ko: {
    workspace:'나의 학습 공간', explore:'단어 탐색', practice:'문맥 연습', saved:'내 단어장', sidebarQuote:'한 글자를 이해하면,<br>더 많은 단어가 보여요.', sidebarSub:'작은 연결에서 시작하는 한국어', local:'나만의 한국어 학습 공간', footer:'하나의 단어에서 시작되는 새로운 이해.',
    exploreTitle:'뜻을 따라, 단어를 연결해요.', exploreSub:'하나의 한자를 이해하면, 새로운 단어가 보입니다.', exploreEye:'EXPLORE THE CONNECTIONS', wordsReady:'탐색할 단어', search:'단어, 한자, 뜻을 찾아보세요', clear:'검색 지우기', browseLabel:'작은 연결에서 시작해 보세요', words:'단어', characters:'한자', entries:'개', searchResults:'검색 결과', limited:'일부 결과를 표시하고 있어요. 검색어를 더 구체적으로 입력해 주세요.',
    noResults:'일치하는 항목이 없어요.', searchHint:'다른 단어, 한자 또는 영어 뜻으로 찾아보세요.', wordTag:'WORD EXPLORER', charTag:'CHARACTER EXPLORER', save:'저장하기', savedButton:'저장됨', removed:'단어장에서 삭제했어요.', added:'내 단어장에 저장했어요.', maxSaved:'단어장에 최대 500개까지 저장할 수 있어요.', storageFailed:'이 브라우저에서는 저장할 수 없어 이번 방문 동안만 유지됩니다.',
    breakDown:'단어를 이루는 한자', tapCharacter:'한자를 누르면 그래프에서 강조해요', readingNote:'한자의 뜻은 단어와 문맥에 따라 달라질 수 있어요.', connections:'같은 한자, 다른 단어', graphHint:'한자는 원으로, 단어는 선 위에 표시해요. 각각 눌러서 탐색해 보세요.', graphScope:'선택한 한자에서 한 번 연결되는 모든 단어', zoomIn:'확대', zoomOut:'축소', fitGraph:'전체 보기', graphPan:'드래그하거나 그래프에 초점을 두고 방향키로 이동해요. 휠은 페이지를 스크롤해요.', graphRegion:'한자와 단어 연결 그래프', graphSelected:'선택 단어의 구성 한자', currentWord:'선택한 단어', noConnections:'아직 연결된 단어가 없어요.', noConnectionsSub:'이 한자의 단어는 앞으로 채워 갈 예정이에요.', readings:'독음과 뜻', notFound:'이 항목을 찾을 수 없어요.', notFoundSub:'검색 목록에서 다른 항목을 선택해 주세요.',
    savedTitle:'기억하고 싶은 단어들.', savedSub:'다시 만나고 싶은 단어를 한곳에 모아 보세요.', savedEye:'YOUR WORD COLLECTION', storageNote:'단어장은 이 브라우저에 저장됩니다. 다른 기기와는 동기화되지 않아요.', savedEmpty:'아직 모아 둔 단어가 없어요.', savedEmptySub:'탐색 중 마음에 남는 단어를 저장해 보세요.', startExplore:'단어 탐색하기', openWord:'단어 살펴보기', remove:'저장 취소', missingSaved:'현재 데이터에서 찾을 수 없는 저장 항목',
    practiceTitle:'문맥에서 뜻을 발견해요.', practiceSub:'한자의 뜻과 문장의 단서를 함께 살펴보세요.', practiceEye:'A LITTLE PRACTICE', introTitle:'읽고, 추론하고, 이해하기', introSub:'짧은 상황을 읽고 어울리는 단어를 골라 보세요. 한자 구성과 해설을 통해 선택의 이유를 확인할 수 있어요.', step1:'상황 읽기', step2:'단어 선택', step3:'해설 확인', startPractice:'연습 시작하기', questions:'문항', practiceDraft:'기존 어휘로 만든 기초 연습 · 예문 검수 전', chooseWord:'이 상황에 어울리는 단어는 무엇일까요?', pickOnce:'답을 고르면 해설이 나타나요.', showTranslation:'영어 번역 보기', hideTranslation:'영어 번역 접기', correct:'잘 이해했어요!', incorrect:'이 단어의 뜻을 함께 살펴볼까요?', yourChoice:'내가 고른 답', answer:'정답', next:'다음 문항', finish:'결과 보기', exitPractice:'탐색으로 돌아가기', practiceNote:'진행 중인 연습은 페이지를 새로고침하면 초기화됩니다.', summaryTitle:'연결을 한 걸음 더 이해했어요.', summarySub:'맞힌 개수보다, 단어의 뜻을 설명할 수 있는지가 중요해요.', restart:'다시 연습하기', review:'다시 살펴볼 단어', allCorrect:'모든 문항을 맞혔어요. 배운 단어에서 새로운 연결을 찾아보세요.', latest:'지난 연습', loading:'단어의 연결을 불러오고 있어요…', errorTitle:'연결을 불러오지 못했어요.', errorSub:'서버가 실행 중인지 확인하고 다시 시도해 주세요.', retry:'다시 시도', looking:'찾고 있어요…',
  },
  en: {
    workspace:'YOUR LEARNING SPACE', explore:'Explore', practice:'Practice', saved:'My words', sidebarQuote:'Understand one character.<br>Discover a world of words.', sidebarSub:'Korean, one connection at a time', local:'Your Korean learning space', footer:'A new understanding starts with one word.',
    exploreTitle:'Follow the meaning. Find a connection.', exploreSub:'Understand a character, and see Korean words in a new way.', exploreEye:'EXPLORE THE CONNECTIONS', wordsReady:'words to explore', search:'Search a word, character, or meaning', clear:'Clear search', browseLabel:'Start with a small connection', words:'Words', characters:'Characters', entries:'', searchResults:'Search results', limited:'Showing a selection. Refine your search to find more.',
    noResults:'No matches yet.', searchHint:'Try another Korean word, character, or English meaning.', wordTag:'WORD EXPLORER', charTag:'CHARACTER EXPLORER', save:'Save word', savedButton:'Saved', removed:'Removed from your words.', added:'Added to your words.', maxSaved:'You can save up to 500 words.', storageFailed:'Storage is unavailable. Your changes will last for this visit only.',
    breakDown:'The characters inside', tapCharacter:'Select a character to highlight it in the graph', readingNote:'A character’s meaning can change with the word and context.', connections:'One character. More connections.', graphHint:'Circles are characters; words label the lines. Select either to explore.', graphScope:'All words one connection from the selected characters', zoomIn:'Zoom in', zoomOut:'Zoom out', fitGraph:'Fit all', graphPan:'Drag to move, or focus the graph and use arrow keys. Scroll the wheel to move the page.', graphRegion:'Character and word connection graph', graphSelected:'Characters in the selected word', currentWord:'Selected word', noConnections:'No connected words yet.', noConnectionsSub:'Vocabulary for this character will be added over time.', readings:'Readings and meanings', notFound:'This entry could not be found.', notFoundSub:'Choose another entry from the search results.',
    savedTitle:'Words worth coming back to.', savedSub:'Keep the connections you want to remember.', savedEye:'YOUR WORD COLLECTION', storageNote:'Your collection is saved in this browser. It does not sync to other devices.', savedEmpty:'Your collection starts here.', savedEmptySub:'Save a word as you explore to find it here later.', startExplore:'Explore words', openWord:'Explore this word', remove:'Remove saved word', missingSaved:'Saved entries no longer in the current dataset',
    practiceTitle:'Find meaning in context.', practiceSub:'Bring the character meanings and sentence clues together.', practiceEye:'A LITTLE PRACTICE', introTitle:'Read. Infer. Understand.', introSub:'Read a short situation and choose the word that fits. Then discover why through character meanings and a short explanation.', step1:'Read the context', step2:'Choose a word', step3:'See why', startPractice:'Start practicing', questions:'questions', practiceDraft:'Introductory practice with seed vocabulary · Draft examples', chooseWord:'Which word fits this situation?', pickOnce:'Choose an answer to reveal the explanation.', showTranslation:'Show English translation', hideTranslation:'Hide English translation', correct:'You’ve got it!', incorrect:'Let’s take a closer look.', yourChoice:'Your choice', answer:'Answer', next:'Next question', finish:'See results', exitPractice:'Back to exploring', practiceNote:'An unfinished practice session resets when you reload the page.', summaryTitle:'One step closer to understanding.', summarySub:'More than a score, it’s about knowing why a word means what it does.', restart:'Practice again', review:'Words to revisit', allCorrect:'You got every question right. Keep exploring new connections with these words.', latest:'Last practice', loading:'Loading your word connections…', errorTitle:'We couldn’t load the connections.', errorSub:'Check that the server is running, then try again.', retry:'Try again', looking:'Searching…',
  },
};
function readStorage(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
const state = {
  lang: readStorage('han-graph.language', 'ko') === 'en' ? 'en' : 'ko',
  saved: normalizeSaved(readStorage('han-graph.words.v1', [])),
  page:'explore', query:'', tab:'words', search:null, stats:null, practice:null,
  selection:null, detail:null, glyph:null, session:null, index:0, translation:false,
  ready:false,
};
let pageEpoch=0, detailEpoch=0, searchEpoch=0, searchTimer, toastTimer;
const t = key => copy[state.lang][key] ?? key;
const meaning = word => word[state.lang === 'ko' ? 'meaning_ko' : 'meaning_en'];
function saveStorage(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { toast(t('storageFailed')); return false; } }
function toast(message) { clearTimeout(toastTimer); $('#toast').textContent=message; $('#toast').classList.add('show'); toastTimer=setTimeout(()=>$('#toast').classList.remove('show'), 3500); }
function updateShell() {
  document.documentElement.lang=state.lang;
  document.title=`漢-Graph · ${t(state.page)}`;
  document.querySelectorAll('[data-i18n]').forEach(element => element.innerHTML=t(element.dataset.i18n));
  document.querySelectorAll('.nav-link').forEach(link => {
    const active=link.dataset.page===state.page;
    link.classList.toggle('active', active);
    if(active) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current');
  });
  $('#page-label').textContent=t(state.page);
  $('#saved-count').textContent=state.saved.length;
  $('#language').innerHTML=state.lang==='ko'?'KO <span>/ EN</span>':'EN <span>/ KO</span>';
  $('#language').setAttribute('aria-label',state.lang==='ko'?'Switch to English':'한국어로 전환');
}
const hero = (eye,title,sub,count='') => `<section class="page-hero"><div><div class="eyebrow">${t(eye)}</div><h1>${t(title)}</h1><p>${t(sub)}</p></div>${count}</section>`;
const errorPanel = () => `<div class="empty-state" role="alert"><span class="empty-glyph">連</span><h2>${t('errorTitle')}</h2><p>${t('errorSub')}</p><button class="primary-button" data-action="retry">${t('retry')}</button></div>`;
const wordAttrs = word => `data-word="${esc(word.word)}" data-hanja="${esc(word.hanja)}"`;
const isSaved = word => state.saved.some(saved => wordKey(saved)===wordKey(word));
function routeWord(word) { location.hash=`explore?${new URLSearchParams({word:word.word,hanja:word.hanja})}`; }
function routeCharacter(glyph) { location.hash=`explore?${new URLSearchParams({character:glyph})}`; }

async function renderPage({revealSelection=false} = {}) {
  if (!state.ready) return;
  const epoch=++pageEpoch;
  detailEpoch++;
  const [page, query=''] = location.hash.slice(1).split('?');
  const previousPage=state.page;
  state.page=['explore','practice','saved'].includes(page)?page:'explore';
  if(previousPage!==state.page)window.scrollTo({top:0});
  updateShell();
  if (state.page==='practice') { renderPractice(); return; }
  if (state.page==='saved') { await renderSaved(epoch); return; }
  const params=new URLSearchParams(query);
  if (params.get('word')) state.selection={kind:'word',word:params.get('word'),hanja:params.get('hanja')};
  else if(params.get('character')) state.selection={kind:'character',glyph:params.get('character')};
  else if(!state.selection) { const word=state.search.words.find(word=>word.word==='가정')??state.search.words[0]; if(word)state.selection={kind:'word',...word}; }
  $('#main').innerHTML=`${hero('exploreEye','exploreTitle','exploreSub',`<div class="hero-counter"><strong>${state.stats.words}</strong><span>${t('wordsReady')}</span></div>`)}
    <form class="search-form" role="search" id="search-form">${icons.search}<input id="search" type="search" maxlength="100" value="${esc(state.query)}" placeholder="${t('search')}" aria-label="${t('search')}" autocomplete="off"><button class="search-clear" type="button" data-action="clear-search" aria-label="${t('clear')}">×</button><kbd class="search-shortcut">/</kbd></form>
    <div class="section-bar"><span>${t('browseLabel')}</span><span>${state.stats.characters.toLocaleString(state.lang)} ${t('characters')} · ${state.stats.words} ${t('words')}</span></div>
    <div class="explorer"><section class="catalog" aria-label="${t('searchResults')}"><div id="catalog"></div></section><section class="detail-panel" id="detail" aria-label="${t('openWord')}"></section></div>`;
  $('#search-form').addEventListener('submit', event=>{event.preventDefault();clearTimeout(searchTimer);performSearch();});
  $('#search').addEventListener('input', event=>{state.query=event.target.value;clearTimeout(searchTimer);searchTimer=setTimeout(performSearch,180);});
  renderCatalog();
  if(state.selection) await loadDetail(state.selection); else $('#detail').innerHTML=`<div class="empty-state">${t('notFoundSub')}</div>`;
  if(revealSelection && query && epoch===pageEpoch && state.page==='explore') {
    const heading=$('#detail .word-title');
    if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}
    $('#detail').scrollIntoView({block:'start'});
  }
}

function renderCatalog() {
  if(!$('#catalog') || !state.search)return;
  const result=state.search;
  const list=state.tab==='words'?result.words:result.characters;
  const count=state.tab==='words'?result.word_count:result.character_count;
  const items=list.map(item=>{
    const word=state.tab==='words';
    const selected=word?state.selection?.kind==='word'&&state.selection.word===item.word&&state.selection.hanja===item.hanja:state.selection?.kind==='character'&&state.selection.glyph===item.hanja;
    const title=word?item.word:`${item.hanja} · ${item.sound_ko}`;
    const sub=word?meaning(item):item[state.lang==='ko'?'meaning_ko':'meaning_en'].join(', ');
    return `<button class="catalog-item ${selected?'selected':''}" data-action="${word?'open-word':'open-character'}" ${word?wordAttrs(item):`data-glyph="${esc(item.hanja)}"`} ${selected?'aria-current="true"':''}><span class="item-main"><span class="item-title">${esc(title)}</span><span class="item-sub">${esc(sub)}</span></span>${word?`<span class="item-hanja">${esc(item.hanja)}</span>`:''}${selected?'<span class="item-arrow">↗</span>':''}</button>`;
  }).join('');
  $('#catalog').innerHTML=`<div class="catalog-tabs" role="group" aria-label="${t('searchResults')}"><button data-action="tab" data-tab="words" class="${state.tab==='words'?'active':''}" aria-pressed="${state.tab==='words'}">${t('words')}<span class="tab-count">${result.word_count}</span></button><button data-action="tab" data-tab="characters" class="${state.tab==='characters'?'active':''}" aria-pressed="${state.tab==='characters'}">${t('characters')}<span class="tab-count">${result.character_count}</span></button></div><div class="catalog-list">${items||`<div class="empty-state"><p>${t('noResults')}</p><p>${t('searchHint')}</p></div>`}</div><div class="list-footnote" aria-live="polite">${count>list.length?t('limited'):`${t('searchResults')} · ${count} ${t('entries')}`}</div>`;
}
async function performSearch() {
  const epoch=++searchEpoch;
  const query=state.query;
  const note=$('.list-footnote'); if(note)note.textContent=t('looking');
  try {
    const result=await getJSON('/api/search',query);
    if(epoch!==searchEpoch || query!==state.query)return;
    state.search=result;
    if(!result.words.length && result.characters.length)state.tab='characters';
    else if(!result.characters.length && result.words.length)state.tab='words';
    renderCatalog();
  } catch {
    if(epoch===searchEpoch && $('.list-footnote')) $('.list-footnote').innerHTML=`${t('errorTitle')} <button class="text-button" data-action="search-retry">${t('retry')}</button>`;
  }
}

async function loadDetail(selection) {
  const epoch=++detailEpoch;
  state.selection=selection;
  renderCatalog();
  $('#detail').innerHTML=`<div class="loading-panel" role="status">${t('loading')}</div>`;
  try {
    let wordResult=null, glyph=selection.glyph;
    if(selection.kind==='word') {
      const results=await getJSON('/api/words',selection.word);
      wordResult=results.find(result=>!selection.hanja || result.word.hanja===selection.hanja);
      if(!wordResult)throw new RangeError('missing');
      glyph=wordResult.word.components.includes(state.glyph)?state.glyph:wordResult.word.components[0];
    }
    const [characters,network]=await Promise.all([
      getJSON('/api/characters',glyph),
      getJSON('/api/neighborhood',wordResult?.word.hanja ?? glyph),
    ]);
    if(!characters.length)throw new RangeError('missing');
    if(epoch!==detailEpoch || state.page!=='explore')return;
    state.glyph=characters[0].hanja;
    state.detail={wordResult,characters,network,layout:layoutNetwork(network,wordResult?.word),zoom:null};
    renderDetail();
  } catch(error) {
    if(epoch!==detailEpoch || !$('#detail'))return;
    $('#detail').innerHTML=error instanceof RangeError?`<div class="empty-state"><h2>${t('notFound')}</h2><p>${t('notFoundSub')}</p></div>`:errorPanel();
  }
}
function renderDetail() {
  if(!$('#detail') || !state.detail)return;
  const viewport=$('.network-viewport');
  const position=viewport&&state.detail.zoom?networkCenter(viewport):null;
  const {wordResult,characters}=state.detail;
  const character=characters[0];
  let card;
  if(wordResult) {
    const word=wordResult.word;
    card=`<div class="word-heading"><div class="word-heading-top"><span class="tag">${t('wordTag')}</span><button class="save-button ${isSaved(word)?'saved':''}" data-action="save" ${wordAttrs(word)} aria-pressed="${isSaved(word)}">${icons.bookmark}${t(isSaved(word)?'savedButton':'save')}</button></div><div class="word-title-row"><div><h2 class="word-title" lang="ko">${esc(word.word)}</h2><p class="word-meaning">${esc(meaning(word))}</p><p class="word-meaning-en">${esc(state.lang==='ko'?word.meaning_en:word.meaning_ko)}</p></div><span class="word-hanja" lang="ko">${esc(word.hanja)}</span></div></div>
      <div class="components-section"><div class="subheading"><h2>${t('breakDown')}</h2><span>${t('tapCharacter')}</span></div><div class="component-grid">${wordResult.components.map(component=>`<button class="component-card ${component.hanja===state.glyph?'active':''}" data-action="component" data-glyph="${esc(component.hanja)}" aria-pressed="${component.hanja===state.glyph}"><span class="glyph" lang="ko">${esc(component.hanja)}</span><span class="sound">${esc(component.readings.map(reading=>`${reading.sound_ko} · ${reading.sound_en}`).join(' / '))}</span><span class="meaning">${esc(component.readings.map(reading=>reading[state.lang==='ko'?'meaning_ko':'meaning_en'].join(', ')).join(' / '))}</span></button>`).join('<span class="component-plus" aria-hidden="true">+</span>')}</div>${word.semantic_hint?`<p class="semantic-hint">${esc(word.semantic_hint)}</p>`:''}<p class="learning-tip"><span aria-hidden="true">◇</span>${t('readingNote')}</p></div>`;
  } else {
    card=`<div class="word-heading"><div class="word-heading-top"><span class="tag">${t('charTag')}</span></div><div class="word-title-row"><div><h2 class="word-title">${esc(characters.map(c=>c.sound_ko).join(' / '))}</h2><p class="word-meaning">${esc(characters.map(c=>c[state.lang==='ko'?'meaning_ko':'meaning_en'].join(', ')).join(' / '))}</p><p class="word-meaning-en">${esc(characters.map(c=>c[state.lang==='ko'?'meaning_en':'meaning_ko'].join(', ')).join(' / '))}</p></div><span class="word-hanja">${esc(character.hanja)}</span></div></div><div class="components-section"><h3>${t('readings')}</h3>${characters.map(c=>`<p class="word-meaning-en">${esc(c.sound_ko)} · ${esc(c.sound_en)} — ${esc(c.meaning_ko.join(', '))} / ${esc(c.meaning_en.join(', '))}</p>`).join('')}<p class="learning-tip"><span>◇</span>${t('readingNote')}</p></div>`;
  }
  $('#detail').innerHTML=`<article class="word-card">${card}</article>${renderNetwork()}`;
  sizeNetwork(undefined,position);
  bindNetworkDrag($('.network-viewport'), {
    getPosition:()=>state.detail.pan,
    onPan:position=>{state.detail.fit=false;moveNetwork(position);},
  });
}
function renderNetwork() {
  const {network,layout}=state.detail;
  const svg=renderNetworkSVG(layout,{lang:state.lang,highlighted:state.glyph,wordLabel:t('openWord'),characterLabel:t('characters'),label:t('graphRegion')});
  return `<section class="network-section"><div class="subheading"><h2>${t('connections')}</h2><span>${network.characters.length} ${t('characters')} · ${network.words.length} ${t('words')}</span></div><p class="network-scope">${t('graphScope')}</p><div class="network-card"><div class="network-toolbar"><span class="network-key"><i></i>${t(state.detail.wordResult?'graphSelected':'characters')}</span><div class="network-controls"><button data-action="network-out" aria-label="${t('zoomOut')}" title="${t('zoomOut')}">−</button><output id="network-scale" aria-live="polite"></output><button data-action="network-in" aria-label="${t('zoomIn')}" title="${t('zoomIn')}">+</button><button data-action="network-fit">${t('fitGraph')}</button></div></div><div class="network-viewport" tabindex="0" role="region" aria-label="${t('graphRegion')}. ${t('graphPan')}"><div class="network-canvas">${svg}</div></div>${network.words.length?'':`<div class="empty-state"><h3>${t('noConnections')}</h3><p>${t('noConnectionsSub')}</p></div>`}<div class="network-caption"><span class="legend-dot"></span><span>${t('graphHint')}<br>${t('graphPan')}</span></div></div></section>`;
}
function networkCenter(viewport) {
  const {pan,zoom}=state.detail;
  return {x:(viewport.clientWidth/2-pan.x)/zoom,y:(viewport.clientHeight/2-pan.y)/zoom};
}
function moveNetwork(position) {
  state.detail.pan=position;
  $('.network-canvas').style.transform=`translate(${position.x}px,${position.y}px)`;
}
function sizeNetwork(action,position) {
  const viewport=$('.network-viewport'), canvas=$('.network-canvas');
  if(!viewport||!canvas||!state.detail)return;
  const {layout}=state.detail, oldZoom=state.detail.zoom;
  const fit=oldZoom===null||action==='network-fit';
  const center=fit?{x:layout.width/2,y:layout.height/2}:position??networkCenter(viewport);
  let zoom=oldZoom??Math.min(1,viewport.clientWidth/layout.width,520/layout.height);
  if(action==='network-in')zoom=Math.min(2,zoom*1.25);
  if(action==='network-out')zoom=Math.max(0.1,zoom/1.25);
  if(action==='network-fit')zoom=Math.min(1,viewport.clientWidth/layout.width,520/layout.height);
  if(fit)state.detail.fit=true;
  else if(action==='network-in'||action==='network-out')state.detail.fit=false;
  state.detail.zoom=zoom;
  canvas.style.width=`${layout.width*zoom}px`;
  canvas.style.height=`${layout.height*zoom}px`;
  viewport.style.height=`${Math.min(560,Math.max(320,layout.height*zoom))}px`;
  $('#network-scale').textContent=`${Math.round(zoom*100)}%`;
  moveNetwork({x:viewport.clientWidth/2-center.x*zoom,y:viewport.clientHeight/2-center.y*zoom});
}
function changeComponent(glyph) {
  if(!state.detail)return;
  const component=state.detail.network.characters.find(character=>character.hanja===glyph);
  if(!component)return;
  state.glyph=glyph;
  state.detail.characters=component.readings.map(reading=>({...reading,words:state.detail.network.words.filter(word=>word.components.includes(glyph))}));
  renderDetail();
  $(`.component-card[data-glyph="${CSS.escape(glyph)}"]`)?.focus({preventScroll:true});
}
function toggleSaved(ref) {
  const exists=isSaved(ref);
  if(!exists && state.saved.length>=500){toast(t('maxSaved'));return;}
  state.saved=exists?state.saved.filter(word=>wordKey(word)!==wordKey(ref)):[...state.saved,{word:ref.word,hanja:ref.hanja}];
  if(saveStorage('han-graph.words.v1',state.saved))toast(t(exists?'removed':'added'));
  updateShell();
  if(state.page==='saved')renderSaved(++pageEpoch); else renderDetail();
}
async function renderSaved(epoch) {
  $('#main').innerHTML=`${hero('savedEye','savedTitle','savedSub')}<p class="storage-note">${t('storageNote')}</p><div id="saved-list" class="loading-panel" role="status">${t('loading')}</div>`;
  const results=await Promise.allSettled(state.saved.map(async ref=>{
    const matches=await getJSON('/api/words',ref.word);
    return matches.find(match=>wordKey(match.word)===wordKey(ref))?.word;
  }));
  if(epoch!==pageEpoch || state.page!=='saved')return;
  if(results.some(result=>result.status==='rejected')) {$('#saved-list').innerHTML=errorPanel();return;}
  const words=results.map(result=>result.value).filter(Boolean);
  $('#saved-list').className='';$('#saved-list').removeAttribute('role');
  const missing=state.saved.filter(ref=>!words.some(word=>wordKey(ref)===wordKey(word)));
  $('#saved-list').innerHTML=words.length?`<div class="saved-grid">${words.map(word=>`<article class="saved-card"><div class="saved-top"><span class="word-hanja">${esc(word.hanja)}</span><button class="save-button saved" data-action="save" ${wordAttrs(word)} aria-label="${t('remove')}: ${esc(word.word)}">${icons.bookmark}</button></div><h2>${esc(word.word)}</h2><p>${esc(meaning(word))}</p><button class="text-button" data-action="open-word" ${wordAttrs(word)}>${t('openWord')} ↗</button></article>`).join('')}</div>`:`<div class="empty-state"><span class="empty-glyph">記</span><h2>${t('savedEmpty')}</h2><p>${t('savedEmptySub')}</p><a class="primary-button" href="#explore">${t('startExplore')} →</a></div>`;
  if(missing.length)$('#saved-list').innerHTML+=`<div class="storage-note">${t('missingSaved')}: ${missing.map(word=>`<button class="text-button" data-action="save" ${wordAttrs(word)}>${esc(word.word)} (${t('remove')})</button>`).join(', ')}</div>`;
}

function renderPractice() {
  const head=hero('practiceEye','practiceTitle','practiceSub');
  if(!state.session) {
    const last=readStorage('han-graph.practice.v1',null);
    const validLast=last&&Number.isInteger(last.correct)&&Number.isInteger(last.total)&&last.total>0&&last.correct>=0&&last.correct<=last.total;
    $('#main').innerHTML=`${head}<div class="practice-wrap"><section class="practice-intro"><div class="practice-art" aria-hidden="true"><span>文</span><i>＋</i><span>脈</span></div><h2>${t('introTitle')}</h2><p>${t('introSub')}</p><div class="practice-steps"><span><b>1</b>${t('step1')}</span><span><b>2</b>${t('step2')}</span><span><b>3</b>${t('step3')}</span></div><button class="primary-button" data-action="start-practice">${t('startPractice')} →</button><p class="practice-meta">${state.practice.questions.length} ${t('questions')} · ${t('practiceDraft')}</p>${validLast?`<p class="practice-meta">${t('latest')}: ${last.correct} / ${last.total}</p>`:''}</section></div>`;
    return;
  }
  const result=sessionResult(state.session);
  if(state.index>=state.session.questions.length){renderSummary(head,result);return;}
  const question=state.session.questions[state.index], answer=state.session.answers.get(question.id);
  $('#main').innerHTML=`${head}<div class="practice-wrap"><div class="practice-progress"><span>${String(state.index+1).padStart(2,'0')} / ${state.session.questions.length}</span><span>${t('practice')}</span></div><div class="progress-track" role="progressbar" aria-label="${t('practice')}" aria-valuenow="${result.answered}" aria-valuemin="0" aria-valuemax="${result.total}"><div class="progress-fill" style="width:${result.answered/result.total*100}%"></div></div><section class="question-card"><div class="eyebrow">${t('chooseWord')}</div><h2 class="question-prompt" lang="ko">${esc(question.prompt_ko)}</h2><div class="question-help"><span>${t('pickOnce')}</span><button class="text-button" data-action="translation" aria-expanded="${state.translation}">${t(state.translation?'hideTranslation':'showTranslation')}</button></div>${state.translation?`<p class="question-translation" lang="en">${esc(question.prompt_en)}</p>`:''}<div class="options">${question.options.map((option,index)=>{
    const correct=answer&&wordKey(option)===wordKey(question.answer);
    const incorrect=answer&&!answer.correct&&wordKey(option)===wordKey(answer.selected);
    return `<button class="option ${correct?'correct':''} ${incorrect?'incorrect':''}" data-action="answer" data-index="${index}" ${answer?'disabled':''}><strong>${esc(option.word)}</strong><span class="option-hanja">${esc(option.hanja)}</span><small>${correct?`✓ ${t('answer')}`:incorrect?`× ${t('yourChoice')}`:String(index+1).padStart(2,'0')}</small></button>`;
  }).join('')}</div>${answer?`<div class="answer-feedback ${answer.correct?'':'incorrect'}" role="status" tabindex="-1"><h3>${t(answer.correct?'correct':'incorrect')}</h3><p>${esc(state.lang==='ko'?question.explanation_ko:question.explanation_en)}</p></div><div class="question-actions"><button class="text-button" data-action="open-word" ${wordAttrs(question.answer)}>${t('openWord')} ↗</button><button class="primary-button" data-action="next-question">${t(state.index===result.total-1?'finish':'next')} →</button></div>`:''}</section><p class="session-note">${t('practiceNote')}</p></div>`;
}
function renderSummary(head,result) {
  if(!state.session.recorded&&result.complete) {saveStorage('han-graph.practice.v1',{correct:result.correct,total:result.total,completedAt:new Date().toISOString()});state.session.recorded=true;}
  $('#main').innerHTML=`${head}<div class="practice-wrap"><section class="practice-intro"><div class="eyebrow">SESSION COMPLETE</div><div class="result-number">${result.correct}<small> / ${result.total}</small></div><h2>${t('summaryTitle')}</h2><p>${t('summarySub')}</p><div class="result-actions"><button class="primary-button" data-action="start-practice">${t('restart')} ↻</button><a href="#explore" class="secondary-button">${t('startExplore')} →</a></div>${result.mistakes.length?`<div class="review-list"><h3>${t('review')}</h3>${result.mistakes.map(question=>`<div class="review-item"><span>↗</span><strong>${esc(question.answer.word)} · ${esc(question.answer.hanja)}</strong><button class="text-button" data-action="open-word" ${wordAttrs(question.answer)}>${t('openWord')}</button></div>`).join('')}</div>`:`<p class="practice-meta">${t('allCorrect')}</p>`}</section></div>`;
}

async function boot() {
  updateShell();
  $('#main').innerHTML=`<div class="loading-panel" role="status">${t('loading')}</div>`;
  try {
    const [stats,practice,search]=await Promise.all([getJSON('/api/stats'),getJSON('/api/practice'),getJSON('/api/search',state.query)]);
    Object.assign(state,{stats,practice,search,ready:true});
    await renderPage();
  } catch {$('#main').innerHTML=errorPanel();}
}
$('#language').addEventListener('click',()=>{state.lang=state.lang==='ko'?'en':'ko';saveStorage('han-graph.language',state.lang);updateShell();if(state.ready)renderPage();else boot();});
$('#main').addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');if(!button)return;
  const {action,word,hanja,glyph,index}=button.dataset;
  if(action==='open-word')routeWord({word,hanja});
  else if(action==='open-character')routeCharacter(glyph);
  else if(action==='component')changeComponent(glyph);
  else if(action.startsWith('network-'))sizeNetwork(action);
  else if(action==='save')toggleSaved({word,hanja});
  else if(action==='tab'){state.tab=button.dataset.tab;renderCatalog();$(`[data-tab="${state.tab}"]`)?.focus({preventScroll:true});}
  else if(action==='clear-search'){state.query='';$('#search').value='';$('#search').focus();clearTimeout(searchTimer);performSearch();}
  else if(action==='search-retry')performSearch();
  else if(action==='retry'){if(state.ready)renderPage();else boot();}
  else if(action==='start-practice'){state.session=createSession(state.practice.questions);state.index=0;state.translation=false;renderPractice();$('.question-prompt')?.scrollIntoView({block:'nearest'});}
  else if(action==='translation'){state.translation=!state.translation;renderPractice();$('[data-action="translation"]')?.focus({preventScroll:true});}
  else if(action==='answer'){
    const question=state.session?.questions[state.index];
    if(question&&answerQuestion(state.session,state.index,question.options[Number(index)])){renderPractice();$('.answer-feedback')?.focus({preventScroll:true});}
  }
  else if(action==='next-question'&&state.session?.answers.has(state.session.questions[state.index]?.id)){state.index++;state.translation=false;renderPractice();$('.question-prompt, .result-number')?.scrollIntoView({block:'nearest'});}
});
window.addEventListener('hashchange',()=>renderPage({revealSelection:true}));
window.addEventListener('resize',()=>{if(state.page==='explore'&&state.detail?.fit)sizeNetwork('network-fit');});
$('.skip-link').addEventListener('click',event=>{event.preventDefault();$('#main').focus();$('#main').scrollIntoView({block:'start'});});
window.addEventListener('storage',event=>{if(event.key==='han-graph.words.v1'){state.saved=normalizeSaved(readStorage(event.key,[]));updateShell();if(state.page==='saved')renderSaved(++pageEpoch);else if(state.page==='explore')renderDetail();}});
document.addEventListener('keydown',event=>{if(event.key==='/'&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)&&$('#search')){event.preventDefault();$('#search').focus();}});
boot();
