import {WORD_FORM_FIELDS, emptyWordDraft, wordFormPayload, findMissingCharacters, addMissingCharacters} from './dictionary-form.mjs';
import {copy, normalizeLanguage, localized, localizedDate, countText, LANGUAGES, languageLabel, orderedLanguages} from './localization.mjs';
import {parseDictionaryInput, DICTIONARY_FIELDS, DICTIONARY_SAMPLE} from './personal-dictionary.mjs';
import {exampleLines} from './examples.mjs';
import {wordKey, normalizeSaved, createSession, answerQuestion, sessionResult, PRACTICE_SESSION_SIZE, WORD_LEVELS, wordCategory, PRACTICE_LEVELS, practiceSettings, filterPracticeQuestions} from './learning.mjs';
import {createDataClient} from './data-client.mjs';
import {loadPrintableWords, renderPrintableWordbook, wordbookPrintFilename, loadWordbookPrintFont} from './wordbook-print.mjs';
import {layoutNetwork, renderNetworkSVG, filterNetwork, componentNetwork, wordFormParts, isMixedWord} from './network.mjs';
import {bindNetworkDrag, bindNetworkFocus} from './network-view.mjs';
import {parseWordbook, mergeWordbook, serializeWordbook, WordbookError, MAX_WORDBOOK_BYTES} from './wordbook.mjs';

let seed = {};
try { seed = JSON.parse(document.getElementById('bootstrap-data')?.textContent ?? '{}'); } catch { /* Fall back to the API. */ }
const getJSON = createDataClient({origin: location.origin, seed});

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
const icons = {
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>',
  bookmark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4Z"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h3c5 0 7 12 12 12h3m-4-4 4 4-4 4M3 18h3c2 0 3.5-2 5-5m2-2c1.5-3 3-5 5-5h3m-4-4 4 4-4 4"/></svg>',
};

function readStorage(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
const storedPractice=readStorage('han-graph.practice-settings.v1', {});
const storedLevel=readStorage('han-graph.word-level', 'all');
const state = {
  level:WORD_LEVELS.includes(storedLevel)?storedLevel:'all',
  practiceSettings:practiceSettings(storedPractice),
  lang: normalizeLanguage(readStorage('han-graph.language', 'ko')),
  saved: normalizeSaved(readStorage('han-graph.words.v1', [])),
  page:'explore', query:'', searchMode:'all', tab:'words', search:null, stats:null, practice:null,
  selection:null, detail:null, glyph:null, session:null, index:0, translation:false,
  ready:false, importingWords:false, wordbookStatus:null,
  dictionary:{words:[],characters:[],meta:[],examples:[]}, dictionaryRevision:0, dictionaryNeedsRefresh:false, wordDraft:emptyWordDraft(), characterDrafts:[],
  googleClientID:'', googleProof:null, translationLanguages:[],
  user:null, notes:[], accountReady:false, accountEnabled:true, accountMode:'login', privateBusy:false, accountRefreshPending:false, accountFailure:null, noteDrafts:new Map(),
};
let pageEpoch=0, detailEpoch=0, componentEpoch=0, searchEpoch=0, searchTimer, toastTimer;
const t = key => copy[state.lang][key] ?? key;
const searchPath = (mode,level=state.level) => {
  const params=new URLSearchParams();
  if(mode==='sound')params.set('mode',mode);
  if(level!=='all')params.set('level',level);
  return '/api/search'+(params.size?'?'+params:'');
};
const levelLabel = level => t({all:'levelAll',easy:'levelEasy',normal:'levelNormal',hard:'levelHard',classical:'levelClassical'}[level]??'levelNormal');
const personalBadge = word => state.dictionary.words.some(entry=>wordKey(entry)===wordKey(word))?`<span class="personal-badge">${t('personal')}</span>`:'';
const personalCharacterBadge = character => state.dictionary.characters.some(entry=>entry.id===character.id)?`<span class="personal-badge">${t('personalCharacter')}</span>`:'';
const levelBadge = word => `<span class="level-badge ${wordCategory(word)}">${levelLabel(word.level)}</span>`;
const levelControls = () => `<div class="vocabulary-filters" role="group" aria-label="${t('wordLevel')}"><span>${t('wordLevel')}</span>${WORD_LEVELS.map(level=>`<button type="button" data-action="word-level" data-level="${level}" aria-pressed="${state.level===level}" class="${state.level===level?'active':''}">${levelLabel(level)}</button>`).join('')}</div>`;
const meaning = word => localized(word, 'meaning', state.lang);
function saveStorage(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { toast(t('storageFailed')); return false; } }
function toast(message) { clearTimeout(toastTimer); $('#toast').textContent=message; $('#toast').classList.add('show'); toastTimer=setTimeout(()=>$('#toast').classList.remove('show'), 3500); }
function languageOptions(excluded=[]) {
  const preferences=navigator.languages?.length?navigator.languages:[navigator.language];
  return orderedLanguages(preferences).filter(lang=>!excluded.includes(lang)).map(lang=>
    `<option value="${lang}" lang="${lang==='zh'?'zh-Hans':lang}">${languageLabel(lang)}</option>`
  ).join('');
}
function refreshLanguageOptions() {
  const language=$('#language');
  language.innerHTML=languageOptions();
  language.value=state.lang;
  const translation=$('#translation-language');
  if(translation) {
    const selected=translation.value;
    translation.innerHTML=languageOptions(['ko',...state.translationLanguages]);
    translation.value=selected;
  }
}
refreshLanguageOptions();
window.addEventListener('languagechange',refreshLanguageOptions);
function updateShell() {
  document.documentElement.lang=state.lang;
  document.body.classList.toggle('wordbook-print-view',state.page==='print');
  document.title=`漢-Graph · ${t(state.page)}`;
  document.querySelectorAll('[data-i18n]').forEach(element => element.innerHTML=t(element.dataset.i18n));
  document.querySelectorAll('[data-i18n-aria]').forEach(element=>element.setAttribute('aria-label',t(element.dataset.i18nAria)));
  document.querySelector('meta[name=description]').content=t('appDescription');
  document.querySelectorAll('.nav-link').forEach(link => {
    const active=link.dataset.page===(state.page==='print'?'saved':state.page);
    link.classList.toggle('active', active);
    if(active) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current');
  });
  const accountLabel=location.hash==='#account?view=dictionary'?'dictionaryTitle':location.hash==='#account?history=1'?'historyTitle':'personalSettings';
  $('#page-label').textContent=t(state.page==='account' && state.user?accountLabel:state.page);
  $('#account-link').textContent=state.user?.username??t('login');
  $('#saved-count').textContent=state.saved.length;
  $('#language').value=state.lang;
  $('#language').setAttribute('aria-label',t('languageLabel'));
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
  if(state.dictionaryNeedsRefresh) {
    $('#main').innerHTML=`<div class="loading-panel" role="status">${t('loading')}</div>`;
    try {
      const [stats,search]=await Promise.all([getJSON('/api/stats'),getJSON(searchPath(state.searchMode),state.query)]);
      if(epoch!==pageEpoch)return;
      Object.assign(state,{stats,search,dictionaryNeedsRefresh:false});
    } catch {if(epoch===pageEpoch)$('#main').innerHTML=errorPanel();return;}
  }
  const [page, query=''] = location.hash.slice(1).split('?');
  const previousPage=state.page, previousSelection=JSON.stringify(state.selection);
  const catalogScrollTop=$('.catalog-list')?.scrollTop??0;
  const graphPosition=state.detail?.zoom&&$('.network-viewport')?networkCenter($('.network-viewport')):null;
  state.page=['explore','practice','saved','print','account'].includes(page)?page:'explore';
  if(previousPage!==state.page)window.scrollTo({top:0});
  updateShell();
  if (state.page==='account') { renderAccount(); return; }
  if (state.page==='practice') { renderPractice(); return; }
  if (state.page==='saved') { await renderSaved(epoch); return; }
  if (state.page==='print') { await renderWordbookPrint(epoch); return; }
  const params=new URLSearchParams(query);
  if (params.get('word')) state.selection={kind:'word',word:params.get('word'),hanja:params.get('hanja')};
  else if(params.get('character')) state.selection={kind:'character',glyph:params.get('character')};
  else if(!state.selection) { const word=state.search.words.find(word=>word.word==='가정')??state.search.words[0]; if(word)state.selection={kind:'word',...word}; }
  $('#main').innerHTML=`${hero('exploreEye','exploreTitle','exploreSub',`<div class="hero-counter"><strong>${state.stats.words}</strong><span>${t('wordsReady')}</span></div>`)}
    <div class="search-filters"><div class="search-modes" role="group" aria-label="${t('searchMode')}">${['all','sound'].map(mode=>`<button type="button" data-action="search-mode" data-mode="${mode}" class="${state.searchMode===mode?'active':''}" aria-pressed="${state.searchMode===mode}">${t(mode==='sound'?'searchSound':'searchAll')}</button>`).join('')}</div><p id="search-mode-hint">${t(state.searchMode==='sound'?'soundSearchHint':'allSearchHint')}</p></div>
    <div class="vocabulary-filter-bar">${levelControls()}<p class="filter-help">${t('levelHint')}</p></div>
    <div class="explore-tools"><form class="search-form" role="search" id="search-form">${icons.search}<input id="search" type="search" maxlength="100" value="${esc(state.query)}" placeholder="${t(state.searchMode==='sound'?'soundPlaceholder':'search')}" aria-label="${t(state.searchMode==='sound'?'soundPlaceholder':'search')}" aria-describedby="search-mode-hint" autocomplete="off"></form><button class="random-button" type="button" data-action="random-word" title="${t('randomHint')}">${icons.shuffle}<span>${t('randomWord')}</span></button></div>
    <div class="section-bar"><span>${t('browseLabel')}</span><span>${countText(state.stats.characters,'characters',state.lang)} · ${countText(state.stats.words,'words',state.lang)}</span></div>
    <div class="explorer"><section class="catalog" aria-label="${t('searchResults')}"><div id="catalog"></div></section><section class="detail-panel" id="detail" aria-label="${t('openWord')}"></section><div class="network-panel" id="network"></div></div>`;
  $('#search-form').addEventListener('submit', event=>{event.preventDefault();state.query=$('#search').value;clearTimeout(searchTimer);performSearch();});
  $('#search').addEventListener('input', event=>{state.query=event.target.value;clearTimeout(searchTimer);searchTimer=setTimeout(performSearch,180);});
  renderCatalog({scrollTop:catalogScrollTop});
  if(!revealSelection && previousPage==='explore' && state.detail && JSON.stringify(state.selection)===previousSelection)renderDetail(graphPosition);
  else if(state.selection) await loadDetail(state.selection); else $('#detail').innerHTML=`<div class="empty-state">${t('notFoundSub')}</div>`;
  if(revealSelection && query && epoch===pageEpoch && state.page==='explore') {
    const heading=$('#detail .word-title');
    if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}
    $('#detail').scrollIntoView({block:'nearest'});
  }
}

