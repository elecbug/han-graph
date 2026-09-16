import {wordKey, normalizeSaved, createSession, answerQuestion, sessionResult, PRACTICE_SESSION_SIZE, WORD_LEVELS, PRACTICE_DIFFICULTIES, filterPracticeQuestions} from './learning.mjs';
import {createDataClient} from './data-client.mjs';
import {layoutNetwork, renderNetworkSVG, filterNetwork} from './network.mjs';
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
const copy = {
  ko: {
    wordLevel:'어휘 분류', levelAll:'전체 어휘', levelNormal:'일반', levelClassical:'고전·문어', levelHint:'검색·랜덤 단어·그래프에 함께 적용해요. 한자는 해당 분류의 연결 단어가 있을 때 표시해요.',
    selectedOutside:'선택한 단어는 현재 어휘 필터에 포함되지 않아요. 상세 정보는 계속 볼 수 있어요.', filteredEmpty:'이 분류의 연결 단어가 없어요. 전체 어휘로 바꾸어 살펴보세요.',
    difficulty:'연습 난이도', difficultyAll:'전체 난이도', difficultyEasy:'기본', difficultyMedium:'응용', difficultyHard:'심화',
    difficultyAllHint:'모든 난이도를 섞어 연습해요.', difficultyEasyHint:'일상 어휘와 명확한 문맥 단서', difficultyMediumHint:'추상적인 뜻과 비슷한 어휘 비교', difficultyHardHint:'고전·전문 어휘와 섬세한 뜻 구분',
    practiceSettings:'연습 설정', changeSettings:'난이도·분류 다시 선택', practiceLevelHint:'정답 어휘의 분류를 선택해요. 탐색 필터와 별도로 적용해요.', noPractice:'이 조건에 맞는 문항이 없어요. 난이도나 어휘 분류를 바꿔 주세요.',
    matchingQuestions:'선택 조건에 맞는 {count}문항', categoryLegend:'그래프 어휘 분류',

    downloadWords:'다운로드', uploadWords:'업로드', transferringWords:'파일 읽는 중…', wordbookHelp:'JSONL 파일로 단어장을 옮겨 보세요. 업로드하면 기존 목록에 합치고 중복은 제외해요.',
    wordbookDownloaded:'단어장을 다운로드했어요.', wordbookImported:'{added}개를 추가했어요. 중복 {duplicates}개는 제외했어요.', wordbookInvalid:'{line}번째 줄을 확인해 주세요. word와 hanja가 있는 JSON 객체가 필요해요.', wordbookEmpty:'파일에 단어가 없어요.', wordbookSize:'1 MB 이하의 파일을 선택해 주세요.', wordbookLimit:'합친 단어장이 500개를 넘어요. 파일이나 단어장을 줄인 뒤 다시 시도해 주세요.', wordbookReadError:'파일을 읽지 못했어요. 다시 선택해 주세요.', wordbookDownloadError:'다운로드하지 못했어요. 다시 시도해 주세요.',
    randomWord:'랜덤 단어', randomHint:'선택한 어휘 분류에서 무작위로 선택', randomLoading:'고르는 중…', randomError:'랜덤 단어를 불러오지 못했어요. 다시 눌러 주세요.',
    workspace:'나의 학습 공간', explore:'단어 탐색', practice:'문맥 연습', saved:'내 단어장', sidebarQuote:'한 글자를 이해하면,<br>더 많은 단어가 보여요.', sidebarSub:'작은 연결에서 시작하는 한국어', local:'나만의 한국어 학습 공간', footer:'하나의 단어에서 시작되는 새로운 이해.',
    exploreTitle:'뜻을 따라, 단어를 연결해요.', exploreSub:'하나의 한자를 이해하면, 새로운 단어가 보입니다.', exploreEye:'EXPLORE THE CONNECTIONS', wordsReady:'탐색할 단어', search:'단어, 한자, 뜻을 찾아보세요', clear:'검색 지우기', browseLabel:'작은 연결에서 시작해 보세요', words:'단어', characters:'한자', entries:'개', searchResults:'검색 결과', limited:'일부 결과를 표시하고 있어요. 검색어를 더 구체적으로 입력해 주세요.',
    searchMode:'검색 범위', searchAll:'전체 검색', searchSound:'소리 검색', soundPlaceholder:'한자 독음으로 검색 (예: 하, ha)', allSearchHint:'단어·한자·독음·뜻을 함께 찾아요.', soundSearchHint:'한자는 같은 독음으로, 단어는 그 음을 포함한 표기로 찾아요. 예: 하 / ha', soundEmptyHint:'한 글자의 독음을 입력해 주세요. 예: 하, 수, ha, su', soundLimited:'일부 단어를 표시하고 있어요. 한자 탭에서 원하는 한자를 골라 연결 단어를 살펴보세요.',
    noResults:'일치하는 항목이 없어요.', searchHint:'다른 단어, 한자 또는 영어 뜻으로 찾아보세요.', wordTag:'WORD EXPLORER', charTag:'CHARACTER EXPLORER', save:'저장하기', savedButton:'저장됨', removed:'단어장에서 삭제했어요.', added:'내 단어장에 저장했어요.', maxSaved:'단어장에 최대 500개까지 저장할 수 있어요.', storageFailed:'이 브라우저에서는 저장할 수 없어 이번 방문 동안만 유지됩니다.',
    breakDown:'단어를 이루는 한자', tapCharacter:'한자를 누르면 그래프에서 강조해요', readingNote:'한자의 뜻은 단어와 문맥에 따라 달라질 수 있어요.', connections:'같은 한자, 다른 단어', graphHint:'한자는 원, 단어는 선 위의 이름이에요. 마우스를 올리거나 키보드로 초점을 두면 연결이 강조돼요.', graphScope:'선택한 한자에서 한 번 연결되는 단어 · 현재 어휘 필터 적용', zoomIn:'확대', zoomOut:'축소', fitGraph:'전체 보기', graphPan:'드래그하거나 그래프에 초점을 두고 방향키로 이동해요. 휠은 페이지를 스크롤해요.', graphRegion:'한자와 단어 연결 그래프', graphSelected:'선택 단어의 구성 한자', currentWord:'선택한 단어', noConnections:'아직 연결된 단어가 없어요.', noConnectionsSub:'이 한자의 단어는 앞으로 채워 갈 예정이에요.', readings:'독음과 뜻', notFound:'이 항목을 찾을 수 없어요.', notFoundSub:'검색 목록에서 다른 항목을 선택해 주세요.',
    savedTitle:'기억하고 싶은 단어들.', savedSub:'다시 만나고 싶은 단어를 한곳에 모아 보세요.', savedEye:'YOUR WORD COLLECTION', storageNote:'단어장은 이 브라우저에 저장됩니다. 다른 기기와는 동기화되지 않아요.', savedEmpty:'아직 모아 둔 단어가 없어요.', savedEmptySub:'탐색 중 마음에 남는 단어를 저장해 보세요.', startExplore:'단어 탐색하기', openWord:'단어 살펴보기', remove:'저장 취소', missingSaved:'현재 데이터에서 찾을 수 없는 저장 항목',
    practiceTitle:'문맥에서 뜻을 발견해요.', practiceSub:'문장의 단서로 상황에 맞는 단어를 골라 보세요.', practiceEye:'A LITTLE PRACTICE', introTitle:'읽고, 추론하고, 이해하기', introSub:'짧은 상황을 읽고 한글 선택지에서 어울리는 단어를 골라 보세요. 답을 고른 뒤 뜻풀이와 한자 구성 해설로 이해를 넓힐 수 있어요.', step1:'상황 읽기', step2:'단어 선택', step3:'해설 확인', startPractice:'연습 시작하기', questions:'문항', practiceRound:'전체 {pool}문항 중 무작위 {count}문항', practiceDraft:'한국어·영어 해설 · 예문 검수 전', chooseWord:'이 상황에 어울리는 단어는 무엇일까요?', pickOnce:'답을 고르면 해설이 나타나요.', showTranslation:'영어 번역 보기', hideTranslation:'영어 번역 접기', correct:'잘 이해했어요!', incorrect:'이 단어의 뜻을 함께 살펴볼까요?', yourChoice:'내가 고른 답', answer:'정답', next:'다음 문항', finish:'결과 보기', exitPractice:'탐색으로 돌아가기', practiceNote:'진행 중인 연습은 페이지를 새로고침하면 초기화됩니다.', summaryTitle:'연결을 한 걸음 더 이해했어요.', summarySub:'맞힌 개수보다, 단어의 뜻을 설명할 수 있는지가 중요해요.', restart:'다시 연습하기', review:'다시 살펴볼 단어', allCorrect:'모든 문항을 맞혔어요. 배운 단어에서 새로운 연결을 찾아보세요.', latest:'지난 연습', loading:'단어의 연결을 불러오고 있어요…', errorTitle:'연결을 불러오지 못했어요.', errorSub:'서버가 실행 중인지 확인하고 다시 시도해 주세요.', retry:'다시 시도', looking:'찾고 있어요…',
  },
  en: {
    wordLevel:'Vocabulary', levelAll:'All vocabulary', levelNormal:'General', levelClassical:'Classical', levelHint:'Applies to search, random words, and the graph. Characters appear when they connect to words in this category.',
    selectedOutside:'The selected word is outside this filter. Its details are still available.', filteredEmpty:'No connected words in this category. Choose all vocabulary to explore more.',
    difficulty:'Practice difficulty', difficultyAll:'All difficulties', difficultyEasy:'Basic', difficultyMedium:'Intermediate', difficultyHard:'Advanced',
    difficultyAllHint:'Practice a mix of all difficulties.', difficultyEasyHint:'Everyday words with clear context clues', difficultyMediumHint:'Abstract meanings and related vocabulary', difficultyHardHint:'Classical or specialist words and subtle distinctions',
    practiceSettings:'Practice settings', changeSettings:'Change difficulty and vocabulary', practiceLevelHint:'Choose the category of the answer word, independently of the explore filter.', noPractice:'No questions match these settings. Change the difficulty or vocabulary category.',
    matchingQuestions:'{count} questions match', categoryLegend:'Graph vocabulary categories',

    downloadWords:'Download', uploadWords:'Upload', transferringWords:'Reading file…', wordbookHelp:'Move your collection with a JSONL file. Uploads merge with your words and skip duplicates.',
    wordbookDownloaded:'Your word collection was downloaded.', wordbookImported:'Added {added} words. Skipped {duplicates} duplicates.', wordbookInvalid:'Check line {line}. Each line needs a JSON object with word and hanja.', wordbookEmpty:'The file contains no words.', wordbookSize:'Choose a file no larger than 1 MB.', wordbookLimit:'The merged collection exceeds 500 words. Reduce the file or your collection and try again.', wordbookReadError:'Could not read the file. Please select it again.', wordbookDownloadError:'Could not download the file. Please try again.',
    randomWord:'Random word', randomHint:'Choose from the selected vocabulary category', randomLoading:'Choosing…', randomError:'Could not load a random word. Please try again.',
    workspace:'YOUR LEARNING SPACE', explore:'Explore', practice:'Practice', saved:'My words', sidebarQuote:'Understand one character.<br>Discover a world of words.', sidebarSub:'Korean, one connection at a time', local:'Your Korean learning space', footer:'A new understanding starts with one word.',
    exploreTitle:'Follow the meaning. Find a connection.', exploreSub:'Understand a character, and see Korean words in a new way.', exploreEye:'EXPLORE THE CONNECTIONS', wordsReady:'words to explore', search:'Search a word, character, or meaning', clear:'Clear search', browseLabel:'Start with a small connection', words:'Words', characters:'Characters', entries:'', searchResults:'Search results', limited:'Showing a selection. Refine your search to find more.',
    searchMode:'Search scope', searchAll:'All fields', searchSound:'By reading', soundPlaceholder:'Hanja reading (e.g. 하, ha)', allSearchHint:'Search words, characters, readings, and meanings.', soundSearchHint:'Find exact character readings and words containing that sound. Try 하 / ha.', soundEmptyHint:'Enter one character’s reading, for example 하, 수, ha, or su.', soundLimited:'Showing some words. Choose a character in the Characters tab to explore its connected words.',
    noResults:'No matches yet.', searchHint:'Try another Korean word, character, or English meaning.', wordTag:'WORD EXPLORER', charTag:'CHARACTER EXPLORER', save:'Save word', savedButton:'Saved', removed:'Removed from your words.', added:'Added to your words.', maxSaved:'You can save up to 500 words.', storageFailed:'Storage is unavailable. Your changes will last for this visit only.',
    breakDown:'The characters inside', tapCharacter:'Select a character to highlight it in the graph', readingNote:'A character’s meaning can change with the word and context.', connections:'One character. More connections.', graphHint:'Circles are characters; words label the lines. Hover or focus with the keyboard to highlight a connection.', graphScope:'Words one connection from the selected characters · Vocabulary filter applied', zoomIn:'Zoom in', zoomOut:'Zoom out', fitGraph:'Fit all', graphPan:'Drag to move, or focus the graph and use arrow keys. Scroll the wheel to move the page.', graphRegion:'Character and word connection graph', graphSelected:'Characters in the selected word', currentWord:'Selected word', noConnections:'No connected words yet.', noConnectionsSub:'Vocabulary for this character will be added over time.', readings:'Readings and meanings', notFound:'This entry could not be found.', notFoundSub:'Choose another entry from the search results.',
    savedTitle:'Words worth coming back to.', savedSub:'Keep the connections you want to remember.', savedEye:'YOUR WORD COLLECTION', storageNote:'Your collection is saved in this browser. It does not sync to other devices.', savedEmpty:'Your collection starts here.', savedEmptySub:'Save a word as you explore to find it here later.', startExplore:'Explore words', openWord:'Explore this word', remove:'Remove saved word', missingSaved:'Saved entries no longer in the current dataset',
    practiceTitle:'Find meaning in context.', practiceSub:'Use the sentence clues to choose the word that fits.', practiceEye:'A LITTLE PRACTICE', introTitle:'Read. Infer. Understand.', introSub:'Read a short situation and choose from Korean word options. After answering, explore the meaning and character explanation.', step1:'Read the context', step2:'Choose a word', step3:'See why', startPractice:'Start practicing', questions:'questions', practiceRound:'{count} random questions from a pool of {pool}', practiceDraft:'Korean and English explanations · Draft examples', chooseWord:'Which word fits this situation?', pickOnce:'Choose an answer to reveal the explanation.', showTranslation:'Show English translation', hideTranslation:'Hide English translation', correct:'You’ve got it!', incorrect:'Let’s take a closer look.', yourChoice:'Your choice', answer:'Answer', next:'Next question', finish:'See results', exitPractice:'Back to exploring', practiceNote:'An unfinished practice session resets when you reload the page.', summaryTitle:'One step closer to understanding.', summarySub:'More than a score, it’s about knowing why a word means what it does.', restart:'Practice again', review:'Words to revisit', allCorrect:'You got every question right. Keep exploring new connections with these words.', latest:'Last practice', loading:'Loading your word connections…', errorTitle:'We couldn’t load the connections.', errorSub:'Check that the server is running, then try again.', retry:'Try again', looking:'Searching…',
  },
};
function readStorage(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
const storedPractice=readStorage('han-graph.practice-settings.v1', {});
const storedLevel=readStorage('han-graph.word-level', 'all');
const state = {
  level:WORD_LEVELS.includes(storedLevel)?storedLevel:'all',
  practiceSettings:{difficulty:PRACTICE_DIFFICULTIES.includes(storedPractice?.difficulty)?storedPractice.difficulty:'all',level:WORD_LEVELS.includes(storedPractice?.level)?storedPractice.level:'all'},
  lang: readStorage('han-graph.language', 'ko') === 'en' ? 'en' : 'ko',
  saved: normalizeSaved(readStorage('han-graph.words.v1', [])),
  page:'explore', query:'', searchMode:'all', tab:'words', search:null, stats:null, practice:null,
  selection:null, detail:null, glyph:null, session:null, index:0, translation:false,
  ready:false, importingWords:false, wordbookStatus:null,
};
let pageEpoch=0, detailEpoch=0, searchEpoch=0, searchTimer, toastTimer;
const t = key => copy[state.lang][key] ?? key;
const searchPath = (mode,level=state.level) => {
  const params=new URLSearchParams();
  if(mode==='sound')params.set('mode',mode);
  if(level!=='all')params.set('level',level);
  return '/api/search'+(params.size?'?'+params:'');
};
const levelLabel = level => t({all:'levelAll',normal:'levelNormal',classical:'levelClassical'}[level]??'levelNormal');
const difficultyLabel = difficulty => t({all:'difficultyAll',easy:'difficultyEasy',medium:'difficultyMedium',hard:'difficultyHard'}[difficulty]??'difficultyAll');
const levelBadge = word => `<span class="level-badge ${word.level==='classical'?'classical':'normal'}">${levelLabel(word.level)}</span>`;
const levelControls = () => `<div class="vocabulary-filters" role="group" aria-label="${t('wordLevel')}"><span>${t('wordLevel')}</span>${WORD_LEVELS.map(level=>`<button type="button" data-action="word-level" data-level="${level}" aria-pressed="${state.level===level}" class="${state.level===level?'active':''}">${levelLabel(level)}</button>`).join('')}</div>`;
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
    <div class="search-filters"><div class="search-modes" role="group" aria-label="${t('searchMode')}">${['all','sound'].map(mode=>`<button type="button" data-action="search-mode" data-mode="${mode}" class="${state.searchMode===mode?'active':''}" aria-pressed="${state.searchMode===mode}">${t(mode==='sound'?'searchSound':'searchAll')}</button>`).join('')}</div><p id="search-mode-hint">${t(state.searchMode==='sound'?'soundSearchHint':'allSearchHint')}</p></div>
    <div class="vocabulary-filter-bar">${levelControls()}<p class="filter-help">${t('levelHint')}</p></div>
    <div class="explore-tools"><form class="search-form" role="search" id="search-form">${icons.search}<input id="search" type="search" maxlength="100" value="${esc(state.query)}" placeholder="${t(state.searchMode==='sound'?'soundPlaceholder':'search')}" aria-label="${t(state.searchMode==='sound'?'soundPlaceholder':'search')}" aria-describedby="search-mode-hint" autocomplete="off"></form><button class="random-button" type="button" data-action="random-word" title="${t('randomHint')}">${icons.shuffle}<span>${t('randomWord')}</span></button></div>
    <div class="section-bar"><span>${t('browseLabel')}</span><span>${state.stats.characters.toLocaleString(state.lang)} ${t('characters')} · ${state.stats.words} ${t('words')}</span></div>
    <div class="explorer"><section class="catalog" aria-label="${t('searchResults')}"><div id="catalog"></div></section><section class="detail-panel" id="detail" aria-label="${t('openWord')}"></section><div class="network-panel" id="network"></div></div>`;
  $('#search-form').addEventListener('submit', event=>{event.preventDefault();state.query=$('#search').value;clearTimeout(searchTimer);performSearch();});
  $('#search').addEventListener('input', event=>{state.query=event.target.value;clearTimeout(searchTimer);searchTimer=setTimeout(performSearch,180);});
  renderCatalog();
  if(state.selection) await loadDetail(state.selection); else $('#detail').innerHTML=`<div class="empty-state">${t('notFoundSub')}</div>`;
  if(revealSelection && query && epoch===pageEpoch && state.page==='explore') {
    const heading=$('#detail .word-title');
    if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}
    $('#detail').scrollIntoView({block:'nearest'});
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
    return `<button class="catalog-item ${selected?'selected':''}" data-action="${word?'open-word':'open-character'}" ${word?wordAttrs(item):`data-glyph="${esc(item.hanja)}"`} ${selected?'aria-current="true"':''}><span class="item-main"><span class="item-title">${esc(title)}</span>${word?levelBadge(item):''}<span class="item-sub">${esc(sub)}</span></span>${word?`<span class="item-hanja">${esc(item.hanja)}</span>`:''}${selected?'<span class="item-arrow">↗</span>':''}</button>`;
  }).join('');
  $('#catalog').innerHTML=`<div class="catalog-tabs" role="group" aria-label="${t('searchResults')}"><button data-action="tab" data-tab="words" class="${state.tab==='words'?'active':''}" aria-pressed="${state.tab==='words'}">${t('words')}<span class="tab-count">${result.word_count}</span></button><button data-action="tab" data-tab="characters" class="${state.tab==='characters'?'active':''}" aria-pressed="${state.tab==='characters'}">${t('characters')}<span class="tab-count">${result.character_count}</span></button></div><div class="catalog-list">${items||`<div class="empty-state"><p>${t('noResults')}</p><p>${t(state.searchMode==='sound'?'soundEmptyHint':'searchHint')}</p></div>`}</div><div class="list-footnote" aria-live="polite">${count>list.length?t(state.searchMode==='sound'?'soundLimited':'limited'):`${t('searchResults')} · ${count} ${t('entries')}`}</div>`;
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
    const response=await fetch(`/api/random-word?${params}`,{cache:'no-store'});
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
  if(state.detail) {
    const visibleNetwork=filterNetwork(state.detail.network,level);
    Object.assign(state.detail,{visibleNetwork,layout:layoutNetwork(visibleNetwork,state.detail.wordResult?.word),zoom:null});
    renderDetail();
    if(graphFocused)$(`#network [data-action="word-level"][data-level="${level}"]`)?.focus({preventScroll:true});
  }
  performSearch();
}
function changeSearchMode(mode) {
  if(!['all','sound'].includes(mode) || mode===state.searchMode)return;
  state.searchMode=mode;
  state.tab=mode==='sound'?'characters':'words';
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
    if(!result.words.length && result.characters.length)state.tab='characters';
    else if(!result.characters.length && result.words.length)state.tab='words';
    renderCatalog();
  } catch {
    if(epoch===searchEpoch && query===state.query && mode===state.searchMode && level===state.level && $('.list-footnote')) $('.list-footnote').innerHTML=`${t('errorTitle')} <button class="text-button" data-action="search-retry">${t('retry')}</button>`;
  } finally {
    if(epoch===searchEpoch)$('#catalog')?.removeAttribute('aria-busy');
  }
}

async function loadDetail(selection) {
  const epoch=++detailEpoch;
  state.selection=selection;
  state.detail=null;
  renderCatalog();
  $('#detail').innerHTML=`<div class="loading-panel" role="status">${t('loading')}</div>`;
  $('#network').innerHTML='';
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
    const visibleNetwork=filterNetwork(network,state.level);
    state.detail={wordResult,characters,network,visibleNetwork,layout:layoutNetwork(visibleNetwork,wordResult?.word),zoom:null};
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
    card=`<div class="word-heading"><div class="word-heading-top"><span class="word-tags"><span class="tag">${t('wordTag')}</span>${levelBadge(word)}</span><button class="save-button ${isSaved(word)?'saved':''}" data-action="save" ${wordAttrs(word)} aria-pressed="${isSaved(word)}">${icons.bookmark}${t(isSaved(word)?'savedButton':'save')}</button></div><div class="word-title-row"><div><h2 class="word-title" lang="ko">${esc(word.word)}</h2><p class="word-meaning">${esc(meaning(word))}</p><p class="word-meaning-en">${esc(state.lang==='ko'?word.meaning_en:word.meaning_ko)}</p></div><span class="word-hanja" lang="ko">${esc(word.hanja)}</span></div></div>
      <div class="components-section"><div class="subheading"><h2>${t('breakDown')}</h2><span>${t('tapCharacter')}</span></div><div class="component-grid">${wordResult.components.map(component=>`<button class="component-card ${component.hanja===state.glyph?'active':''}" data-action="component" data-glyph="${esc(component.hanja)}" aria-pressed="${component.hanja===state.glyph}"><span class="glyph" lang="ko">${esc(component.hanja)}</span><span class="sound">${esc(component.readings.map(reading=>`${reading.sound_ko} · ${reading.sound_en}`).join(' / '))}</span><span class="meaning">${esc(component.readings.map(reading=>reading[state.lang==='ko'?'meaning_ko':'meaning_en'].join(', ')).join(' / '))}</span></button>`).join('<span class="component-plus" aria-hidden="true">+</span>')}</div>${word.semantic_hint?`<p class="semantic-hint">${esc(word.semantic_hint)}</p>`:''}<p class="learning-tip"><span aria-hidden="true">◇</span>${t('readingNote')}</p></div>`;
  } else {
    card=`<div class="word-heading"><div class="word-heading-top"><span class="tag">${t('charTag')}</span></div><div class="word-title-row"><div><h2 class="word-title">${esc(characters.map(c=>c.sound_ko).join(' / '))}</h2><p class="word-meaning">${esc(characters.map(c=>c[state.lang==='ko'?'meaning_ko':'meaning_en'].join(', ')).join(' / '))}</p><p class="word-meaning-en">${esc(characters.map(c=>c[state.lang==='ko'?'meaning_en':'meaning_ko'].join(', ')).join(' / '))}</p></div><span class="word-hanja">${esc(character.hanja)}</span></div></div><div class="components-section"><h3>${t('readings')}</h3>${characters.map(c=>`<p class="word-meaning-en">${esc(c.sound_ko)} · ${esc(c.sound_en)} — ${esc(c.meaning_ko.join(', '))} / ${esc(c.meaning_en.join(', '))}</p>`).join('')}<p class="learning-tip"><span>◇</span>${t('readingNote')}</p></div>`;
  }
  $('#detail').innerHTML=`<article class="word-card">${card}${wordResult&&state.level!=='all'&&wordResult.word.level!==state.level?`<p class="filter-notice">${t('selectedOutside')}</p>`:''}</article>`;
  $('#network').innerHTML=renderNetwork();
  bindNetworkFocus($('.network-canvas svg'),state.detail.layout);
  sizeNetwork(undefined,position);
  bindNetworkDrag($('.network-viewport'), {
    getPosition:()=>state.detail.pan,
    onPan:position=>{state.detail.fit=false;moveNetwork(position);},
  });
}
function renderNetwork() {
  const {visibleNetwork:network,layout}=state.detail;
  const svg=renderNetworkSVG(layout,{lang:state.lang,highlighted:state.glyph,wordLabel:t('openWord'),characterLabel:t('characters'),label:t('graphRegion')});
  return `<section class="network-section"><div class="subheading"><h2>${t('connections')}</h2><span>${network.characters.length} ${t('characters')} · ${network.words.length} ${t('words')}</span></div><p class="network-scope">${t('graphScope')}</p>${levelControls()}<div class="category-legend" aria-label="${t('categoryLegend')}">${['normal','classical'].map(level=>`<span>${levelBadge({level})} ${network.words.filter(word=>word.level===level).length}</span>`).join('')}</div><div class="network-card"><div class="network-toolbar"><span class="network-key"><i></i>${t(state.detail.wordResult?'graphSelected':'characters')}</span><div class="network-controls"><button data-action="network-out" aria-label="${t('zoomOut')}" title="${t('zoomOut')}">−</button><output id="network-scale" aria-live="polite"></output><button data-action="network-in" aria-label="${t('zoomIn')}" title="${t('zoomIn')}">+</button><button data-action="network-fit">${t('fitGraph')}</button></div></div><div class="network-viewport" tabindex="0" role="region" aria-label="${t('graphRegion')}. ${t('graphPan')}"><div class="network-canvas">${svg}</div></div>${network.words.length?'':`<div class="empty-state"><h3>${t('noConnections')}</h3><p>${t(state.level==='all'?'noConnectionsSub':'filteredEmpty')}</p></div>`}<div class="network-caption"><span class="legend-dot"></span><span>${t('graphHint')}<br>${t('graphPan')}</span></div></div></section>`;
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
  $('#main').innerHTML=`${hero('savedEye','savedTitle','savedSub')}<section class="wordbook-tools" aria-label="${t('saved')}"><div><p>${t('wordbookHelp')}</p><p class="storage-note">${t('storageNote')}</p></div><div class="wordbook-actions"><button class="secondary-button" type="button" data-action="download-words" ${state.saved.length?'':'disabled'}>${t('downloadWords')}</button><button class="primary-button" type="button" data-action="upload-words" ${state.importingWords?'disabled':''}>${t(state.importingWords?'transferringWords':'uploadWords')}</button><input id="wordbook-file" type="file" accept=".jsonl,.ndjson,application/x-ndjson,application/jsonl" hidden></div></section><p id="wordbook-status" class="wordbook-status" role="status" aria-live="polite"></p><div id="saved-list" class="loading-panel" role="status">${t('loading')}</div>`;
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
  $('#saved-list').innerHTML=words.length?`<div class="saved-grid">${words.map(word=>`<article class="saved-card"><div class="saved-top"><span class="word-hanja">${esc(word.hanja)}</span><button class="save-button saved" data-action="save" ${wordAttrs(word)} aria-label="${t('remove')}: ${esc(word.word)}">${icons.bookmark}</button></div><h2>${esc(word.word)}</h2>${levelBadge(word)}<p>${esc(meaning(word))}</p><button class="text-button" data-action="open-word" ${wordAttrs(word)}>${t('openWord')} ↗</button></article>`).join('')}</div>`:`<div class="empty-state"><span class="empty-glyph">記</span><h2>${t('savedEmpty')}</h2><p>${t('savedEmptySub')}</p><a class="primary-button" href="#explore">${t('startExplore')} →</a></div>`;
  if(missing.length)$('#saved-list').innerHTML+=`<div class="storage-note">${t('missingSaved')}: ${missing.map(word=>`<button class="text-button" data-action="save" ${wordAttrs(word)}>${esc(word.word)} (${t('remove')})</button>`).join(', ')}</div>`;
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
  if(state.importingWords)return;
  state.importingWords=true;
  const button=$('[data-action="upload-words"]');
  if(button){button.disabled=true;button.textContent=t('transferringWords');}
  try {
    if(file.size>MAX_WORDBOOK_BYTES)throw new WordbookError('size');
    const imported=parseWordbook(await file.text());
    // Merge after reading so a concurrent save or another tab's update is kept.
    const result=mergeWordbook(state.saved,imported);
    const persisted=saveStorage('han-graph.words.v1',result.words);
    state.saved=result.words;
    state.wordbookStatus={key:'wordbookImported',added:result.added,duplicates:result.duplicates,temporary:!persisted};
    updateShell();
    if(state.page==='explore')renderDetail();
  } catch(error) {
    const key={invalid:'wordbookInvalid',empty:'wordbookEmpty',size:'wordbookSize',limit:'wordbookLimit'}[error.code]??'wordbookReadError';
    state.wordbookStatus={key,line:error.line,error:true};
  } finally {
    state.importingWords=false;
    if(state.page==='saved')await renderSaved(++pageEpoch);
  }
}