function renderCatalog({scrollTop=$('.catalog-list')?.scrollTop??0} = {}) {
  if(!$('#catalog') || !state.search)return;
  const result=state.search;
  const list=state.tab==='words'?result.words:result.characters;
  const count=state.tab==='words'?result.word_count:result.character_count;
  const items=list.map(item=>{
    const word=state.tab==='words';
    const selected=word?state.selection?.kind==='word'&&state.selection.word===item.word&&state.selection.hanja===item.hanja:state.selection?.kind==='character'&&state.selection.glyph===item.hanja;
    const title=word?item.word:`${item.hanja} · ${item.sound_ko}`;
    const sub=word?meaning(item):localized(item, 'meaning', state.lang).join(', ');
    return `<button class="catalog-item ${selected?'selected':''}" data-action="${word?'open-word':'open-character'}" ${word?wordAttrs(item):`data-glyph="${esc(item.hanja)}"`} ${selected?'aria-current="true"':''}><span class="item-main"><span class="item-title" lang="ko">${esc(title)}</span>${word?levelBadge(item)+personalBadge(item):personalCharacterBadge(item)}<span class="item-sub">${esc(sub)}</span></span>${word?`<span class="item-hanja" lang="ko">${esc(item.hanja)}</span>`:''}${selected?'<span class="item-arrow">↗</span>':''}</button>`;
  }).join('');
  $('#catalog').innerHTML=`<div class="catalog-tabs" role="group" aria-label="${t('searchResults')}"><button data-action="tab" data-tab="words" class="${state.tab==='words'?'active':''}" aria-pressed="${state.tab==='words'}">${t('words')}<span class="tab-count">${result.word_count}</span></button><button data-action="tab" data-tab="characters" class="${state.tab==='characters'?'active':''}" aria-pressed="${state.tab==='characters'}">${t('characters')}<span class="tab-count">${result.character_count}</span></button></div><div class="catalog-list">${items||`<div class="empty-state"><p>${t('noResults')}</p><p>${t(state.searchMode==='sound'?'soundEmptyHint':'searchHint')}</p></div>`}</div><div class="list-footnote" aria-live="polite">${count>list.length?t(state.searchMode==='sound'?'soundLimited':'limited'):`${t('searchResults')} · ${count} ${t('entries')}`}</div>`;
  // Selection redraws keep the reader's place; new result sets pass zero.
  $('.catalog-list').scrollTop=scrollTop;
}
async function showRandomWord(button) {
  if(button.disabled)return;
  const epoch=pageEpoch, level=state.level;
  const params=new URLSearchParams({level});
  if(state.selection?.kind==='word') {
    params.set('exclude_word',state.selection.word);
    params.set('exclude_hanja',state.selection.hanja??state.detail?.wordResult?.word.hanja??'');
  }
  button.disabled=true;
  button.setAttribute('aria-busy','true');
  button.querySelector('span').textContent=t('randomLoading');
  try {
    // Random choices must bypass the reusable lookup cache.
    const response=await fetch(`/api/random-word?${params}`,{cache:'no-store',headers:{'X-Account-ID':state.user?.id??'guest'}});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const word=await response.json();
    if(epoch!==pageEpoch || state.page!=='explore' || level!==state.level)return;
    routeWord(word);
  } catch {
    if(epoch===pageEpoch)toast(t('randomError'));
  } finally {
    button.disabled=false;
    button.removeAttribute('aria-busy');
    button.querySelector('span').textContent=t('randomWord');
  }
}
function changeWordLevel(level) {
  if(!WORD_LEVELS.includes(level) || level===state.level)return;
  const graphFocused=!!document.activeElement?.closest('#network');
  state.level=level;
  saveStorage('han-graph.word-level',level);
  clearTimeout(searchTimer);
  document.querySelectorAll('[data-action="word-level"]').forEach(button=>{
    button.classList.toggle('active',button.dataset.level===level);
    button.setAttribute('aria-pressed',String(button.dataset.level===level));
  });
  if(state.detail?.network) {
    const visibleNetwork=filterNetwork(state.detail.network,level);
    Object.assign(state.detail,{visibleNetwork,layout:layoutNetwork(visibleNetwork,state.detail.wordResult?.word),zoom:null});
    renderDetail();
    if(graphFocused)$(`#network [data-action="word-level"][data-level="${level}"]`)?.focus({preventScroll:true});
  }
  if(state.detail&&!state.detail.network)renderDetail();
  performSearch();
}
function changeSearchMode(mode) {
  if(!['all','sound'].includes(mode) || mode===state.searchMode)return;
  state.searchMode=mode;
  clearTimeout(searchTimer);
  document.querySelectorAll('[data-action="search-mode"]').forEach(button=>{
    const active=button.dataset.mode===mode;
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',String(active));
  });
  const input=$('#search');
  input.placeholder=t(mode==='sound'?'soundPlaceholder':'search');
  input.setAttribute('aria-label',input.placeholder);
  $('#search-mode-hint').textContent=t(mode==='sound'?'soundSearchHint':'allSearchHint');
  performSearch();
}
async function performSearch() {
  const epoch=++searchEpoch;
  const query=state.query, mode=state.searchMode, level=state.level;
  $('#catalog')?.setAttribute('aria-busy','true');
  const note=$('.list-footnote'); if(note)note.textContent=t('looking');
  try {
    const result=await getJSON(searchPath(mode,level),query);
    if(epoch!==searchEpoch || query!==state.query || mode!==state.searchMode || level!==state.level)return;
    state.search=result;
    renderCatalog({scrollTop:0});
  } catch {
    if(epoch===searchEpoch && query===state.query && mode===state.searchMode && level===state.level && $('.list-footnote')) $('.list-footnote').innerHTML=`${t('errorTitle')} <button class="text-button" data-action="search-retry">${t('retry')}</button>`;
  } finally {
    if(epoch===searchEpoch)$('#catalog')?.removeAttribute('aria-busy');
  }
}