function practiceSettingsControls() {
  const settings=state.practiceSettings;
  return `<div class="practice-settings">
    <fieldset><legend>${t('wordLevel')}</legend><div class="practice-levels">${WORD_LEVELS.map(level=>`<label><input type="radio" name="practice-level" value="${level}" ${settings.level===level?'checked':''}><span>${levelLabel(level)}</span></label>`).join('')}</div><p class="filter-help">${t('practiceLevelHint')}</p></fieldset>
    <fieldset><legend>${t('difficulty')}</legend><div class="difficulty-options">${PRACTICE_DIFFICULTIES.map(difficulty=>{
      const count=filterPracticeQuestions(state.practice.questions,{...settings,difficulty}).length;
      const hint={all:'difficultyAllHint',easy:'difficultyEasyHint',medium:'difficultyMediumHint',hard:'difficultyHardHint'}[difficulty];
      return `<label class="difficulty-card"><input type="radio" name="practice-difficulty" value="${difficulty}" ${settings.difficulty===difficulty?'checked':''}><span><strong>${difficultyLabel(difficulty)}</strong><small>${t(hint)}</small><small class="difficulty-count">${count} ${t('questions')}</small></span></label>`;
    }).join('')}</div></fieldset>
  </div>`;
}
function renderPractice() {
  const head=hero('practiceEye','practiceTitle','practiceSub');
  if(!state.session) {
    const poolSize=filterPracticeQuestions(state.practice.questions,state.practiceSettings).length;
    const roundLabel=t('practiceRound').replace('{pool}',poolSize).replace('{count}',Math.min(poolSize,PRACTICE_SESSION_SIZE));
    const last=readStorage('han-graph.practice.v1',null);
    const validLast=last&&Number.isInteger(last.correct)&&Number.isInteger(last.total)&&last.total>0&&last.correct>=0&&last.correct<=last.total;
    $('#main').innerHTML=`${head}<div class="practice-wrap"><section class="practice-intro"><div class="practice-art" aria-hidden="true"><span>文</span><i>＋</i><span>脈</span></div><h2>${t('introTitle')}</h2><p>${t('introSub')}</p>${practiceSettingsControls()}<p class="practice-pool" role="status">${poolSize?esc(roundLabel):t('noPractice')}</p><button class="primary-button" data-action="start-practice" ${poolSize?'':'disabled'}>${t('startPractice')} →</button><p class="practice-meta">${t('practiceDraft')}</p>${validLast?`<p class="practice-meta">${t('latest')}: ${last.correct} / ${last.total}${PRACTICE_DIFFICULTIES.includes(last.difficulty)?` · ${difficultyLabel(last.difficulty)}`:''}${WORD_LEVELS.includes(last.level)?` · ${levelLabel(last.level)}`:''}</p>`:''}</section></div>`;
    return;
  }
  const result=sessionResult(state.session);
  if(state.index>=state.session.questions.length){renderSummary(head,result);return;}
  const question=state.session.questions[state.index], answer=state.session.answers.get(question.id);
  $('#main').innerHTML=`${head}<div class="practice-wrap"><div class="practice-progress"><span>${String(state.index+1).padStart(2,'0')} / ${state.session.questions.length}</span><span>${difficultyLabel(state.session.difficulty)} · ${levelLabel(state.session.level)}</span></div><div class="progress-track" role="progressbar" aria-label="${t('practice')}" aria-valuenow="${result.answered}" aria-valuemin="0" aria-valuemax="${result.total}"><div class="progress-fill" style="width:${result.answered/result.total*100}%"></div></div><section class="question-card"><div class="question-tags"><span class="difficulty-badge">${difficultyLabel(question.difficulty)}</span></div><div class="eyebrow">${t('chooseWord')}</div><h2 class="question-prompt" lang="ko">${esc(question.prompt_ko)}</h2><div class="question-help"><span>${t('pickOnce')}</span><button class="text-button" data-action="translation" aria-expanded="${state.translation}">${t(state.translation?'hideTranslation':'showTranslation')}</button></div>${state.translation?`<p class="question-translation" lang="en">${esc(question.prompt_en)}</p>`:''}<div class="options">${question.options.map((option,index)=>{
    const correct=answer&&wordKey(option)===wordKey(question.answer);
    const incorrect=answer&&!answer.correct&&wordKey(option)===wordKey(answer.selected);
    return `<button class="option ${correct?'correct':''} ${incorrect?'incorrect':''}" data-action="answer" data-index="${index}" ${answer?'disabled':''}><strong>${esc(option.word)}</strong><small>${correct?`✓ ${t('answer')}`:incorrect?`× ${t('yourChoice')}`:String(index+1).padStart(2,'0')}</small></button>`;
  }).join('')}</div>${answer?`<div class="answer-feedback ${answer.correct?'':'incorrect'}" role="status" tabindex="-1"><h3>${t(answer.correct?'correct':'incorrect')}</h3>${levelBadge({level:question.word_level})}<p>${esc(state.lang==='ko'?question.explanation_ko:question.explanation_en)}</p></div><div class="question-actions"><button class="text-button" data-action="open-word" ${wordAttrs(question.answer)}>${t('openWord')} ↗</button><button class="primary-button" data-action="next-question">${t(state.index===result.total-1?'finish':'next')} →</button></div>`:''}</section><p class="session-note">${t('practiceNote')}</p></div>`;
}
function renderSummary(head,result) {
  const {difficulty,level}=state.session;
  if(!state.session.recorded&&result.complete) {saveStorage('han-graph.practice.v1',{correct:result.correct,total:result.total,difficulty,level,completedAt:new Date().toISOString()});state.session.recorded=true;}
  $('#main').innerHTML=`${head}<div class="practice-wrap"><section class="practice-intro"><div class="eyebrow">SESSION COMPLETE</div><p class="practice-meta">${difficultyLabel(difficulty)} · ${levelLabel(level)}</p><div class="result-number">${result.correct}<small> / ${result.total}</small></div><h2>${t('summaryTitle')}</h2><p>${t('summarySub')}</p><div class="result-actions"><button class="primary-button" data-action="start-practice">${t('restart')} ↻</button><button class="secondary-button" data-action="practice-settings">${t('changeSettings')}</button><a href="#explore" class="text-button">${t('startExplore')} →</a></div>${result.mistakes.length?`<div class="review-list"><h3>${t('review')}</h3>${result.mistakes.map(question=>`<div class="review-item"><span>↗</span><strong>${esc(question.answer.word)} · ${esc(question.answer.hanja)}</strong><button class="text-button" data-action="open-word" ${wordAttrs(question.answer)}>${t('openWord')}</button></div>`).join('')}</div>`:`<p class="practice-meta">${t('allCorrect')}</p>`}</section></div>`;
}

async function boot() {
  updateShell();
  $('#main').innerHTML=`<div class="loading-panel" role="status">${t('loading')}</div>`;
  try {
    const [stats,practice,search]=await Promise.all([getJSON('/api/stats'),getJSON('/api/practice'),getJSON(searchPath(state.searchMode),state.query)]);
    Object.assign(state,{stats,practice,search,ready:true});
    await renderPage();
  } catch {$('#main').innerHTML=errorPanel();}
}
$('#language').addEventListener('click',()=>{state.lang=state.lang==='ko'?'en':'ko';saveStorage('han-graph.language',state.lang);updateShell();if(state.ready)renderPage();else boot();});
$('#main').addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');if(!button)return;
  const {action,word,hanja,glyph,index}=button.dataset;
  if(action==='open-word')routeWord({word,hanja});
  else if(action==='random-word')showRandomWord(button);
  else if(action==='open-character')routeCharacter(glyph);
  else if(action==='component')changeComponent(glyph);
  else if(action.startsWith('network-'))sizeNetwork(action);
  else if(action==='save')toggleSaved({word,hanja});
  else if(action==='download-words')downloadWordbook();
  else if(action==='upload-words')$('#wordbook-file')?.click();
  else if(action==='tab'){state.tab=button.dataset.tab;renderCatalog();$(`[data-tab="${state.tab}"]`)?.focus({preventScroll:true});}
  else if(action==='search-mode')changeSearchMode(button.dataset.mode);
  else if(action==='word-level')changeWordLevel(button.dataset.level);
  else if(action==='search-retry')performSearch();
  else if(action==='retry'){if(state.ready)renderPage();else boot();}
  else if(action==='start-practice'){
    const session=createSession(state.practice.questions,Math.random,state.practiceSettings);
    if(!session.questions.length)return;
    state.session=session;state.index=0;state.translation=false;renderPractice();
    $('.question-prompt')?.scrollIntoView({block:'nearest'});
  }
  else if(action==='practice-settings'){state.session=null;renderPractice();$('.practice-settings input:checked')?.focus({preventScroll:true});}
  else if(action==='translation'){state.translation=!state.translation;renderPractice();$('[data-action="translation"]')?.focus({preventScroll:true});}
  else if(action==='answer'){
    const question=state.session?.questions[state.index];
    if(question&&answerQuestion(state.session,state.index,question.options[Number(index)])){renderPractice();$('.answer-feedback')?.focus({preventScroll:true});}
  }
  else if(action==='next-question'&&state.session?.answers.has(state.session.questions[state.index]?.id)){state.index++;state.translation=false;renderPractice();$('.question-prompt, .result-number')?.scrollIntoView({block:'nearest'});}
});
$('#main').addEventListener('change',event=>{
  const input=event.target;
  const key=input.name==='practice-level'?'level':input.name==='practice-difficulty'?'difficulty':null;
  if(!key || state.session)return;
  if(!(key==='level'?WORD_LEVELS:PRACTICE_DIFFICULTIES).includes(input.value))return;
  state.practiceSettings[key]=input.value;
  saveStorage('han-graph.practice-settings.v1',state.practiceSettings);
  renderPractice();
  $(`input[name="${input.name}"][value="${input.value}"]`)?.focus({preventScroll:true});
});
window.addEventListener('hashchange' ,()=>renderPage({revealSelection:true}));
window.addEventListener('resize',()=>{if(state.page==='explore'&&state.detail?.fit)sizeNetwork('network-fit');});
$('.skip-link').addEventListener('click',event=>{event.preventDefault();$('#main').focus();$('#main').scrollIntoView({block:'start'});});
window.addEventListener('storage',event=>{if(event.key==='han-graph.words.v1'){state.saved=normalizeSaved(readStorage(event.key,[]));updateShell();if(state.page==='saved')renderSaved(++pageEpoch);else if(state.page==='explore')renderDetail();}});
document.addEventListener('keydown',event=>{if(event.key==='/'&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)&&$('#search')){event.preventDefault();$('#search').focus();}});
boot();