async function loadDetail(selection) {
  const epoch=++detailEpoch;
  componentEpoch++;
  state.selection=selection;
  state.detail=null;
  state.glyph=null;
  renderCatalog();
  $('#detail').innerHTML=`<div class="loading-panel" role="status">${t('loading')}</div>`;
  $('#network').innerHTML='';
  try {
    let wordResult=null, characters=[], network=null;
    if(selection.kind==='word') {
      const results=await getJSON('/api/words',selection.word);
      wordResult=results.find(result=>selection.hanja==null || result.word.hanja===selection.hanja);
      if(!wordResult)throw new RangeError('missing');
    } else {
      characters=await getJSON('/api/characters',selection.glyph);
      if(!characters.length)throw new RangeError('missing');
      const glyph=characters[0].hanja;
      network=componentNetwork(await getJSON('/api/neighborhood',glyph),glyph);
    }
    if(epoch!==detailEpoch || state.page!=='explore')return;
    state.glyph=network?.roots[0]??null;
    const visibleNetwork=network?filterNetwork(network,state.level):null;
    state.detail={wordResult,characters,network,visibleNetwork,layout:visibleNetwork?layoutNetwork(visibleNetwork,wordResult?.word):null,zoom:null};
    renderDetail();
  } catch(error) {
    if(epoch!==detailEpoch || !$('#detail'))return;
    $('#detail').innerHTML=error instanceof RangeError?`<div class="empty-state"><h2>${t('notFound')}</h2><p>${t('notFoundSub')}</p></div>`:errorPanel();
  }
}
function renderDetail(position=null) {
  if(!$('#detail') || !state.detail)return;
  const viewport=$('.network-viewport');
  position??=viewport&&state.detail.zoom?networkCenter(viewport):null;
  const {wordResult,characters}=state.detail;
  const character=characters[0];
  let card;
  if(wordResult) {
    const word=wordResult.word;
    card=`<div class="word-heading"><div class="word-heading-top"><span class="word-tags"><span class="tag">${t('wordTag')}</span>${levelBadge(word)}${personalBadge(word)}</span><button class="save-button ${isSaved(word)?'saved':''}" data-action="save" ${wordAttrs(word)} aria-pressed="${isSaved(word)}">${icons.bookmark}${t(isSaved(word)?'savedButton':'save')}</button></div><div class="word-title-row"><div><h2 class="word-title" lang="ko">${esc(word.word)}</h2><p class="word-meaning">${esc(meaning(word))}</p></div><span class="word-hanja" lang="ko">${isMixedWord(word)?wordFormParts(word).map(part=>`<span class="form-${part.hanja?'hanja':'hangul'}">${esc(part.text)}</span>`).join(''):esc(word.hanja)}</span></div></div>
      ${exampleLines(wordResult,state.lang).length?`<section class="word-example"><h3>${t('example')}</h3>${exampleLines(wordResult,state.lang).map(line=>`<p lang="${line.lang}" class="${line.secondary?'example-translation':'example-primary'}">${esc(line.text)}</p>`).join('')}</section>`:''}
      <div class="components-section"><div class="subheading"><h2>${t('breakDown')}</h2><span>${t('tapCharacter')}</span></div><div class="component-grid">${wordResult.components.map(component=>`<button class="component-card ${component.hanja===state.glyph?'active':''}" data-action="component" data-glyph="${esc(component.hanja)}" aria-pressed="${component.hanja===state.glyph}"><span class="glyph" lang="ko">${esc(component.hanja)}</span><span class="sound">${esc(component.readings.map(reading=>`${reading.sound_ko} · ${reading.sound_en}`).join(' / '))}</span><span class="meaning">${esc(component.readings.map(reading=>localized(reading, 'meaning', state.lang).join(', ')).join(' / '))}</span></button>`).join('<span class="component-plus" aria-hidden="true">+</span>')}</div>${localized(word,'semantic_hint',state.lang)?`<p class="semantic-hint">${esc(localized(word, 'semantic_hint', state.lang))}</p>`:''}<p class="learning-tip"><span aria-hidden="true">◇</span>${t(isMixedWord(word)?'mixedWordNote':word.components.length?'readingNote':'noHanja')}</p></div>${noteEditor(word)}`;
  } else {
    card=`<div class="word-heading"><div class="word-heading-top"><span class="tag">${t('charTag')}</span>${characters.map(personalCharacterBadge).join('')}</div><div class="word-title-row"><div><h2 class="word-title" lang="ko">${esc(characters.map(c=>c.sound_ko).join(' / '))}</h2><p class="word-meaning">${esc(characters.map(c=>localized(c, 'meaning', state.lang).join(', ')).join(' / '))}</p></div><span class="word-hanja" lang="ko">${esc(character.hanja)}</span></div></div><div class="components-section"><h3>${t('readings')}</h3>${characters.map(c=>`<p class="word-meaning-en">${esc(c.sound_ko)} · ${esc(c.sound_en)} — ${esc(localized(c,'meaning',state.lang).join(', '))}</p>`).join('')}<p class="learning-tip"><span>◇</span>${t('readingNote')}</p></div>`;
  }
  $('#detail').innerHTML=`<article class="word-card">${card}${wordResult&&state.level!=='all'&&wordResult.word.level!==state.level?`<p class="filter-notice">${t('selectedOutside')}</p>`:''}</article>`;
  $('#network').innerHTML=renderNetwork();
  if(!$('.network-viewport'))return;
  bindNetworkFocus($('.network-canvas svg'),state.detail.layout);
  sizeNetwork(undefined,position);
  bindNetworkDrag($('.network-viewport'), {
    getPosition:()=>state.detail.pan,
    onPan:position=>{state.detail.fit=false;moveNetwork(position);},
  });
}
function renderNetwork() {
  const {visibleNetwork:network,layout,networkLoading,networkError}=state.detail;
  if(networkLoading)return `<div class="loading-panel" role="status">${t('loading')}</div>`;
  if(networkError)return `<div class="empty-state" role="alert"><p>${t('errorTitle')}</p><button class="text-button" data-action="network-retry">${t('retry')}</button></div>`;
  if(!network)return '';
  if(state.detail.wordResult && !state.detail.wordResult.word.components.length)return `<section class="network-section"><div class="subheading"><h2>${t('connections')}</h2></div><p class="network-scope">${t('noHanja')}</p></section>`;
  const svg=renderNetworkSVG(layout,{lang:state.lang,highlighted:state.glyph,wordLabel:t('openWord'),characterLabel:t('characters'),label:t('graphRegion')});
  return `<section class="network-section"><div class="subheading"><h2>${t('connections')}</h2><span>${network.characters.length} ${t('characters')} · ${network.words.length} ${t('words')}</span></div><p class="network-scope">${t('graphScope')}</p>${network.words.some(isMixedWord)?`<p class="network-scope mixed-word-note">${t('mixedWordNote')}</p>`:''}${levelControls()}<div class="category-legend" aria-label="${t('categoryLegend')}">${WORD_LEVELS.filter(level=>level!=='all').map(level=>`<span>${levelBadge({level})} ${network.words.filter(word=>word.level===level).length}</span>`).join('')}</div><div class="network-card"><div class="network-toolbar"><span class="network-key"><i></i>${esc(state.glyph)} · ${t('graphSelected')}</span><div class="network-controls"><button data-action="network-out" aria-label="${t('zoomOut')}" title="${t('zoomOut')}">−</button><output id="network-scale" aria-live="polite"></output><button data-action="network-in" aria-label="${t('zoomIn')}" title="${t('zoomIn')}">+</button><button data-action="network-fit">${t('fitGraph')}</button></div></div><div class="network-viewport" tabindex="0" role="region" aria-label="${t('graphRegion')}. ${t('graphPan')}"><div class="network-canvas">${svg}</div></div>${network.words.length?'':`<div class="empty-state"><h3>${t('noConnections')}</h3><p>${t(state.level==='all'?'noConnectionsSub':'filteredEmpty')}</p></div>`}<div class="network-caption"><span class="legend-dot"></span><span>${t('graphHint')}<br>${t('graphPan')}</span></div></div></section>`;
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
async function changeComponent(glyph) {
  const detail=state.detail;
  if(!detail?.wordResult?.word.components.includes(glyph))return;
  if(state.glyph===glyph && (detail.network||detail.networkLoading))return;
  const epoch=++componentEpoch;
  state.glyph=glyph;
  Object.assign(detail,{network:null,visibleNetwork:null,layout:null,zoom:null,networkLoading:true,networkError:false});
  renderDetail();
  $(`.component-card[data-glyph="${CSS.escape(glyph)}"]`)?.focus({preventScroll:true});
  try {
    const network=componentNetwork(await getJSON('/api/neighborhood',glyph),glyph);
    if(epoch!==componentEpoch || state.detail!==detail || state.page!=='explore')return;
    const visibleNetwork=filterNetwork(network,state.level);
    Object.assign(detail,{network,visibleNetwork,layout:layoutNetwork(visibleNetwork,detail.wordResult.word),networkLoading:false});
  } catch {
    if(epoch!==componentEpoch || state.detail!==detail || state.page!=='explore')return;
    Object.assign(detail,{networkLoading:false,networkError:true});
  }
  const focusedGlyph=document.activeElement?.closest('.component-card')?.dataset.glyph;
  renderDetail();
  if(focusedGlyph)$(`.component-card[data-glyph="${CSS.escape(focusedGlyph)}"]`)?.focus({preventScroll:true});
}
async function toggleSaved(ref) {
  if(!state.accountReady){toast(t('accountFailed'));return;}
  if(state.privateBusy)return;
  const exists=isSaved(ref);
  if(!exists && state.saved.length>=500){toast(t('maxSaved'));return;}
  state.privateBusy=true;
  try {
    if(state.user) applyAccount(await accountRequest('/api/account/words',exists?'DELETE':'POST',exists?ref:{words:[ref]}));
    else {
      state.saved=exists?state.saved.filter(word=>wordKey(word)!==wordKey(ref)):[...state.saved,{word:ref.word,hanja:ref.hanja}];
      if(!saveStorage('han-graph.words.v1',state.saved))return;
    }
    toast(t(exists?'removed':'added'));
  } catch(error) {toast(accountMessage(error));}
  finally {
    finishPrivateRequest();updateShell();
    if(state.page==='saved')renderSaved(++pageEpoch);else renderDetail();
  }
}
async function renderSaved(epoch) {
  $('#main').innerHTML=`${hero('savedEye','savedTitle','savedSub')}<section class="wordbook-tools" aria-label="${t('saved')}"><div><p>${t('wordbookHelp')}</p><p class="storage-note">${t(state.user?'accountStorage':'storageNote')}</p>${!state.user?`<a class="text-button" href="#account">${t('accountLoginHint')} →</a>`:''}</div><div class="wordbook-actions"><button class="secondary-button" type="button" data-action="download-words" ${state.saved.length?'':'disabled'}>${t('downloadWords')}</button><button class="secondary-button" type="button" data-action="print-words" ${state.saved.length?'':'disabled'}>${t('printWords')}</button><button class="primary-button" type="button" data-action="upload-words" ${state.importingWords?'disabled':''}>${t(state.importingWords?'transferringWords':'uploadWords')}</button><input id="wordbook-file" type="file" accept=".jsonl,.ndjson,application/x-ndjson,application/jsonl" hidden></div></section><p id="wordbook-status" class="wordbook-status" role="status" aria-live="polite"></p><div id="saved-list" class="loading-panel" role="status">${t('loading')}</div>`;
  renderWordbookStatus();
  $('#wordbook-file').addEventListener('change',event=>{
    const file=event.target.files[0];event.target.value='';
    if(file)importWordbook(file);
  });
  const results=await Promise.allSettled(state.saved.map(async ref=>{
    const matches=await getJSON('/api/words',ref.word);
    return matches.find(match=>wordKey(match.word)===wordKey(ref))?.word;
  }));
  if(epoch!==pageEpoch || state.page!=='saved')return;
  if(results.some(result=>result.status==='rejected')) {$('#saved-list').innerHTML=errorPanel();return;}
  const words=results.map(result=>result.value).filter(Boolean);
  $('#saved-list').className='';$('#saved-list').removeAttribute('role');
  const missing=state.saved.filter(ref=>!words.some(word=>wordKey(ref)===wordKey(word)));
  $('#saved-list').innerHTML=words.length?`<div class="saved-grid">${words.map(word=>`<article class="saved-card"><div class="saved-top"><span class="word-hanja" lang="ko">${esc(word.hanja)}</span><button class="save-button saved" data-action="save" ${wordAttrs(word)} aria-label="${t('remove')}: ${esc(word.word)}">${icons.bookmark}</button></div><h2 lang="ko">${esc(word.word)}</h2>${levelBadge(word)}${personalBadge(word)}<p>${esc(meaning(word))}</p><button class="text-button" data-action="open-word" ${wordAttrs(word)}>${t('openWord')} ↗</button></article>`).join('')}</div>`:`<div class="empty-state"><span class="empty-glyph">記</span><h2>${t('savedEmpty')}</h2><p>${t('savedEmptySub')}</p><a class="primary-button" href="#explore">${t('startExplore')} →</a></div>`;
  if(missing.length)$('#saved-list').innerHTML+=`<div class="storage-note">${t('missingSaved')}: ${missing.map(word=>`<button class="text-button" data-action="save" ${wordAttrs(word)}>${esc(word.word)} (${t('remove')})</button>`).join(', ')}</div>`;
}

async function renderWordbookPrint(epoch) {
  const saved=state.saved.map(ref=>({...ref})), lang=state.lang, date=new Date();
  $('#main').innerHTML=`<section class="print-toolbar"><div><a class="text-button" href="#saved">${t('printBack')}</a><p>${t('printHelp')}</p></div><button class="primary-button" type="button" data-action="print-now" disabled>${t('printNow')}</button></section><div id="print-content" class="loading-panel" role="status">${t('printLoading')}</div>`;
  const isCurrent=()=>epoch===pageEpoch && state.page==='print';
  if(!saved.length) {
    $('#print-content').className='empty-state';
    $('#print-content').textContent=t('savedEmpty');
    return;
  }
  try {
    const [entries]=await Promise.all([
      loadPrintableWords(saved,getJSON,isCurrent),
      loadWordbookPrintFont().catch(()=>{throw new Error('print-font');}),
    ]);
    if(!isCurrent())return;
    const content=$('#print-content');
    content.className='';content.removeAttribute('role');
    content.innerHTML=renderPrintableWordbook(entries,{lang,date});
    // Wait for layout with the bundled font before enabling the print dialog.
    await document.fonts.ready;
    if(!isCurrent())return;
    document.title=wordbookPrintFilename(date);
    $('[data-action="print-now"]').disabled=false;
  } catch(error) {
    if(!isCurrent())return;
    $('#print-content').className='empty-state';
    $('#print-content').innerHTML=`<p role="alert">${t(error.message==='print-font'?'printFontError':'printError')}</p><button class="primary-button" type="button" data-action="retry">${t('retry')}</button>`;
  }
}

function printWordbook() {
  if(state.page!=='print' || !$('[data-action="print-now"]') || $('[data-action="print-now"]').disabled)return;
  try { window.print(); } catch { toast(t('printUnavailable')); }
}

function renderWordbookStatus() {
  const status=state.wordbookStatus, element=$('#wordbook-status');
  if(!element)return;
  let message=status?t(status.key).replace(/\{(\w+)\}/g,(_,key)=>status[key]??''):'';
  if(status?.temporary)message+=' '+t('storageFailed');
  element.textContent=message;
  element.classList.toggle('error',!!status?.error);
}
function downloadWordbook() {
  if(!state.saved.length)return;
  try {
    const blob=new Blob([serializeWordbook(state.saved)],{type:'application/x-ndjson;charset=utf-8'});
    const url=URL.createObjectURL(blob), link=document.createElement('a');
    link.href=url;link.download=`han-graph-words-${new Date().toISOString().slice(0,10)}.jsonl`;
    document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    state.wordbookStatus={key:'wordbookDownloaded'};
  } catch {state.wordbookStatus={key:'wordbookDownloadError',error:true};}
  renderWordbookStatus();
}
async function importWordbook(file) {
  if(state.importingWords||state.privateBusy)return;
  if(!state.accountReady){toast(t('accountFailed'));return;}
  state.importingWords=true;state.privateBusy=true;
  const button=$('[data-action="upload-words"]');
  if(button){button.disabled=true;button.textContent=t('transferringWords');}
  try {
    if(file.size>MAX_WORDBOOK_BYTES)throw new WordbookError('size');
    const imported=parseWordbook(await file.text());
    // Merge after reading so a concurrent save or another tab's update is kept.
    const result=mergeWordbook(state.saved,imported);
    let persisted=true;
    if(state.user) applyAccount(await accountRequest('/api/account/words','POST',{words:imported}));
    else {persisted=saveStorage('han-graph.words.v1',result.words);state.saved=result.words;}
    state.wordbookStatus={key:'wordbookImported',added:result.added,duplicates:result.duplicates,temporary:!persisted};
    updateShell();
    if(state.page==='explore')renderDetail();
  } catch(error) {
    const key=error.account?accountErrorKey(error):({invalid:'wordbookInvalid',empty:'wordbookEmpty',size:'wordbookSize',limit:'wordbookLimit'}[error.code]??'wordbookReadError');
    state.wordbookStatus={key,line:error.line,error:true};
  } finally {
    state.importingWords=false;finishPrivateRequest();
    if(state.page==='saved')await renderSaved(++pageEpoch);
  }
}

function practiceSettingsControls() {
  return `<div class="practice-settings"><fieldset><legend>${t('wordLevel')}</legend><div class="practice-levels">${PRACTICE_LEVELS.map(level=>{
    const count=filterPracticeQuestions(state.practice.questions,{level}).length;
    return `<label class="practice-level-card"><input type="radio" name="practice-level" value="${level}" ${state.practiceSettings.level===level?'checked':''}><span>${levelBadge({level})}<small>${countText(count,'questions',state.lang)}</small></span></label>`;
  }).join('')}</div><p class="filter-help">${t(`practice${{easy:'Easy',normal:'Normal',hard:'Hard',classical:'Classical'}[state.practiceSettings.level]}Hint`)}</p><p class="filter-help">${t('practiceLevelHint')}</p></fieldset></div>`;
}
function renderPractice() {
  const head=hero('practiceEye','practiceTitle','practiceSub');
  if(!state.session) {
    const poolSize=filterPracticeQuestions(state.practice.questions,state.practiceSettings).length;
    const roundLabel=t('practiceRound').replace('{pool}',poolSize).replace('{count}',Math.min(poolSize,PRACTICE_SESSION_SIZE));
    const last=state.user?null:readStorage('han-graph.practice.v1',null);
    const validLast=last&&Number.isInteger(last.correct)&&Number.isInteger(last.total)&&last.total>0&&last.correct>=0&&last.correct<=last.total;
    $('#main').innerHTML=`${head}<div class="practice-wrap"><section class="practice-intro"><div class="practice-art" aria-hidden="true"><span>文</span><i>＋</i><span>脈</span></div><h2>${t('introTitle')}</h2><p>${t('introSub')}</p>${practiceSettingsControls()}<p class="practice-pool" role="status">${poolSize?esc(roundLabel):t('noPractice')}</p><button class="primary-button" data-action="start-practice" ${poolSize?'':'disabled'}>${t('startPractice')} →</button>${state.user?`<a class="text-button" href="#account?history=1">${t('historyTitle')}</a>`:''}${validLast?`<p class="practice-meta">${t('latest')}: ${last.correct} / ${last.total}${PRACTICE_LEVELS.includes(last.level)?` · ${levelLabel(last.level)}`:''}</p>`:''}</section></div>`;
    return;
  }
  const result=sessionResult(state.session);
  if(state.index>=state.session.questions.length){renderSummary(head,result);return;}
  const question=state.session.questions[state.index], answer=state.session.answers.get(question.id);
  $('#main').innerHTML=`${head}<div class="practice-wrap"><div class="practice-progress"><span>${String(state.index+1).padStart(2,'0')} / ${state.session.questions.length}</span><span>${levelLabel(state.session.level)}</span></div><div class="progress-track" role="progressbar" aria-label="${t('practice')}" aria-valuenow="${result.answered}" aria-valuemin="0" aria-valuemax="${result.total}"><div class="progress-fill" style="width:${result.answered/result.total*100}%"></div></div><section class="question-card"><div class="question-tags">${levelBadge({level:question.word_level})}${question.contrast_group?`<span class="tag">${t('meaningContrast')}</span>`:''}</div><div class="eyebrow">${t('chooseWord')}</div><h2 class="question-prompt" lang="${state.lang}">${esc(localized(question, 'prompt', state.lang))}</h2><div class="question-help"><span>${t('pickOnce')}</span><button class="text-button" data-action="translation" aria-expanded="${state.translation}">${t(state.translation?'hideTranslation':'showTranslation')}</button></div>${state.translation?`<p class="question-translation" lang="${state.lang==='ko'?'en':'ko'}">${esc(localized(question, 'prompt', state.lang==='ko'?'en':'ko'))}</p>`:''}<div class="options">${question.options.map((option,index)=>{
    const correct=answer&&wordKey(option)===wordKey(question.answer);
    const incorrect=answer&&!answer.correct&&wordKey(option)===wordKey(answer.selected);
    return `<button class="option ${correct?'correct':''} ${incorrect?'incorrect':''}" data-action="answer" data-index="${index}" ${answer?'disabled':''}><strong lang="ko">${esc(option.word)}</strong><small>${correct?`✓ ${t('answer')}`:incorrect?`× ${t('yourChoice')}`:String(index+1).padStart(2,'0')}</small></button>`;
  }).join('')}</div>${answer?`<div class="answer-feedback ${answer.correct?'':'incorrect'}" role="status" tabindex="-1"><h3>${t(answer.correct?'correct':'incorrect')}</h3>${levelBadge({level:question.word_level})}<p>${esc(localized(question, 'explanation', state.lang))}</p></div><div class="question-actions"><button class="text-button" data-action="open-word" ${wordAttrs(question.answer)}>${t('openWord')} ↗</button><button class="primary-button" data-action="next-question">${t(state.index===result.total-1?'finish':'next')} →</button></div>`:''}</section><p class="session-note">${t('practiceNote')}</p></div>`;
}
function renderSummary(head,result) {
  const {level}=state.session;
  if(!state.session.owner && !state.session.recorded && result.complete) {saveStorage('han-graph.practice.v1',{correct:result.correct,total:result.total,level,completedAt:new Date().toISOString()});state.session.recorded=true;}
  $('#main').innerHTML=`${head}<div class="practice-wrap"><section class="practice-intro"><div class="eyebrow">${t('sessionComplete')}</div><p class="practice-meta">${levelLabel(level)}</p><div class="result-number">${result.correct}<small> / ${result.total}</small></div><h2>${t('summaryTitle')}</h2><p>${t('summarySub')}</p>${state.session.owner?`<p role="status">${t(state.session.saveState==='saved'?'historySaved':state.session.saveState==='error'?'historyFailed':'accountWorking')}</p>${state.session.saveState==='error'?`<button class="secondary-button" data-action="retry-practice">${t('retry')}</button>`:''}<a class="text-button" href="#account?history=1">${t('historyTitle')}</a>`:''}<div class="result-actions"><button class="primary-button" data-action="start-practice">${t('restart')} ↻</button><button class="secondary-button" data-action="practice-settings">${t('changeSettings')}</button><a href="#explore" class="text-button">${t('startExplore')} →</a></div>${result.mistakes.length?`<div class="review-list"><h3>${t('review')}</h3>${result.mistakes.map(question=>`<div class="review-item"><span>↗</span><strong lang="ko">${esc(question.answer.word)} · ${esc(question.answer.hanja)}</strong><button class="text-button" data-action="open-word" ${wordAttrs(question.answer)}>${t('openWord')}</button></div>`).join('')}</div>`:`<p class="practice-meta">${t('allCorrect')}</p>`}</section></div>`;
}


async function savePracticeRound(session) {
  if(!session?.owner || session.owner!==state.user?.id || ['saving','saved'].includes(session.saveState))return;
  session.saveState='saving';
  const answers=session.questions.map(q=>({question:q.id,selected:session.answers.get(q.id).selected}));
  try {
    session.pending=accountRequest('/api/account/practice','POST',{id:session.roundID,level:session.level,answers},{keepalive:true});
    await session.pending;
    session.saveState='saved';
  } catch {
    session.saveState='error';
  }
  if(state.session===session && state.page==='practice' && state.index>=session.questions.length)renderPractice();
}
function renderPracticeHistory() {
  const owner=state.user.id;
  $('#main').innerHTML=`<section class="account-card"><h1>${t('historyTitle')}</h1><a href="#account" class="text-button">${t('account')}</a>
    <div id="history-rounds"></div><p class="form-status" role="status"></p><button class="secondary-button" id="history-more" hidden></button></section>`;
  const list=$('#history-rounds'),button=$('#history-more'),status=list.nextElementSibling;
  let next='';
  async function loadPage() {
    button.disabled=true;status.textContent=t('loading');
    try {
      if(state.session?.saveState==='saving')await state.session.pending;
      const data=await accountRequest('/api/account/practice'+(next?'?after='+encodeURIComponent(next):''));
      if(!list.isConnected || owner!==state.user?.id)return;
      for(const round of data.rounds) {
        const date=new Date(round.completed_at);
        const time=String(date.getHours()).padStart(2,'0')+':'+String(date.getMinutes()).padStart(2,'0');
        const row=answer=>{
          const prompt=answer.prompts?.[state.lang], correct=wordKey(answer.selected)===wordKey(answer.answer);
          const label=ref=>`<span lang="ko">${esc(ref.word)}${ref.hanja?' · '+esc(ref.hanja):''}</span>`;
          return `<li>${prompt?`<p>${esc(prompt)}</p>`:''}<strong>${t(correct?'correct':'incorrect')}</strong> · ${t('yourChoice')} · ${label(answer.selected)}${correct?'':`<br>${t('answer')} · ${label(answer.answer)}`}</li>`;
        };
        list.insertAdjacentHTML('beforeend',`<details class="history-round"><summary><time datetime="${esc(round.completed_at)}">${localizedDate(date,state.lang)} ${time}</time> · ${levelLabel(round.level)} · ${round.correct} / ${round.answers.length}</summary>
          <ol>${round.answers.map(row).join('')}</ol></details>`);
      }
      next=data.next??'';
      status.textContent=list.children.length?'':t('historyEmpty');
      button.hidden=!next;button.textContent=t('historyMore');
    } catch(error) {
      if(!list.isConnected)return;
      status.textContent=accountMessage(error);button.hidden=false;button.textContent=t('retry');
    } finally {button.disabled=false;}
  }
  button.addEventListener('click',loadPage);
  loadPage();
}

function wordRegistrationForm() {
  const fieldLanguage=name=>name.split('_')[1]??'ko';
  const field=(name,label,required=false,max=2000)=>`<div class="word-field"><label for="personal-${name}">${t(label)}${required?' *':''}</label><input id="personal-${name}" name="${name}" value="${esc(state.wordDraft[name])}" maxlength="${max}" ${required?'required':''} ${state.privateBusy?'readonly':''} lang="${fieldLanguage(name)}"></div>`;
  const newField=(entry,index,name,label,required,max)=>`<div class="word-field"><label for="new-${index}-${name}">${t(label)}${required?' *':''}</label><input id="new-${index}-${name}" name="new-${index}-${name}" data-character-index="${index}" data-character-field="${name}" lang="${fieldLanguage(name)}" value="${esc(entry[name])}" maxlength="${max}" ${required?'required':''} ${state.privateBusy?'readonly':''}></div>`;
  const languages=['ko',...state.translationLanguages];
  const available=languageOptions(languages);
  const languagePicker=available?`<div class="translation-picker"><select id="translation-language" aria-label="${t('addLanguage')}">${available}</select>
    <button type="button" class="secondary-button" data-action="add-language" ${state.privateBusy?'disabled':''}>${t('addLanguage')}</button></div>`:'';
  return `<form id="personal-word-form" novalidate><h3>${t('wordFormTitle')}</h3><p class="field-help">${t('wordFormHelp')}</p><div class="word-form-grid">${field('word','wordFormWord',true,100)}${field('hanja','wordFormHanja',false,100)}</div><p class="field-help">${t('wordFormHanjaHelp')}</p><label for="personal-level">${t('wordLevel')}</label><select id="personal-level" name="level" ${state.privateBusy?'disabled':''}>${['easy','normal','hard','classical'].map(level=>`<option value="${level}" ${state.wordDraft.level===level?'selected':''}>${levelLabel(level)}</option>`).join('')}</select>${languages.map(language=>field(`meaning_${language}`,`wordForm${language[0].toUpperCase()+language.slice(1)}`,language==='ko')).join('')}${languagePicker}<details class="dictionary-extra" ${LANGUAGES.some(language=>state.wordDraft[`example_${language}`])?'open':''}><summary>${t('wordFormExamples')}</summary><div>${languages.map(language=>field(`example_${language}`,`wordFormExample${language[0].toUpperCase()+language.slice(1)}`,false,500)).join('')}</div></details>${state.characterDrafts.length?`<section id="new-characters"><h3>${t('wordFormMissing')}</h3><p class="field-help">${t('wordFormMissingHelp')}</p>${state.characterDrafts.map((entry,index)=>`<fieldset class="new-character"><legend lang="ko">${esc(entry.glyph)}</legend><div class="word-form-grid">${newField(entry,index,'sound_ko','wordFormSound',true,1)}${newField(entry,index,'sound_en','wordFormRoman',false,32)}</div><p class="field-help">${t('wordFormRomanHelp')}</p>${languages.map(language=>newField(entry,index,`meaning_${language}`,`wordForm${language[0].toUpperCase()+language.slice(1)}`,language==='ko',200)).join('')}</fieldset>`).join('')}</section>`:''}<p id="word-form-status" class="form-status" role="alert"></p><div class="account-actions"><button class="primary-button" type="submit" ${state.privateBusy?'disabled':''}>${t('wordFormAdd')}</button><button class="secondary-button" type="button" data-action="word-sample" ${state.privateBusy?'disabled':''}>${t('wordFormSample')}</button></div></form>`;
}

function personalDictionaryEditor() {
  const words=[...state.dictionary.words].sort((a,b)=>a.word.localeCompare(b.word,'ko'));
  const remove=(kind,entry)=>`<button type="button" class="text-button dictionary-delete" data-action="dictionary-delete" data-kind="${kind}" ${kind==='word'?wordAttrs(entry):`data-id="${esc(entry.id)}"`} ${state.privateBusy?'disabled':''}>${t('dictionaryDelete')}</button>`;
  return `<section class="account-card personal-dictionary"><h2>${t('dictionaryTitle')}</h2><p>${t('dictionaryHelp')}</p>${wordRegistrationForm()}<details class="dictionary-extra"><summary>${t('dictionaryImport')}</summary><form id="dictionary-import-form"><p class="field-help">${t('dictionaryImportHelp')}</p><div class="dictionary-file-picker"><button type="button" class="secondary-button" data-action="choose-file" ${state.privateBusy?'disabled':''}>${t('chooseFile')}</button><span id="dictionary-filename" aria-live="polite"></span></div><input hidden id="dictionary-file" name="file" type="file" accept=".json,.jsonl,application/json,application/x-ndjson" ${state.privateBusy?'disabled':''}><p id="dictionary-status" class="form-status" role="alert"></p><button class="secondary-button" type="submit" ${state.privateBusy?'disabled':''}>${t('dictionaryImportButton')}</button></form></details><div class="dictionary-list-heading"><h3>${t('dictionaryRegistered')} · ${words.length}</h3>${DICTIONARY_FIELDS.some(field=>state.dictionary[field].length)?`<button class="text-button" data-action="dictionary-download">${t('dictionaryDownload')}</button>`:''}</div>${words.length?`<div class="dictionary-list">${words.map(word=>`<article class="dictionary-entry"><div><button class="text-button" data-action="open-word" ${wordAttrs(word)}>${esc(word.word)} · ${esc(word.hanja)} ↗</button>${levelBadge(word)}<p>${esc(meaning(word))}</p></div>${remove('word',word)}</article>`).join('')}</div>`:`<p class="field-help">${t('dictionaryEmptyList')}</p>`}${state.dictionary.characters.length||state.dictionary.meta.length?`<details class="dictionary-extra"><summary>${t('dictionaryRegisteredCharacters')} · ${state.dictionary.characters.length} / ${state.dictionary.meta.length}</summary><div class="dictionary-list">${state.dictionary.characters.map(c=>`<article class="dictionary-entry"><div><button class="text-button" data-action="open-character" data-glyph="${esc(c.hanja)}">${esc(c.hanja)} ↗</button><p>${esc(localized(c, 'meaning', state.lang).join(', '))}</p></div>${remove('character',c)}</article>`).join('')}${state.dictionary.meta.map(m=>`<article class="dictionary-entry"><div>${esc(m.sound_ko)} · ${esc(m.sound_en)}</div>${remove('meta',m)}</article>`).join('')}</div></details>`:''}<p class="field-help">${t('dictionaryDeleteHelp')}</p></section>`;
}
function dictionaryMessage(error) {
  if(error.field)return t('dictionaryJSON').replace('{field}',t({words:'dictionaryWords',characters:'dictionaryCharacters',meta:'dictionaryMeta',examples:'dictionaryExamples'}[error.field])).replace('{line}',error.line);
  const key=({invalid:'dictionaryInvalid',dictionary_invalid:'dictionaryInvalid',dictionary_duplicate:'dictionaryDuplicate',limit:'dictionaryLimit'}[error.code]??error.code);
  return (copy[state.lang][key]?t(key):accountMessage(error));
}
function wordFormFailure(form,error) {
  const status=form.querySelector('#word-form-status');
  status.textContent=t(copy[state.lang][error.code]?error.code:'dictionaryInvalid');
  const field=error.glyph?form.querySelector(`[data-character-index="${state.characterDrafts.findIndex(entry=>entry.glyph===error.glyph)}"][data-character-field="${error.field}"]`):form.elements[error.field];
  field?.focus();
}
async function addPersonalWord(event) {
  event.preventDefault();if(state.privateBusy||!state.user)return;
  const form=event.currentTarget,owner=state.user.id;
  let payload;
  try {payload=wordFormPayload(state.wordDraft);}catch(error){wordFormFailure(form,error);return;}
  state.privateBusy=true;
  form.querySelectorAll('input').forEach(input=>input.readOnly=true);
  form.querySelectorAll('button,select').forEach(input=>input.disabled=true);
  form.querySelector('#word-form-status').textContent=t('wordFormChecking');
  let showCharacters=false, failure;
  try {
    const [missing,groups]=await Promise.all([findMissingCharacters(payload.words[0],glyph=>getJSON('/api/characters',glyph)),getJSON('/api/readings')]);
    if(state.user?.id!==owner)return;
    if(missing.some(entry=>!state.characterDrafts.some(draft=>draft.glyph===entry.glyph))) {
      state.characterDrafts=missing.map(entry=>({...entry,...state.characterDrafts.find(draft=>draft.glyph===entry.glyph)}));
      showCharacters=true;return;
    }
    const current=missing.map(entry=>state.characterDrafts.find(draft=>draft.glyph===entry.glyph));
    payload=addMissingCharacters(payload,current,groups);
    const result=await accountRequest('/api/account/dictionary','POST',payload);
    if(state.user?.id!==owner)return;
    state.wordDraft=emptyWordDraft();state.characterDrafts=[];state.translationLanguages=[];
    applyAccount(result);announceAccountChange();toast(t('dictionarySaved'));
  } catch(error) {
    failure=error;
    if(error.account)form.querySelector('#word-form-status').textContent=dictionaryMessage(error);
    else if(error.code)wordFormFailure(form,error);
    else form.querySelector('#word-form-status').textContent=t('accountFailed');
  } finally {
    finishPrivateRequest();
    form.querySelectorAll('input').forEach(input=>input.readOnly=false);
    form.querySelectorAll('button,select').forEach(input=>input.disabled=false);
    if(showCharacters&&state.user?.id===owner&&location.hash==='#account?view=dictionary') {
      renderAccount();$('#word-form-status').textContent=t('wordFormReady');$('#new-characters input')?.focus();
    } else if(state.dictionaryNeedsRefresh)await renderPage();
    else if(!form.isConnected&&state.user?.id===owner&&location.hash==='#account?view=dictionary') {
      renderAccount();
      if(failure?.account)$('#word-form-status').textContent=dictionaryMessage(failure);
      else if(failure?.code)wordFormFailure($('#personal-word-form'),failure);
      else if(failure)$('#word-form-status').textContent=t('accountFailed');
    }
  }
}
async function importPersonalDictionary(event) {
  event.preventDefault();if(state.privateBusy||!state.user)return;
  const form=event.currentTarget,status=form.querySelector('#dictionary-status'),file=form.elements.file.files[0];
  if(!file){status.textContent=t('dictionaryChooseFile');return;}
  if(file.size>1048576){status.textContent=t('dictionarySize');return;}
  const owner=state.user.id;let failure;state.privateBusy=true;
  form.querySelectorAll('input,button').forEach(input=>input.disabled=true);status.textContent=t('accountWorking');
  try {
    const payload=parseDictionaryInput({words:await file.text()});
    if(state.user?.id!==owner)return;
    const result=await accountRequest('/api/account/dictionary','POST',payload);
    if(state.user?.id!==owner)return;
    applyAccount(result);announceAccountChange();toast(t('dictionarySaved'));
  } catch(error) {failure=error;status.textContent=dictionaryMessage(error);}
  finally {
    finishPrivateRequest();form.querySelectorAll('input,button').forEach(input=>input.disabled=false);
    if(state.dictionaryNeedsRefresh)await renderPage();
    else if(!form.isConnected&&state.user?.id===owner&&location.hash==='#account?view=dictionary') {
      renderAccount();
      if(failure)$('#dictionary-status').textContent=dictionaryMessage(failure);
    }
  }
}
async function removePersonalDictionary(button) {
  if(state.privateBusy||!state.user)return;
  const {kind,id,word,hanja}=button.dataset;
  if(!window.confirm(t('dictionaryDeleteHelp')))return;
  state.privateBusy=true;button.disabled=true;
  try {
    applyAccount(await accountRequest('/api/account/dictionary','DELETE',kind==='word'?{kind,word,hanja}:{kind,id}));
    announceAccountChange();toast(t('dictionaryDeleted'));
  } catch(error) {toast(dictionaryMessage(error));}
  finally {finishPrivateRequest();button.disabled=false;updateShell();await renderPage();}
}
function downloadPersonalDictionary() {
  if(!state.user)return;
  try {
    const url=URL.createObjectURL(new Blob([JSON.stringify(state.dictionary,null,2)+'\n'],{type:'application/json;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download=`han-graph-personal-${new Date().toISOString().slice(0,10)}.json`;
    document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch {toast(t('wordbookDownloadError'));}
}
$('#main').addEventListener('input',event=>{
  if(!event.target.closest('#personal-word-form'))return;
  const input=event.target;
  if(input.dataset.characterField) {
    const draft=state.characterDrafts[Number(input.dataset.characterIndex)];
    if(draft)draft[input.dataset.characterField]=input.value;
  } else if(WORD_FORM_FIELDS.includes(input.name)) {
    state.wordDraft[input.name]=input.value;
    if(['word','hanja'].includes(input.name)){state.characterDrafts=[];$('#new-characters')?.remove();}
  }
});

function accountErrorKey(error) {
  return ({invalid:'accountInvalid',google_taken:'googleTaken',google_invalid:'googleInvalid',google_unknown:'googleUnknown',credentials:'accountCredentials',username_taken:'accountTaken',unauthorized:'accountExpired',rate_limit:'accountRate',limit:'accountLimit',conflict:'noteConflict',accounts_unavailable:'accountUnavailable'})[error.code]??'accountFailed';
}
const accountMessage=error=>t(accountErrorKey(error));
async function accountRequest(path,method='GET',body,{keepalive=false}={}) {
  let response;
  try {response=await fetch(path,{method,keepalive,credentials:'same-origin',cache:'no-store',headers:body===undefined?(state.user?{'X-Account-ID':state.user.id}:{}):{'Content-Type':'application/json','X-Account-ID':state.user?.id??''},...(body===undefined?{}:{body:JSON.stringify(body)})});}
  catch {throw Object.assign(new Error('network'),{account:true});}
  let data;
  try {data=await response.json();}catch {throw Object.assign(new Error('response'),{account:true});}
  if(!response.ok)throw Object.assign(new Error(data.error),{account:true,code:data.error,detail:data.detail});
  return data;
}
function applyAccount(data) {
  if('google_client_id' in data)state.googleClientID=data.google_client_id;
  if(state.accountMode==='recover' && (!state.googleClientID || (state.user?.id??null)!==(data.user?.id??null))){
    state.accountMode='login';state.googleProof=null;
  }
  if((state.user?.id??null)!==(data.user?.id??null)){state.session=null;state.googleProof=null;state.translationLanguages=[];}
  if(state.user?.id!==(data.user?.id??null)){state.noteDrafts.clear();state.wordbookStatus=null;state.wordDraft=emptyWordDraft();state.characterDrafts=[];}
  state.user=data.user??null;state.notes=data.notes??[];
  state.dictionary=state.user?(data.dictionary??{words:[],characters:[],meta:[],examples:[]}):{words:[],characters:[],meta:[],examples:[]};
  state.dictionaryRevision=data.dictionary_revision??0;
  if(getJSON.setScope(state.user?.id??'guest',state.dictionaryRevision)) {
    state.dictionaryNeedsRefresh=true;state.detail=null;state.glyph=null;state.search=null;state.stats=null;
    pageEpoch++;detailEpoch++;componentEpoch++;searchEpoch++;clearTimeout(searchTimer);
  }
  state.saved=state.user?normalizeSaved(data.words):normalizeSaved(readStorage('han-graph.words.v1',[]));
  state.accountEnabled=data.enabled!==false;state.accountReady=true;state.accountFailure=null;
}
function finishPrivateRequest() {
  state.privateBusy=false;
  if(state.accountRefreshPending) {
    state.accountRefreshPending=false;
    queueMicrotask(()=>refreshAccount(true));
  }
}
async function refreshAccount(redraw=false) {
  if(state.privateBusy){state.accountRefreshPending=true;return;}
  state.privateBusy=true;
  try {applyAccount(await accountRequest('/api/auth/session'));}
  catch(error){state.accountFailure=accountErrorKey(error);state.accountReady=false;}
  finally {
    finishPrivateRequest();updateShell();
    if(redraw&&state.ready)await renderPage();
  }
}
function announceAccountChange() {
  // No private content, credentials, or tokens go into browser storage.
  try {localStorage.setItem('han-graph.account-event',String(Date.now()));}catch { /* Optional tab notification. */ }
}
function renderAccount() {
  const head=hero('accountEye','accountTitle','accountSub');
  if(!state.accountReady||!state.accountEnabled) {
    $('#main').innerHTML=`${head}<section class="account-card"><p role="alert">${t(state.accountReady?'accountUnavailable':state.accountFailure??'accountFailed')}</p><button class="primary-button" data-action="account-refresh">${t('accountRefresh')}</button></section>`;
    return;
  }
  if(state.user && location.hash==='#account?history=1'){renderPracticeHistory();return;}
  if(state.user && location.hash==='#account?view=dictionary'){
    $('#main').innerHTML=accountNavigation('dictionary')+personalDictionaryEditor();
    $('#personal-word-form').addEventListener('submit',addPersonalWord);
    $('#dictionary-import-form').addEventListener('submit',importPersonalDictionary);
    $('#dictionary-file').addEventListener('change',event=>{$('#dictionary-filename').textContent=event.target.files[0]?.name??'';});
    return;
  }
  if(state.accountMode==='recover' && state.googleClientID){renderRecovery(head);return;}
  if(state.user) {
    const notes=state.notes.filter(note=>note.text).sort((a,b)=>b.updated_at.localeCompare(a.updated_at));
    const guests=normalizeSaved(readStorage('han-graph.words.v1',[]));
    $('#main').innerHTML=`${accountNavigation('settings')}<section class="account-card"><div class="account-heading"><div><span class="tag">${t('account')}</span><h2>${esc(state.user.username)}</h2>${state.user.email?`<p>${t('emailLabel')} · ${esc(state.user.email)}</p>`:''}</div><button class="secondary-button" data-action="logout" ${state.privateBusy?'disabled':''}>${t('logout')}</button></div><p>${t('accountStorage')}</p><div class="account-actions"><a class="primary-button" href="#saved">${t('saved')} · ${state.saved.length} →</a><a class="secondary-button" href="#account?history=1">${t('historyTitle')}</a><button class="text-button" data-action="account-refresh">${t('accountRefresh')}</button></div><div class="credential-settings">${credentialForm('username')}${credentialForm('password')}${emailSettingsForm()}${deleteAccountForm()}</div>${guests.length?`<div class="guest-import"><p>${t('guestImportHelp')}</p><button class="secondary-button" data-action="guest-import" ${state.privateBusy?'disabled':''}>${t('guestImport')} · ${guests.length}</button></div>`:''}</section><section class="account-notes"><h2>${t('notesTitle')} · ${notes.length}</h2>${notes.length?notes.map(note=>`<article class="account-note"><div><button class="text-button" data-action="open-word" ${wordAttrs(note)}>${esc(note.word)} · ${esc(note.hanja)} ↗</button><time datetime="${esc(note.updated_at)}">${localizedDate(new Date(note.updated_at),state.lang)}</time></div><p>${esc(note.text)}</p></article>`).join(''):`<p class="storage-note">${t('noteEmpty')}</p>`}</section>`;
    document.querySelectorAll('.credential-form').forEach(form=>form.addEventListener('submit',changeCredentials));
    $('#email-settings-form')?.addEventListener('submit',linkGoogle);
    $('#delete-account-form').addEventListener('submit',deleteAccount);
    if(state.googleClientID && !state.googleProof) {
      const settings=$('.email-settings');
      if(settings.open)mountGoogleButton('link');
      else settings.addEventListener('toggle',()=>{if(settings.open)mountGoogleButton('link');},{once:true});
    }
    return;
  }
  const registering=state.accountMode==='register';
  const opening=`${head}<section class="account-card account-form-card${state.googleClientID?' google-enabled':''}"><div class="account-tabs" role="group" aria-label="${t('account')}">${['login','register'].map(mode=>`<button class="${state.accountMode===mode?'primary-button':'secondary-button'}" data-action="account-mode" data-mode="${mode}" aria-pressed="${state.accountMode===mode}">${t(mode)}</button>`).join('')}</div>`;
  const proof=registering?state.googleProof:null;
  const needsGoogle=registering && state.googleClientID && !proof;
  const googlePanel=state.googleClientID?(proof?`<p>${t('emailLabel')} · ${esc(proof.email)}</p><button class="text-button" type="button" data-action="google-again">${t('googleChoose')}</button>`:googleButton()):'';
  $('#main').innerHTML=`${opening}${googlePanel}<form id="account-form" ${needsGoogle?'hidden':''}>
    <label for="account-username">${t('username')}</label><input id="account-username" name="username" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" required minlength="3" maxlength="32" pattern="[a-zA-Z0-9](?:[a-zA-Z0-9_]|-){2,31}" aria-describedby="username-help">
    <p id="username-help" class="field-help">${t('usernameHelp')}</p>
    <label for="account-password">${t('password')}</label><input id="account-password" name="password" type="password" autocomplete="${registering?'new-password':'current-password'}" required minlength="${registering?10:1}" maxlength="256" ${registering?'aria-describedby="password-help"':''}>
    ${registering?`<p id="password-help" class="field-help">${t('passwordHelp')}</p><label for="account-confirm">${t('confirmPassword')}</label><input id="account-confirm" name="confirm" type="password" autocomplete="new-password" required maxlength="256">`:''}
    <p id="account-error" class="form-status" role="alert"></p><button class="primary-button" type="submit">${t(state.accountMode)}</button></form>
    ${!registering && state.googleClientID?recoveryButton():''}</section>`;
  if(state.googleClientID && !proof)mountGoogleButton(registering?'register':'login');
  $('#account-form').addEventListener('submit',async event=>{
    event.preventDefault();if(state.privateBusy)return;
    const form=event.currentTarget,button=form.querySelector('[type="submit"]'),error=form.querySelector('#account-error');
    const values=new FormData(form),password=values.get('password');
    if(registering && ([...password].length<10 || [...password].length>128)){error.textContent=t('passwordHelp');return;}
    if(registering && password!==values.get('confirm')){error.textContent=t('passwordMismatch');return;}
    state.privateBusy=true;button.disabled=true;button.textContent=t('accountWorking');
    try {
      applyAccount(await accountRequest(`/api/auth/${registering?'register':'login'}`,'POST',{username:values.get('username'),password,...(proof?{credential:proof.credential}:{})}));
      state.googleProof=null;
      announceAccountChange();toast(t(registering?'accountCreated':'accountWelcome'));updateShell();
    } catch(failure){if(failure.code==='google_invalid'){state.googleProof=null;renderAccount();toast(accountMessage(failure));}else error.textContent=accountMessage(failure);}
    finally {finishPrivateRequest();button.disabled=false;button.textContent=t(registering?'register':'login');if(state.user)await renderPage();}
  });
}
function recoveryButton() {
  return `<button class="text-button" type="button" data-action="account-mode" data-mode="recover">${t('forgotPassword')}</button>`;
}
function recoveryMessage(error) {
  if(error.code==='google_unknown')return t('recoveryUnknown');
  if(['recovery_expired','google_invalid','credentials','unauthorized'].includes(error.code))return t('recoveryExpired');
  return accountMessage(error);
}
function renderRecovery(head) {
  const proof=state.googleProof;
  const controls=proof?`<p>${t('emailLabel')} · ${esc(proof.email)}</p>
    <form id="recovery-form" class="credential-form">
      <label for="recover-password">${t('newPassword')}</label>
      <input id="recover-password" name="password" type="password" autocomplete="new-password" required minlength="10" maxlength="256" aria-describedby="recover-help">
      <p id="recover-help" class="field-help">${t('passwordHelp')}</p>
      <label for="recover-confirm">${t('confirmPassword')}</label>
      <input id="recover-confirm" name="confirm" type="password" autocomplete="new-password" required maxlength="256">
      <p class="form-status" role="alert"></p><button class="primary-button" type="submit">${t('resetPassword')}</button>
    </form><button type="button" class="text-button" data-action="google-again">${t('googleChoose')}</button>`:googleButton();
  $('#main').innerHTML=`${head}<section class="account-card account-form-card google-enabled"><h2>${t('resetPassword')}</h2>
    <p>${t('recoveryHelp')}</p>${controls}<button type="button" class="text-button" data-action="account-mode" data-mode="login">${t(state.user?'personalSettings':'backToLogin')}</button></section>`;
  if(!proof){mountGoogleButton('recover');return;}
  $('#recovery-form').addEventListener('submit',async event=>{
    event.preventDefault();if(state.privateBusy)return;
    const form=event.currentTarget,button=form.querySelector('[type="submit"]'),status=form.querySelector('[role="alert"]');
    const password=form.elements.password.value;
    if([...password].length<10 || [...password].length>128){status.textContent=t('passwordHelp');return;}
    if(password!==form.elements.confirm.value){status.textContent=t('passwordMismatch');return;}
    state.privateBusy=true;button.disabled=true;status.textContent=t('accountWorking');
    try {
      await accountRequest('/api/auth/recovery/reset','POST',{credential:proof.credential,new_password:password});
      state.googleProof=null;state.accountMode='login';applyAccount({user:null});
      announceAccountChange();toast(t('recoveryDone'));updateShell();await renderPage();
      $('#account-username')?.focus();
    } catch(error) {
      if(['recovery_expired','google_invalid','google_unknown','credentials','unauthorized'].includes(error.code)){
        state.googleProof=null;
        if(state.page==='account')renderAccount();
        toast(recoveryMessage(error));
      } else status.textContent=recoveryMessage(error);
    } finally {finishPrivateRequest();button.disabled=false;}
  });
}
function accountNavigation(active) {
  return `<nav class="account-tabs account-sections" aria-label="${t('account')}">${[['settings','#account','personalSettings'],['dictionary','#account?view=dictionary','dictionaryTitle']].map(([key,url,label])=>`<a class="${active===key?'primary-button':'secondary-button'}" href="${url}" ${active===key?'aria-current="page"':''}>${t(label)}</a>`).join('')}</nav>`;
}
function googleButton() {
  return `<div class="google-auth"><div id="google-button"></div><p class="field-help" role="status" id="google-status"></p></div>`;
}
let googleScript;
function loadGoogle() {
  if(!googleScript)googleScript=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='https://accounts.google.com/gsi/client';script.async=true;
    script.onload=()=>{if(window.google?.accounts?.id)resolve(window.google.accounts.id);else{googleScript=null;script.remove();reject(new Error('Google'));}};
    script.onerror=()=>{googleScript=null;script.remove();reject(new Error('Google'));};
    document.head.append(script);
  });
  return googleScript;
}
async function mountGoogleButton(intent) {
  const target=$('#google-button'),status=$('#google-status');
  if(!target || !status)return;
  try {
    const [google,challenge]=await Promise.all([loadGoogle(),accountRequest('/api/auth/google/challenge','POST',{intent})]);
    if(!target.isConnected)return;
    google.initialize({client_id:state.googleClientID,nonce:challenge.nonce,auto_select:false,button_auto_select:false,callback:async({credential})=>{
      if(!target.isConnected || state.privateBusy)return;
      try {
        if(intent==='login') {
          state.privateBusy=true;
          try {applyAccount(await accountRequest('/api/auth/login','POST',{credential}));}
          finally {finishPrivateRequest();}
          announceAccountChange();toast(t('accountWelcome'));updateShell();await renderPage();
        } else if(intent==='recover') {
          state.privateBusy=true;
          let verified;
          try {verified=await accountRequest('/api/auth/recovery/verify','POST',{credential});}
          finally {finishPrivateRequest();}
          if(!target.isConnected)return;
          state.googleProof={credential,email:verified.email};renderAccount();$('#recover-password')?.focus();
        } else {
          // This decoded address is only a preview. The server verifies every claim.
          const raw=credential.split('.')[1].replaceAll('-','+').replaceAll('_','/');
          const payload=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(raw),c=>c.charCodeAt(0))));
          state.googleProof={credential,email:payload.email};renderAccount();
          $(intent==='link'?'#settings-password':'#account-username')?.focus();
        }
      } catch(error){
        if(!target.isConnected)return;
        if(intent==='recover'){
          if(['google_invalid','recovery_expired'].includes(error.code)){renderAccount();toast(recoveryMessage(error));}
          else status.textContent=recoveryMessage(error);
        } else if(error.code==='google_invalid'){renderAccount();toast(accountMessage(error));}
        else status.textContent=accountMessage(error);
      }
    }});
    const options={theme:'outline',size:'large',locale:state.lang,text:intent==='login'?'signin_with':'continue_with'};
    let renderedWidth=0, resizeTimer;
    function renderButton(width) {
      if(!target.isConnected || width<=0 || width===renderedWidth)return;
      renderedWidth=width;
      target.replaceChildren();
      try {google.renderButton(target,{...options,width:String(width)});}
      catch {status.textContent=t('googleUnavailable');}
    }
    renderButton(Math.floor(target.getBoundingClientRect().width));
    const observer=new ResizeObserver(([entry])=>{
      clearTimeout(resizeTimer);
      if(!target.isConnected){observer.disconnect();return;}
      const width=Math.floor(entry.contentRect.width);
      if(width!==renderedWidth)resizeTimer=setTimeout(()=>renderButton(width),120);
    });
    observer.observe(target);
  } catch {if(target.isConnected)status.textContent=t('googleUnavailable');}
}
function credentialForm(kind) {
  const password=kind==='password', title=t(password?'changePassword':'changeUsername');
  const fields=password?`<label for="settings-new-password">${t('newPassword')}</label>
    <input id="settings-new-password" name="new_password" type="password" required minlength="10" maxlength="256" autocomplete="new-password" aria-describedby="settings-password-help">
    <p id="settings-password-help" class="field-help">${t('passwordHelp')}</p>
    <label for="settings-confirm-password">${t('confirmPassword')}</label><input id="settings-confirm-password" name="confirm" type="password" required maxlength="256" autocomplete="new-password">
    <p class="field-help">${t('passwordSessionHint')}</p>`:`<label for="settings-new-username">${t('newUsername')}</label>
    <input id="settings-new-username" name="new_username" required minlength="3" maxlength="32" autocomplete="off" autocapitalize="none" spellcheck="false" pattern="[a-zA-Z0-9](?:[a-zA-Z0-9_]|-){2,31}" aria-describedby="settings-username-help">
    <p id="settings-username-help" class="field-help">${t('usernameHelp')}</p>`;
  return `<details name="account-setting"><summary>${title}</summary><form class="credential-form" data-kind="${kind}">
    <input type="hidden" name="username" autocomplete="username" value="${esc(state.user.username)}">
    <label for="current-${kind}-password">${t('currentPassword')}</label>
    <input id="current-${kind}-password" name="current_password" type="password" required autocomplete="current-password">
    ${fields}<p role="alert" class="form-status"></p><button class="primary-button" type="submit">${title}</button></form>
    ${password && state.googleClientID && state.user.email?recoveryButton():''}</details>`;
}
async function changeCredentials(event) {
  event.preventDefault();
  if(state.privateBusy || !state.user)return;
  const form=event.currentTarget,values=new FormData(form),status=form.querySelector('[role="alert"]'),button=form.querySelector('[type="submit"]');
  const body={username:state.user.username,current_password:values.get('current_password')};
  const password=form.dataset.kind==='password';
  if(password) {
    body.new_password=values.get('new_password');
    const length=[...body.new_password].length;
    if(length<10 || length>128){status.textContent=t('passwordHelp');return;}
    if(body.new_password!==values.get('confirm')){status.textContent=t('passwordMismatch');return;}
  } else {body.new_username=values.get('new_username');}
  state.privateBusy=true;button.disabled=true;status.textContent=t('accountWorking');
  let saved=false;
  try {
    applyAccount(await accountRequest('/api/account/credentials','PUT',body));
    saved=true;form.reset();announceAccountChange();toast(t(password?'passwordChanged':'usernameChanged'));
  } catch(error){status.textContent=accountMessage(error);}
  finally {
    finishPrivateRequest();button.disabled=false;
    if(saved){updateShell();if(state.page==='account')renderAccount();}
  }
}
function emailSettingsForm() {
  if(!state.googleClientID)return '';
  const proof=state.googleProof;
  const action=state.user.email?'changeGoogle':'googleLink';
  const controls=proof?`<form id="email-settings-form"><p>${t('emailLabel')} · ${esc(proof.email)}</p>
    <label for="settings-password">${t('currentPassword')}</label><input id="settings-password" name="password" type="password" autocomplete="current-password" required>
    <p role="status" class="form-status"></p><button class="primary-button" type="submit">${t(action)}</button>
    <button type="button" class="text-button" data-action="google-again">${t('googleChoose')}</button></form>`:googleButton();
  return `<details class="email-settings" name="account-setting" ${proof || !state.user.email?'open':''}><summary>${t(state.user.email?'changeGoogle':'emailSettings')}</summary><p>${t('googleHelp')}</p>${controls}</details>`;
}
async function linkGoogle(event) {
  event.preventDefault();if(state.privateBusy || !state.googleProof || !state.user)return;
  const form=event.currentTarget,button=form.querySelector('[type="submit"]');
  let chooseAgain=false;
  state.privateBusy=true;button.disabled=true;
  try {
    const data=await accountRequest('/api/account/google','POST',{credential:state.googleProof.credential,username:state.user.username,password:form.elements.password.value});
    state.googleProof=null;applyAccount(data);announceAccountChange();toast(t('emailChanged'));
  } catch(error){
    if(error.code==='google_invalid'){state.googleProof=null;chooseAgain=true;toast(accountMessage(error));}
    else form.querySelector('[role="status"]').textContent=accountMessage(error);
  } finally {
    finishPrivateRequest();button.disabled=false;
    if(!state.googleProof && form.isConnected) {
      renderAccount();
      if(chooseAgain)$('.email-settings').open=true;
    }
  }
}
function deleteAccountForm() {
  return `<details class="delete-account" name="account-setting"><summary>${t('deleteAccount')}</summary>
    <p class="field-help" id="delete-account-help">${t('deleteAccountHelp')}</p>
    <form id="delete-account-form" aria-describedby="delete-account-help">
      <input type="hidden" name="username" autocomplete="username" value="${esc(state.user.username)}">
      <label for="delete-account-password">${t('currentPassword')}</label>
      <input id="delete-account-password" type="password" name="current_password" autocomplete="current-password" required>
      <label class="delete-confirm"><input type="checkbox" name="confirm" required> ${t('deleteAccountConfirm')}</label>
      <p role="alert" class="form-status"></p><button class="primary-button" type="submit">${t('deleteAccount')}</button>
    </form></details>`;
}
async function deleteAccount(event) {
  event.preventDefault();
  if(state.privateBusy || !state.user)return;
  const form=event.currentTarget,button=form.querySelector('button'),status=form.querySelector('[role="alert"]');
  const body={username:state.user.username,current_password:form.elements.current_password.value,confirm:form.elements.confirm.checked};
  state.privateBusy=true;button.disabled=true;status.textContent=t('accountWorking');
  try {
    applyAccount(await accountRequest('/api/account','DELETE',body));
    state.accountMode='login';announceAccountChange();toast(t('accountDeleted'));
    updateShell();await renderPage();
  } catch(error){status.textContent=accountMessage(error);}
  finally {finishPrivateRequest();button.disabled=false;}
}
async function logoutAccount() {
  if(state.privateBusy)return;state.privateBusy=true;
  try {applyAccount(await accountRequest('/api/auth/logout','POST',{}));announceAccountChange();toast(t('accountSignedOut'));}
  catch(error){toast(accountMessage(error));}
  finally {finishPrivateRequest();updateShell();await renderPage();}
}
async function importGuestWords() {
  if(state.privateBusy||!state.user)return;
  const words=normalizeSaved(readStorage('han-graph.words.v1',[]));if(!words.length)return;
  state.privateBusy=true;
  try {
    const before=state.saved.length;
    applyAccount(await accountRequest('/api/account/words','POST',{words}));
    toast(t('wordbookImported').replace('{added}',state.saved.length-before).replace('{duplicates}',words.length-(state.saved.length-before)));
  } catch(error){toast(accountMessage(error));}
  finally {finishPrivateRequest();updateShell();if(state.page==='account')renderAccount();else if(state.page==='saved')renderSaved(++pageEpoch);}
}
const storedNote=ref=>state.notes.find(note=>wordKey(note)===wordKey(ref));
function noteEditor(word) {
  if(!state.user)return `<section class="note-editor"><h3>${t('note')}</h3><a class="text-button" href="#account">${t('noteLogin')} →</a></section>`;
  const note=storedNote(word),draft=state.noteDrafts.get(wordKey(word)),text=draft?.text??note?.text??'';
  return `<section class="note-editor"><label for="word-note">${t('note')}</label><p class="field-help" id="note-help">${t('noteHelp')}</p><textarea id="word-note" rows="4" maxlength="10000" placeholder="${t('notePlaceholder')}" aria-describedby="note-help" ${wordAttrs(word)}>${esc(text)}</textarea><div class="note-actions"><button class="primary-button" data-action="note-save" ${wordAttrs(word)} ${state.privateBusy?'disabled':''}>${t('noteSave')}</button>${note?.text?`<button class="text-button" data-action="note-delete" ${wordAttrs(word)}>${t('noteDelete')}</button>`:''}<button class="text-button" data-action="note-reload" ${wordAttrs(word)}>${t('noteReload')}</button></div><p class="form-status" id="note-status" role="status">${draft?t('noteDraft'):''}</p></section>`;
}
async function saveNote(ref,remove=false) {
  if(state.privateBusy||!state.user)return;
  const owner=state.user.id,key=wordKey(ref),old=storedNote(ref),draft=state.noteDrafts.get(key);
  const text=remove?'':draft?.text??old?.text??'';
  if([...text].length>5000){toast(t('noteLimit'));return;}
  const revision=draft?.revision??old?.revision??0;
  state.privateBusy=true;
  const editor=$('#word-note');if(editor)editor.readOnly=true;
  try {
    const result=await accountRequest('/api/account/note','PUT',{...ref,text,revision});
    if(state.user?.id!==owner)return;
    applyAccount(result);
    // A freshly rendered editor may have received more input during this save.
    const latest=state.noteDrafts.get(key);
    if(latest&&latest!==draft)state.noteDrafts.set(key,{text:latest.text,revision:storedNote(ref)?.revision??0});
    else state.noteDrafts.delete(key);
    toast(t(remove?'noteDeleted':'noteSaved'));
    if(wordKey(state.detail?.wordResult?.word??{})===key)renderDetail();
  } catch(error) {
    if($('#note-status')&&wordKey(state.detail?.wordResult?.word??{})===key)$('#note-status').textContent=accountMessage(error);
    else toast(accountMessage(error));
  } finally {
    finishPrivateRequest();
    if(editor)editor.readOnly=false;
    document.querySelectorAll('[data-action="note-save"]').forEach(button=>button.disabled=false);
    if(state.page==='account')renderAccount();
  }
}
async function reloadNote(ref) {
  if(state.privateBusy)return;
  await refreshAccount();
  if(!state.accountReady){toast(t('accountFailed'));return;}
  state.noteDrafts.delete(wordKey(ref));renderDetail();
}
$('#main').addEventListener('input',event=>{
  if(event.target.id!=='word-note'||!state.user)return;
  const {word,hanja}=event.target.dataset,ref={word,hanja},key=wordKey(ref),old=state.noteDrafts.get(key)??storedNote(ref);
  state.noteDrafts.set(key,{text:event.target.value,revision:old?.revision??0});
  $('#note-status').textContent=t('noteDraft');
});
window.addEventListener('beforeunload',event=>{if(state.noteDrafts.size||WORD_FORM_FIELDS.some(field=>field!=='level'&&state.wordDraft[field])){event.preventDefault();event.returnValue='';}});
window.addEventListener('storage',event=>{if(event.key==='han-graph.account-event')refreshAccount(true);});

async function boot() {
  updateShell();
  $('#main').innerHTML=`<div class="loading-panel" role="status">${t('loading')}</div>`;
  try {
    await refreshAccount();
    const [stats,practice,search]=await Promise.all([getJSON('/api/stats'),getJSON('/api/practice'),getJSON(searchPath(state.searchMode),state.query)]);
    Object.assign(state,{stats,practice,search,ready:true,dictionaryNeedsRefresh:false});
    await renderPage();
  } catch {$('#main').innerHTML=errorPanel();}
}
$('#language').addEventListener('change',event=>{clearTimeout(toastTimer);$('#toast').classList.remove('show');$('#toast').textContent='';state.lang=normalizeLanguage(event.target.value);saveStorage('han-graph.language',state.lang);updateShell();if(state.ready)renderPage();else boot();});
$('#main').addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');if(!button)return;
  const {action,word,hanja,glyph,index}=button.dataset;
  if(action==='open-word')routeWord({word,hanja});
  else if(action==='random-word')showRandomWord(button);
  else if(action==='open-character')routeCharacter(glyph);
  else if(action==='component')changeComponent(glyph);
  else if(action==='network-retry')changeComponent(state.glyph);
  else if(action.startsWith('network-'))sizeNetwork(action);
  else if(action==='save')toggleSaved({word,hanja});
  else if(action==='account-mode' && !state.privateBusy){state.accountMode=button.dataset.mode;state.googleProof=null;renderAccount();}
  else if(action==='google-again' && !state.privateBusy){
    state.googleProof=null;renderAccount();
    const settings=$('.email-settings');if(settings)settings.open=true;
  }
  else if(action==='choose-file')$('#dictionary-file')?.click();
  else if(action==='add-language' && !state.privateBusy){
    const lang=$('#translation-language').value;
    if(LANGUAGES.includes(lang) && !state.translationLanguages.includes(lang)){
      state.translationLanguages.push(lang);
      $('#personal-word-form').outerHTML=wordRegistrationForm();$('#personal-word-form').addEventListener('submit',addPersonalWord);
      $('#personal-meaning_'+lang)?.focus();
    }
  }
  else if(action==='word-sample'){const sample={...JSON.parse(DICTIONARY_SAMPLE.words),...JSON.parse(DICTIONARY_SAMPLE.examples)};state.wordDraft=Object.fromEntries(WORD_FORM_FIELDS.map(field=>[field,field.startsWith('meaning_')||field.startsWith('example_')?(['ko',...state.translationLanguages].includes(field.split('_')[1])?sample[field]??'':''):sample[field]??'']));state.characterDrafts=[];renderAccount();$('#personal-word')?.focus();}
  else if(action==='dictionary-delete')removePersonalDictionary(button);
  else if(action==='dictionary-download')downloadPersonalDictionary();
  else if(action==='account-refresh')refreshAccount(true);
  else if(action==='logout')logoutAccount();
  else if(action==='guest-import')importGuestWords();
  else if(action==='note-save')saveNote({word,hanja});
  else if(action==='note-delete')saveNote({word,hanja},true);
  else if(action==='note-reload')reloadNote({word,hanja});
  else if(action==='download-words')downloadWordbook();
  else if(action==='print-words'&&state.saved.length)location.hash='print';
  else if(action==='print-now')printWordbook();
  else if(action==='upload-words')$('#wordbook-file')?.click();
  else if(action==='tab'){state.tab=button.dataset.tab;renderCatalog({scrollTop:0});$(`[data-tab="${state.tab}"]`)?.focus({preventScroll:true});}
  else if(action==='search-mode')changeSearchMode(button.dataset.mode);
  else if(action==='word-level')changeWordLevel(button.dataset.level);
  else if(action==='search-retry')performSearch();
  else if(action==='retry'){if(state.ready)renderPage();else boot();}
  else if(action==='start-practice'){
    const session=createSession(state.practice.questions,Math.random,state.practiceSettings);
    if(!session.questions.length)return;
    session.owner=state.user?.id??null;
    if(session.owner)session.roundID=Array.from(crypto.getRandomValues(new Uint8Array(16)),byte=>byte.toString(16).padStart(2,'0')).join('');
    state.session=session;state.index=0;state.translation=false;renderPractice();
    $('.question-prompt')?.scrollIntoView({block:'nearest'});
  }
  else if(action==='retry-practice'){savePracticeRound(state.session);}
  else if(action==='practice-settings'){state.session=null;renderPractice();$('.practice-settings input:checked')?.focus({preventScroll:true});}
  else if(action==='translation'){state.translation=!state.translation;renderPractice();$('[data-action="translation"]')?.focus({preventScroll:true});}
  else if(action==='answer'){
    const question=state.session?.questions[state.index];
    if(question&&answerQuestion(state.session,state.index,question.options[Number(index)])){if(state.session.owner && state.session.answers.size===state.session.questions.length)savePracticeRound(state.session);renderPractice();$('.answer-feedback')?.focus({preventScroll:true});}
  }
  else if(action==='next-question'&&state.session?.answers.has(state.session.questions[state.index]?.id)){state.index++;state.translation=false;renderPractice();$('.question-prompt, .result-number')?.scrollIntoView({block:'nearest'});}
});
$('#main').addEventListener('change',event=>{
  const input=event.target;
  if(input.name!=='practice-level' || state.session || !PRACTICE_LEVELS.includes(input.value))return;
  state.practiceSettings={level:input.value};
  saveStorage('han-graph.practice-settings.v1',state.practiceSettings);
  renderPractice();
  $(`input[name="${input.name}"][value="${input.value}"]`)?.focus({preventScroll:true});
});
window.addEventListener('hashchange' ,()=>renderPage({revealSelection:true}));
window.addEventListener('resize',()=>{if(state.page==='explore'&&state.detail?.fit)sizeNetwork('network-fit');});
$('.skip-link').addEventListener('click',event=>{event.preventDefault();$('#main').focus();$('#main').scrollIntoView({block:'start'});});
window.addEventListener('storage',event=>{if(event.key==='han-graph.words.v1'&&!state.user){state.saved=normalizeSaved(readStorage(event.key,[]));updateShell();if(state.page==='saved')renderSaved(++pageEpoch);else if(state.page==='explore')renderDetail();}});
document.addEventListener('keydown',event=>{if(event.key==='/'&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&$('#search')){event.preventDefault();$('#search').focus();}});
boot();
