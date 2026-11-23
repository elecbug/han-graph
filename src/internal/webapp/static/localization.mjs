import {ru} from './localization-ru.mjs';
import {uz} from './localization-uz.mjs';
import {ky} from './localization-ky.mjs';
import {zh} from './localization-zh.mjs';
import {ja} from './localization-ja.mjs';
import {es} from './localization-es.mjs';
import {vi} from './localization-vi.mjs';
import {ne} from './localization-ne.mjs';
import {mn} from './localization-mn.mjs';
import {th} from './localization-th.mjs';

export const copy = {
  ko: {
    listenWord: "발음 듣기",
    listenExample: "한국어 예문 듣기",
    audioFailed: "음원을 재생할 수 없어요. 다시 시도해 주세요.",
    reviewRound: "오답 복습",
    retryMistakes: "틀린 {count} 다시 풀기",
    todayReview: "오늘의 복습 · {count}",
    reviewLoadFailed: "복습할 문제를 불러오지 못했어요.",
    promptLanguage: "문제 언어",
    followInterface: "화면 언어에 맞춤",
    showSupport: "한국어 뜻 보기",
    hideSupport: "한국어 뜻 접기",
    idiomTags: "성어 분류",
    allExpressions: "모든 표현",
    sajaseongeo: "사자성어",
    gosaseongeo: "고사성어",
    fourHanjaRequired: "사자성어의 한자 표기에 한자 네 글자를 입력해 주세요.",
    compareHomonyms: "동음이의어 비교",
    resumePractice: "이어서 풀기",
    practiceAnswered: "{total}문항 중 {done}문항 풀이",
    newPractice: "새 연습 시작",
    searchFilters: "검색 필터",
    "personal":"내 단어", "personalCharacter":"내 한자", "dictionaryTitle":"나만의 사전", "dictionaryHelp":"등록한 단어와 한자는 로그인한 내 계정에서만 기존 사전과 함께 검색되고 연결돼요. 단어장에 저장하거나 노트를 쓸 수도 있어요.", "dictionaryWords":"단어 JSON", "dictionaryCharacters":"새 한자 JSON (선택)", "dictionaryMeta":"새 독음 JSON (선택)", "dictionaryExamples":"예문 JSON (선택)", "dictionaryFormat":"JSON 객체 하나, JSON 배열 또는 한 줄에 한 객체인 JSONL을 입력하세요. 다운로드한 개인 사전 JSON도 여기에 넣을 수 있어요. 단어는 level·word·hanja·meaning_ko·meaning_en·components 필드를 사용해요.", "dictionaryOptional":"새 한자·독음·예문 함께 추가", "dictionaryCharactersHelp":"구성 한자가 사전에 없으면 추가하세요. id는 독음 ID와 3자리 이상 숫자예요. 예: seom-9000. 같은 한자의 새 독음도 추가할 수 있어요.", "dictionaryMetaHelp":"한자 ID 앞부분의 독음 그룹이 없을 때만 입력하세요. 이미 등록된 seom(섬) 같은 독음은 생략해요.", "dictionaryExamplesHelp":"개인 단어의 word·hanja에 연결해요. example_ko는 한국어 한 문장, example_en은 선택적인 영어 번역이에요.", "dictionaryAdd":"개인 사전에 추가", "dictionarySample":"단어 입력 예시 채우기", "dictionaryEmptyList":"아직 직접 등록한 단어가 없어요.", "dictionarySaved":"개인 사전에 추가했어요.", "dictionaryDeleted":"개인 사전에서 삭제했어요.", "dictionaryDelete":"사전에서 삭제", "dictionaryDeleteHelp":"단어를 삭제하면 연결된 예문·단어장 저장·노트도 삭제돼요. 한자·독음은 연결 자료가 남아 있으면 삭제할 수 없어요.", "dictionaryRegistered":"등록한 단어", "dictionaryRegisteredCharacters":"등록한 한자·독음", "dictionaryDownload":"개인 사전 JSON 다운로드", "dictionaryJSON":"{field}의 {line}번째 줄을 확인해 주세요. JSON 객체가 필요해요.", "dictionaryEmpty":"추가할 단어, 한자 또는 독음을 입력해 주세요.", "dictionarySize":"입력한 자료는 합쳐서 1 MiB 이하여야 해요.", "dictionaryInvalid":"JSON 필드와 한자·독음 연결을 확인해 주세요.", "dictionaryDuplicate":"이미 등록된 단어·한자·독음이 있어요. 중복 항목을 제외하고 다시 추가하세요.", "dictionaryLimit":"개인 사전에는 단어 1,000개, 한자 독음 500개, 새 독음 그룹 100개까지 등록할 수 있어요.",
    account:'내 계정', accountTitle:'내 배움을 이어가요.', accountSub:'개인 사전, 단어장과 노트를 계정에 보관하세요.', accountEye:'YOUR PERSONAL SPACE', login:'로그인', register:'회원가입', logout:'로그아웃', username:'아이디', password:'비밀번호', confirmPassword:'비밀번호 확인', usernameHelp:'영문 소문자·숫자로 시작하는 3–32자의 영문, 숫자, _ 또는 -', passwordHelp: "비밀번호는 10–128자로 입력하세요.",
    emailLabel: "이메일 주소",
    emailSettings: "Google 계정 연결",
    googleHelp: "연결할 Gmail 또는 Google Workspace 계정을 선택한 뒤 현재 비밀번호로 확인하세요.",
    googleLink: "Google 계정 연결",
    googleChoose: "다른 Google 계정 선택",
    googleTaken: "이 Google 계정 또는 이메일은 이미 다른 계정에 연결되어 있어요.",
    googleUnknown: "연결된 계정이 없어요. 기존 아이디로 로그인해 Google 계정을 연결하거나 새로 가입하세요.",
    googleInvalid: "Google 인증을 다시 진행해 주세요. Gmail 또는 Google Workspace 계정을 사용하세요.",
    googleUnavailable: "Google 인증을 불러올 수 없어요. 연결을 확인하고 다시 시도해 주세요.",
    changeUsername: "아이디 변경",
    newUsername: "새 아이디",
    usernameChanged: "아이디를 변경했어요.",
    changePassword: "비밀번호 변경",
    newPassword: "새 비밀번호",
    passwordChanged: "비밀번호를 변경했어요.",
    passwordSessionHint: "비밀번호를 변경하면 다른 브라우저와 기기에서는 다시 로그인해야 해요.",
    changeGoogle: "연결된 Google 계정 변경",
    forgotPassword: "비밀번호를 잊으셨나요?",
    resetPassword: "비밀번호 재설정",
    recoveryHelp: "HAN-GRAPH에 연결한 Google 계정으로 다시 인증하세요. 비밀번호를 재설정하면 모든 기기에서 다시 로그인해야 해요.",
    recoveryExpired: "복구 인증이 만료되었어요. Google 계정으로 다시 인증해 주세요.",
    recoveryUnknown: "이 Google 계정으로는 복구할 수 없어요. 복구하려는 HAN-GRAPH 계정에 연결한 Google 계정을 선택해 주세요.",
    recoveryDone: "비밀번호를 재설정했어요. 새 비밀번호로 로그인하세요.",
    backToLogin: "로그인으로 돌아가기",
    deleteAccount: "회원 탈퇴",
    deleteAccountHelp: "탈퇴하면 내 단어장, 개인 사전, 노트와 연습 기록이 영구 삭제되고 모든 기기에서 로그아웃돼요.",
    deleteAccountConfirm: "HAN-GRAPH 계정과 학습 데이터를 영구 삭제하는 데 동의합니다.",
    accountDeleted: "회원 탈퇴가 완료됐어요.",
    personalSettings: "개인 설정",
    addLanguage: "언어 추가",
    chooseFile: "파일 선택",
    currentPassword: "현재 비밀번호",
    emailChanged: "계정 이메일을 변경했어요.",
    historyTitle: "문맥 연습 기록",
    historyEmpty: "아직 완료한 문맥 연습이 없어요.",
    historyMore: "이전 기록 더 보기",
    historySaved: "이번 연습을 계정에 저장했어요.",
    historyFailed: "이번 연습을 저장하지 못했어요. 다시 시도해 주세요.",
passwordMismatch:'비밀번호가 서로 달라요.', accountStorage:'단어장과 노트는 로그인한 계정에 저장돼요. 같은 서버에 접속하면 다른 기기에서도 이어갈 수 있어요.', guestImport:'이 브라우저의 단어 가져오기', guestImportHelp:'로그인 전에 저장한 단어는 별도로 보관돼요. 원할 때 현재 계정으로 합칠 수 있어요.', accountWorking:'저장 중…', accountFailed:'계정에 연결하지 못했어요. 연결을 확인하고 다시 시도해 주세요.', accountUnavailable:'이 서버에서는 계정 기능을 사용할 수 없어요.', accountInvalid:'아이디와 비밀번호 길이, 입력 내용을 확인해 주세요.', accountCredentials:'아이디 또는 비밀번호가 올바르지 않아요.', accountTaken:'이미 사용 중인 아이디예요.', accountExpired:'로그인 상태가 바뀌었거나 만료됐어요. 계정에서 로그인 상태를 새로 확인해 주세요.', accountRate:'로그인 시도가 많아요. 잠시 후 다시 시도해 주세요.', accountLimit:'저장 가능한 개수를 초과했어요. 단어는 500개, 노트는 1,000개까지 만들 수 있어요.', accountRefresh:'로그인 상태 새로 확인', accountWelcome:'로그인했어요.', accountCreated:'계정을 만들었어요.', accountSignedOut:'로그아웃했어요.', accountLoginHint:'로그인하면 단어장과 노트를 계정에 저장할 수 있어요.', example:'예문', note:'내 노트', noteHelp:'뜻을 기억하는 방법이나 나만의 예문을 적어 보세요. 나에게만 보여요.', noteLogin:'로그인하고 이 단어에 노트를 남겨 보세요.', noteSave:'노트 저장', noteDelete:'노트 삭제', noteSaved:'노트를 저장했어요.', noteDeleted:'노트를 삭제했어요.', notePlaceholder:'이 단어를 어떻게 기억하고 싶나요?', noteEmpty:'아직 작성한 노트가 없어요.', notesTitle:'작성한 노트', noteDraft:'아직 저장하지 않은 내용이에요.', noteConflict:'다른 곳에서 이 노트를 수정했어요. 입력 내용은 남겨 두었어요. 저장된 내용을 확인한 뒤 다시 편집해 주세요.', noteReload:'저장된 노트 다시 불러오기', noteLimit:'노트는 5,000자까지 입력할 수 있어요.',

    wordLevel:'어휘 분류', levelAll:'전체 어휘', levelEasy:'기초', levelNormal:'일반', levelHard:'심화', levelClassical:'고전', levelHint:'기초·일반·심화는 단어의 학습 난이도, 고전·문어는 쓰임에 따른 분류예요. 검색·랜덤 단어·그래프에 함께 적용해요.',
    selectedOutside:'선택한 단어는 현재 어휘 필터에 포함되지 않아요. 상세 정보는 계속 볼 수 있어요.', filteredEmpty:'이 분류의 연결 단어가 없어요. 전체 어휘로 바꾸어 살펴보세요.',
    practiceSettings:'연습 설정', changeSettings:'분류 다시 선택', practiceLevelHint:'선택한 단계에서 비슷한 뜻의 단어를 주로 비교해요. 같은 소리의 단어를 한자만으로 구별하는 문제는 없어요.', practiceEasyHint:'학교·이동·돈·시간 등 익숙한 상황에서 단어를 구별해요.', practiceNormalHint:'업무·관계·감정에서 비슷한 말의 쓰임을 비교해요.', practiceHardHint:'추상 개념과 전문 용어의 조건·범위·관계를 살펴봐요.', practiceClassicalHint:'고전 표현이 쓰이는 상황과 뜻의 차이를 읽어요.', meaningContrast:'비슷한 단어 구별', noPractice:'이 분류의 문항이 없어요. 다른 분류를 골라 주세요.',
    matchingQuestions:'선택 조건에 맞는 {count}문항', categoryLegend:'그래프 어휘 분류',

    print:'PDF 인쇄', printWords:'PDF 인쇄', printNow:'PDF 저장 · 인쇄', printBack:'← 단어장으로 돌아가기', printHelp:'인쇄 창에서 “PDF로 저장”을 선택하세요. 용지는 A4, 배율은 100%를 권장해요. 머리글과 바닥글을 끄면 더 깔끔해요.', printLoading:'단어 설명을 모으고 있어요…', printError:'인쇄할 단어 설명을 불러오지 못했어요. 다시 시도해 주세요.', printFontError:'인쇄용 글꼴을 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.', printUnavailable:'인쇄 창을 열지 못했어요. 브라우저의 인쇄 메뉴를 이용해 주세요.',
    downloadWords:'다운로드', uploadWords:'업로드', transferringWords:'파일 읽는 중…', wordbookHelp:'JSONL로 단어장을 옮기거나, 뜻과 설명을 담은 PDF로 간직해 보세요. 업로드한 단어는 중복 없이 합쳐요.',
    noHanja:'이 단어는 한자 구성 없이 뜻과 문맥으로 익혀 보세요.', wordbookDownloaded:'단어장을 다운로드했어요.', wordbookImported:'{added}개를 추가했어요. 중복 {duplicates}개는 제외했어요.', wordbookInvalid:'{line}번째 줄을 확인해 주세요. word와 hanja가 있는 JSON 객체가 필요해요.', wordbookEmpty:'파일에 단어가 없어요.', wordbookSize:'1 MB 이하의 파일을 선택해 주세요.', wordbookLimit:'합친 단어장이 500개를 넘어요. 파일이나 단어장을 줄인 뒤 다시 시도해 주세요.', wordbookReadError:'파일을 읽지 못했어요. 다시 선택해 주세요.', wordbookDownloadError:'다운로드하지 못했어요. 다시 시도해 주세요.',
    randomWord:'랜덤 단어', randomHint:'선택한 어휘 분류에서 무작위로 선택', randomLoading:'고르는 중…', randomError:'랜덤 단어를 불러오지 못했어요. 다시 눌러 주세요.',
    workspace:'나의 학습 공간', explore:'단어 탐색', practice:'문맥 연습', saved:'내 단어장', sidebarQuote:'한 글자를 이해하면,<br>더 많은 단어가 보여요.', sidebarSub:'작은 연결에서 시작하는 한국어', local:'나만의 한국어 학습 공간', footer:'하나의 단어에서 시작되는 새로운 이해.',
    exploreTitle:'뜻을 따라, 단어를 연결해요.', exploreSub:'하나의 한자를 이해하면, 새로운 단어가 보입니다.', exploreEye:'EXPLORE THE CONNECTIONS', wordsReady:'탐색할 단어', search:'단어, 한자, 뜻을 찾아보세요', clear:'검색 지우기', browseLabel:'작은 연결에서 시작해 보세요', words:'단어', characters:'한자', searchResults:'검색 결과', limited:'일부 결과를 표시하고 있어요. 검색어를 더 구체적으로 입력해 주세요.',
    searchMode:'검색 범위', searchAll:'전체 검색', searchSound:'소리 검색', soundPlaceholder:'한자 독음으로 검색 (예: 하, ha)', allSearchHint:'단어·한자·독음·뜻을 함께 찾아요.', soundSearchHint:'한자는 같은 독음으로, 단어는 그 음을 포함한 표기로 찾아요. 예: 하 / ha', soundEmptyHint:'한 글자의 독음을 입력해 주세요. 예: 하, 수, ha, su', soundLimited:'일부 단어를 표시하고 있어요. 한자 탭에서 원하는 한자를 골라 연결 단어를 살펴보세요.',
    noResults:'일치하는 항목이 없어요.', searchHint:'다른 단어, 한자 또는 영어 뜻으로 찾아보세요.', wordTag:'WORD EXPLORER', charTag:'CHARACTER EXPLORER', save:'저장하기', savedButton:'저장됨', removed:'단어장에서 삭제했어요.', added:'내 단어장에 저장했어요.', maxSaved:'단어장에 최대 500개까지 저장할 수 있어요.', storageFailed:'이 브라우저에서는 저장할 수 없어 이번 방문 동안만 유지됩니다.',
    breakDown:'단어를 이루는 한자', tapCharacter:'한자를 누르면 관련 단어를 볼 수 있어요', readingNote:'한자의 뜻은 단어와 문맥에 따라 달라질 수 있어요.', mixedWordNote:'한글 부분은 그대로 읽고, 굵게 표시한 한자 부분만 연결해요.', connections:'같은 한자, 다른 단어', graphHint:'가운데 한자와 관련 단어를 연결해요. 단어를 누르면 뜻과 구성을 볼 수 있어요.', graphScope:'선택한 한자 하나와 직접 연결된 단어 · 현재 어휘 필터 적용', zoomIn:'확대', zoomOut:'축소', fitGraph:'전체 보기', graphPan:'드래그하거나 그래프에 초점을 두고 방향키로 이동해요. 휠은 페이지를 스크롤해요.', graphRegion:'한자와 단어 연결 그래프', graphSelected:'선택한 한자', currentWord:'선택한 단어', noConnections:'아직 연결된 단어가 없어요.', noConnectionsSub:'이 한자의 단어는 앞으로 채워 갈 예정이에요.', readings:'독음과 뜻', notFound:'이 항목을 찾을 수 없어요.', notFoundSub:'검색 목록에서 다른 항목을 선택해 주세요.',
    savedTitle:'기억하고 싶은 단어들.', savedSub:'다시 만나고 싶은 단어를 한곳에 모아 보세요.', savedEye:'YOUR WORD COLLECTION', storageNote:'단어장은 이 브라우저에 저장됩니다. 다른 기기와는 동기화되지 않아요.', savedEmpty:'아직 모아 둔 단어가 없어요.', savedEmptySub:'탐색 중 마음에 남는 단어를 저장해 보세요.', startExplore:'단어 탐색하기', openWord:'단어 살펴보기', remove:'저장 취소', missingSaved:'현재 데이터에서 찾을 수 없는 저장 항목',
    practiceTitle:'문맥에서 뜻을 발견해요.', practiceSub:'문장의 단서로 상황에 맞는 단어를 골라 보세요.', practiceEye:'A LITTLE PRACTICE', introTitle:'읽고, 추론하고, 이해하기', introSub:'짧은 상황을 읽고 한글 선택지에서 어울리는 단어를 골라 보세요. 답을 고른 뒤 뜻풀이와 한자 구성 해설로 이해를 넓힐 수 있어요.', step1:'상황 읽기', step2:'단어 선택', step3:'해설 확인', startPractice:'연습 시작하기', questions:'문항', practiceRound:'전체 {pool}문항 중 무작위 {count}문항', chooseWord:'이 상황에 어울리는 단어는 무엇일까요?', pickOnce:'답을 고르면 해설이 나타나요.', showTranslation:'영어 번역 보기', hideTranslation:'영어 번역 접기', correct:'잘 이해했어요!', incorrect:'이 단어의 뜻을 함께 살펴볼까요?', yourChoice:'내가 고른 답', answer:'정답', next:'다음 문항', finish:'결과 보기', exitPractice:'탐색으로 돌아가기', practiceNote:'이 브라우저에서 다음에 풀 문항부터 이어갈 수 있습니다.', summaryTitle:'연결을 한 걸음 더 이해했어요.', summarySub:'맞힌 개수보다, 단어의 뜻을 설명할 수 있는지가 중요해요.', restart:'다시 연습하기', review:'다시 살펴볼 단어', allCorrect:'모든 문항을 맞혔어요. 배운 단어에서 새로운 연결을 찾아보세요.', latest:'지난 연습', loading:'단어의 연결을 불러오고 있어요…', errorTitle:'연결을 불러오지 못했어요.', errorSub:'서버가 실행 중인지 확인하고 다시 시도해 주세요.', retry:'다시 시도', looking:'찾고 있어요…',
  },
  en: {
    listenWord: "Listen to pronunciation",
    listenExample: "Listen to the Korean example",
    audioFailed: "Couldn't play the audio. Please try again.",
    reviewRound: "Mistake review",
    retryMistakes: "Retry mistakes · {count}",
    todayReview: "Today’s review · {count}",
    reviewLoadFailed: "Couldn’t load your review questions.",
    promptLanguage: "Question language",
    followInterface: "Same as interface",
    showSupport: "Show English translation",
    hideSupport: "Hide English translation",
    idiomTags: "Idiom type",
    allExpressions: "All expressions",
    sajaseongeo: "Four-character idiom",
    gosaseongeo: "Classical allusion",
    fourHanjaRequired: "Enter four Hanja characters for a four-character idiom.",
    compareHomonyms: "Compare homonyms",
    resumePractice: "Resume practice",
    practiceAnswered: "{done} of {total} answered",
    newPractice: "Start a new round",
    searchFilters: "Search filters",
    "personal":"My entry", "personalCharacter":"My character", "dictionaryTitle":"My personal dictionary", "dictionaryHelp":"Your entries join the public dictionary in searches and connections only while you are signed in. You can save them to your word collection and write notes.", "dictionaryWords":"Word JSON", "dictionaryCharacters":"New character JSON (optional)", "dictionaryMeta":"New reading JSON (optional)", "dictionaryExamples":"Example JSON (optional)", "dictionaryFormat":"Enter one JSON object, an array, or JSONL with one object per line. You can also paste downloaded personal dictionary JSON here. Words use level, word, hanja, meaning_ko, meaning_en, and components.", "dictionaryOptional":"Add characters, readings, or examples", "dictionaryCharactersHelp":"Add characters missing from the dictionary. An id is a reading group ID followed by at least three digits, such as seom-9000. You can also add a new reading for a character.", "dictionaryMetaHelp":"Only add a reading group if the prefix of the character id is missing. Omit groups already registered, such as seom (섬).", "dictionaryExamplesHelp":"Match a personal word using word and hanja. example_ko is one Korean sentence; example_en is its optional English translation.", "dictionaryAdd":"Add to personal dictionary", "dictionarySample":"Fill word example", "dictionaryEmptyList":"You have not registered any words yet.", "dictionarySaved":"Added to your personal dictionary.", "dictionaryDeleted":"Removed from your personal dictionary.", "dictionaryDelete":"Delete entry", "dictionaryDeleteHelp":"Deleting a word also deletes its example, saved reference, and note. Characters and reading groups cannot be deleted while entries still depend on them.", "dictionaryRegistered":"Registered words", "dictionaryRegisteredCharacters":"Registered characters and readings", "dictionaryDownload":"Download personal dictionary JSON", "dictionaryJSON":"Check line {line} of {field}. A JSON object is required.", "dictionaryEmpty":"Enter words, characters, or readings to add.", "dictionarySize":"The combined input must be at most 1 MiB.", "dictionaryInvalid":"Check the JSON fields and character/reading references.", "dictionaryDuplicate":"A word, character, or reading is already registered. Remove duplicates and try again.", "dictionaryLimit":"Your personal dictionary can hold 1,000 words, 500 character readings, and 100 new reading groups.",
    account:'My account', accountTitle:'Keep your learning with you.', accountSub:'Keep your personal dictionary, word collection, and notes in your account.', accountEye:'YOUR PERSONAL SPACE', login:'Log in', register:'Sign up', logout:'Log out', username:'Username', password:'Password', confirmPassword:'Confirm password', usernameHelp:'3–32 lowercase letters, numbers, _ or -; start with a letter or number.', passwordHelp: "Use 10–128 characters.",
    emailLabel: "Email address",
    emailSettings: "Google account",
    googleHelp: "Choose a Gmail or Google Workspace account and confirm with your current password.",
    googleLink: "Link Google account",
    googleChoose: "Choose another Google account",
    googleTaken: "This Google account or email is linked to another account.",
    googleUnknown: "No linked account found. Sign in with your username to link Google, or sign up.",
    googleInvalid: "Verify again with a Gmail or Google Workspace account.",
    googleUnavailable: "Google sign-in could not load. Check your connection and try again.",
    changeUsername: "Change username",
    newUsername: "New username",
    usernameChanged: "Your username has been updated.",
    changePassword: "Change password",
    newPassword: "New password",
    passwordChanged: "Your password has been updated.",
    passwordSessionHint: "Changing your password signs you out on other browsers and devices.",
    changeGoogle: "Change linked Google account",
    forgotPassword: "Forgot password?",
    resetPassword: "Reset password",
    recoveryHelp: "Verify your identity again with the Google account linked to HAN-GRAPH. Resetting your password signs you out on all devices.",
    recoveryExpired: "Your recovery verification has expired. Verify with Google again.",
    recoveryUnknown: "Choose the Google account linked to the HAN-GRAPH account you want to recover.",
    recoveryDone: "Your password has been reset. Sign in with your new password.",
    backToLogin: "Back to sign in",
    deleteAccount: "Delete account",
    deleteAccountHelp: "Deleting your account permanently removes your saved words, personal dictionary, notes and practice history, and signs you out on all devices.",
    deleteAccountConfirm: "I agree to permanently delete my HAN-GRAPH account and learning data.",
    accountDeleted: "Your account has been deleted.",
    personalSettings: "Personal settings",
    addLanguage: "Add language",
    chooseFile: "Choose file",
    currentPassword: "Current password",
    emailChanged: "Your account email has been updated.",
    historyTitle: "Practice history",
    historyEmpty: "You haven’t completed a practice round yet.",
    historyMore: "Show older rounds",
    historySaved: "This round has been saved to your account.",
    historyFailed: "This round could not be saved. Please try again.",
passwordMismatch:'The passwords do not match.', accountStorage:'Your words and notes are saved to your account. Sign in on the same server to continue on another device.', guestImport:'Import this browser’s words', guestImportHelp:'Words saved before signing in are kept separately. You can merge them into this account.', accountWorking:'Saving…', accountFailed:'Could not connect to your account. Check your connection and try again.', accountUnavailable:'Accounts are unavailable on this server.', accountInvalid:'Check the username, password length, and input.', accountCredentials:'Incorrect username or password.', accountTaken:'This username is already in use.', accountExpired:'Your login changed or expired. Refresh your login status on the account page.', accountRate:'Too many login attempts. Please try again later.', accountLimit:'Storage limit reached: 500 words and 1,000 notes.', accountRefresh:'Refresh login status', accountWelcome:'You are logged in.', accountCreated:'Your account is ready.', accountSignedOut:'You are logged out.', accountLoginHint:'Log in to keep your words and notes in your account.', example:'Example', note:'My note', noteHelp:'Write a memory aid or your own example. Only you can see it.', noteLogin:'Log in to write a note for this word.', noteSave:'Save note', noteDelete:'Delete note', noteSaved:'Your note was saved.', noteDeleted:'Your note was deleted.', notePlaceholder:'How would you like to remember this word?', noteEmpty:'No notes yet.', notesTitle:'Your notes', noteDraft:'You have unsaved changes.', noteConflict:'This note was edited elsewhere. Your draft is still here. Load the saved note before editing again.', noteReload:'Reload saved note', noteLimit:'Notes can contain up to 5,000 characters.',

    wordLevel:'Vocabulary', levelAll:'All vocabulary', levelEasy:'Easy', levelNormal:'General', levelHard:'Advanced', levelClassical:'Classical', levelHint:'Easy, General, and Advanced describe vocabulary difficulty; Classical describes historical or literary usage. Applies to search, random words, and the graph.',
    selectedOutside:'The selected word is outside this filter. Its details are still available.', filteredEmpty:'No connected words in this category. Choose all vocabulary to explore more.',
    practiceSettings:'Practice settings', changeSettings:'Change category', practiceLevelHint:'Most questions compare related meanings at your selected level. No question relies on distinguishing homonyms by Chinese characters.', practiceEasyHint:'Distinguish everyday words about school, travel, money, and time.', practiceNormalHint:'Compare related words used in work, relationships, and emotions.', practiceHardHint:'Consider the conditions, scope, and relationships of abstract or technical concepts.', practiceClassicalHint:'Read the situations and meanings behind classical expressions.', meaningContrast:'Distinguish related words', noPractice:'No questions in this category. Choose another category.',
    matchingQuestions:'{count} questions match', categoryLegend:'Graph vocabulary categories',

    print:'Print PDF', printWords:'Print PDF', printNow:'Save PDF / Print', printBack:'← Back to my words', printHelp:'Choose “Save as PDF” in the print dialog. Use A4 paper at 100% scale. Turn off browser headers and footers for a cleaner layout.', printLoading:'Gathering your word descriptions…', printError:'Could not load the word descriptions for printing. Please try again.', printFontError:'Could not load the print font. Check your connection and try again.', printUnavailable:'Could not open the print dialog. Please use your browser’s print menu.',
    downloadWords:'Download', uploadWords:'Upload', transferringWords:'Reading file…', wordbookHelp:'Move your collection with JSONL, or print a PDF with meanings and explanations. Uploads merge without duplicates.',
    noHanja:'Learn this word through its meaning and context; no Hanja breakdown is provided.', wordbookDownloaded:'Your word collection was downloaded.', wordbookImported:'Added {added} words. Skipped {duplicates} duplicates.', wordbookInvalid:'Check line {line}. Each line needs a JSON object with word and hanja.', wordbookEmpty:'The file contains no words.', wordbookSize:'Choose a file no larger than 1 MB.', wordbookLimit:'The merged collection exceeds 500 words. Reduce the file or your collection and try again.', wordbookReadError:'Could not read the file. Please select it again.', wordbookDownloadError:'Could not download the file. Please try again.',
    randomWord:'Random word', randomHint:'Choose from the selected vocabulary category', randomLoading:'Choosing…', randomError:'Could not load a random word. Please try again.',
    workspace:'YOUR LEARNING SPACE', explore:'Explore', practice:'Practice', saved:'My words', sidebarQuote:'Understand one character.<br>Discover a world of words.', sidebarSub:'Korean, one connection at a time', local:'Your Korean learning space', footer:'A new understanding starts with one word.',
    exploreTitle:'Follow the meaning. Find a connection.', exploreSub:'Understand a character, and see Korean words in a new way.', exploreEye:'EXPLORE THE CONNECTIONS', wordsReady:'words to explore', search:'Search a word, character, or meaning', clear:'Clear search', browseLabel:'Start with a small connection', words:'Words', characters:'Characters', searchResults:'Search results', limited:'Showing a selection. Refine your search to find more.',
    searchMode:'Search scope', searchAll:'All fields', searchSound:'By reading', soundPlaceholder:'Hanja reading (e.g. 하, ha)', allSearchHint:'Search words, characters, readings, and meanings.', soundSearchHint:'Find exact character readings and words containing that sound. Try 하 / ha.', soundEmptyHint:'Enter one character’s reading, for example 하, 수, ha, or su.', soundLimited:'Showing some words. Choose a character in the Characters tab to explore its connected words.',
    noResults:'No matches yet.', searchHint:'Try another Korean word, character, or English meaning.', wordTag:'WORD EXPLORER', charTag:'CHARACTER EXPLORER', save:'Save word', savedButton:'Saved', removed:'Removed from your words.', added:'Added to your words.', maxSaved:'You can save up to 500 words.', storageFailed:'Storage is unavailable. Your changes will last for this visit only.',
    breakDown:'The characters inside', tapCharacter:'Select a character to see its related words', readingNote:'A character’s meaning can change with the word and context.', mixedWordNote:'Read the Hangul portions as written. Only the bold Hanja portions form connections.', connections:'One character. More connections.', graphHint:'The central character connects to related words. Select a word to see its meaning and characters.', graphScope:'One selected character and its directly related words · Vocabulary filter applied', zoomIn:'Zoom in', zoomOut:'Zoom out', fitGraph:'Fit all', graphPan:'Drag to move, or focus the graph and use arrow keys. Scroll the wheel to move the page.', graphRegion:'Character and word connection graph', graphSelected:'Selected character', currentWord:'Selected word', noConnections:'No connected words yet.', noConnectionsSub:'Vocabulary for this character will be added over time.', readings:'Readings and meanings', notFound:'This entry could not be found.', notFoundSub:'Choose another entry from the search results.',
    savedTitle:'Words worth coming back to.', savedSub:'Keep the connections you want to remember.', savedEye:'YOUR WORD COLLECTION', storageNote:'Your collection is saved in this browser. It does not sync to other devices.', savedEmpty:'Your collection starts here.', savedEmptySub:'Save a word as you explore to find it here later.', startExplore:'Explore words', openWord:'Explore this word', remove:'Remove saved word', missingSaved:'Saved entries no longer in the current dataset',
    practiceTitle:'Find meaning in context.', practiceSub:'Use the sentence clues to choose the word that fits.', practiceEye:'A LITTLE PRACTICE', introTitle:'Read. Infer. Understand.', introSub:'Read a short situation and choose from Korean word options. After answering, explore the meaning and character explanation.', step1:'Read the context', step2:'Choose a word', step3:'See why', startPractice:'Start practicing', questions:'questions', practiceRound:'{count} random questions from a pool of {pool}', chooseWord:'Which word fits this situation?', pickOnce:'Choose an answer to reveal the explanation.', showTranslation:'Show English translation', hideTranslation:'Hide English translation', correct:'You’ve got it!', incorrect:'Let’s take a closer look.', yourChoice:'Your choice', answer:'Answer', next:'Next question', finish:'See results', exitPractice:'Back to exploring', practiceNote:'You can return to this browser and continue from the next unanswered question.', summaryTitle:'One step closer to understanding.', summarySub:'More than a score, it’s about knowing why a word means what it does.', restart:'Practice again', review:'Words to revisit', allCorrect:'You got every question right. Keep exploring new connections with these words.', latest:'Last practice', loading:'Loading your word connections…', errorTitle:'We couldn’t load the connections.', errorSub:'Check that the server is running, then try again.', retry:'Try again', looking:'Searching…',
  },
};
Object.assign(copy, {ru, uz, ky, zh, ja, es, vi, ne, mn, th});
copy.ko.languageLabel='화면 언어';
copy.en.languageLabel='Interface language';
copy.ko.studio='학습 공간';
copy.en.studio='LEARNING STUDIO';
copy.ko.dictionaryFormat+=' 추가 언어의 뜻은 선택해서 입력할 수 있어요.';
copy.en.dictionaryFormat+=' Translations into additional languages are optional.';
copy.ko.dictionaryExamplesHelp+=' 다른 언어의 번역도 선택해서 입력할 수 있어요.';
copy.en.dictionaryExamplesHelp+=' Other translations are optional.';
copy.ko.searchHint='다른 단어, 한자 또는 영어·러시아어 뜻으로 찾아보세요.';
copy.en.searchHint='Try another Korean word, character, or English or Russian meaning.';

const languageNames = {
  ko: {native:'한국어', english:'Korean'},
  en: {native:'English', english:'English'},
  ru: {native:'Русский', english:'Russian'},
  uz: {native:'Oʻzbekcha', english:'Uzbek'},
  ky: {native:'Кыргызча', english:'Kyrgyz'},
  zh: {native:'简体中文', english:'Chinese'},
  ja: {native:'日本語', english:'Japanese'},
  es: {native:'Español', english:'Spanish'},
  ne: {native:'नेपाली', english:'Nepali'},
  mn: {native:'Монгол хэл', english:'Mongolian'},
  th: {native:'ไทย', english:'Thai'},
  vi: {native:'Tiếng Việt', english:'Vietnamese'},
};
export const LANGUAGES = Object.keys(languageNames);
export function languageLabel(language) {
  const {native,english}=languageNames[language];
  return `${native}(${english})`;
}
export function orderedLanguages(browserLanguages) {
  const preferred=browserLanguages.map(tag=>tag.toLowerCase().split('-')[0]).find(lang=>LANGUAGES.includes(lang));
  const first=[...new Set([preferred,'ko','en'].filter(Boolean))];
  const remaining=LANGUAGES.filter(lang=>!first.includes(lang));
  return first.concat(remaining.sort((a,b)=>languageNames[a].english.localeCompare(languageNames[b].english,'en')));
}
export const DATE_LOCALES = {ko:'ko-KR',en:'en-GB',ru:'ru-RU',uz:'uz-UZ',ky:'ky-KG',zh:'zh-Hans',ja:'ja-JP',es:'es',vi:'vi-VN',ne:'ne-NP',mn:'mn-MN',th:'th-TH'};
export const normalizeLanguage = value => LANGUAGES.includes(value) ? value : 'ko';

export function practiceLanguages(uiLanguage, preference) {
  const primary = LANGUAGES.includes(preference) ? preference : uiLanguage;
  if (primary !== uiLanguage) return {primary, support:uiLanguage};
  return {primary, support:primary === 'ko' ? 'en' : 'ko'};
}

export function localizedDate(date, language = 'ko') {
  const locale = DATE_LOCALES[normalizeLanguage(language)];
  if (Intl.DateTimeFormat.supportedLocalesOf([locale]).length) {
    return new Intl.DateTimeFormat(locale, {year:'numeric',month:'long',day:'numeric'}).format(date);
  }
  // Some browsers lack Kyrgyz locale data and would silently show English months.
  return [date.getDate(), date.getMonth() + 1, date.getFullYear()]
    .map((value, index) => index < 2 ? String(value).padStart(2, '0') : value).join('.');
}

// Keep interface languages separate; missing private translations get a local label.
export function localized(record, field, language = 'ko') {
  const lang = normalizeLanguage(language);
  const key = field === 'semantic_hint' && lang === 'ko' ? field : `${field}_${lang}`;
  const value = record?.[key];
  if (typeof value === 'string' && value.trim() || Array.isArray(value) && value.length) return value;
  if (field === 'semantic_hint') return '';
  if (field !== 'meaning') return copy[lang].translationMissing;
  return Array.isArray(record?.meaning_ko) ? [copy[lang].translationMissing] : copy[lang].translationMissing;
}
copy.ko.translationMissing='이 언어의 뜻풀이가 아직 없어요.';
copy.en.translationMissing='A translation in this language is not available yet.';
copy.ru.translationMissing='Перевод на этот язык пока отсутствует.';
copy.ko.skipToMain='본문으로 이동';
copy.en.skipToMain='Skip to content';
copy.ru.skipToMain='Перейти к содержимому';
copy.ko.sessionComplete='연습 완료';
copy.en.sessionComplete='SESSION COMPLETE';
copy.ru.sessionComplete='ПРАКТИКА ЗАВЕРШЕНА';
copy.ko.accountEye='나만의 학습 공간';
copy.ko.exploreEye='단어의 연결 탐색';
copy.ko.savedEye='나의 단어 모음';
copy.ko.practiceEye='짧게 해 보는 연습';
copy.ko.wordTag='단어 살펴보기';
copy.ko.charTag='한자 살펴보기';
copy.en.showTranslation='Show Korean original';
copy.en.hideTranslation='Hide Korean original';
copy.ru.showTranslation='Показать корейский оригинал';
copy.ru.hideTranslation='Скрыть корейский оригинал';

const formCopy = {
  ko: {
    wordFormTitle:'새 단어 추가', wordFormHelp: "한국어 단어와 뜻을 입력하세요. 다른 언어의 뜻과 예문은 필요한 언어만 추가할 수 있어요.",
    wordFormWord:'한국어 단어', wordFormHanja:'한자·혼합 표기 (선택)', wordFormHanjaHelp:'예: 學習노트. 한자가 없는 단어는 비워 두세요.',
    wordFormKo:'한국어 뜻', wordFormEn:'영어 뜻', wordFormRu:'러시아어 뜻 (선택)', wordFormExamples:'예문 추가 (선택)',
    wordFormExampleKo:'한국어 예문', wordFormExampleEn:'영어 번역 (선택)', wordFormExampleRu:'러시아어 번역 (선택)',
    wordFormAdd:'단어 추가', wordFormSample:'예시 채우기', wordFormChecking:'한자 연결을 확인하고 있어요…',
    wordFormMissing:'처음 등록하는 한자', wordFormMissingHelp:'아래 한자의 읽는 법과 뜻을 입력하면 단어와 함께 등록해요. 이미 있는 독음은 자동으로 찾아요.',
    wordFormSound:'한국어 독음', wordFormRoman:'새 독음의 로마자 (선택)', wordFormRomanHelp:'이미 등록된 독음은 비워 두세요. 새로운 독음이면 seom처럼 영문 소문자로 입력하세요.',
    wordFormInvalid:'필수 입력과 글자 수를 확인해 주세요.', wordFormSpelling:'혼합 표기의 한글 부분을 단어와 같은 위치에 적어 주세요. 구성 한자는 자동으로 추출해요.',
    wordFormExample:'번역을 입력하려면 한국어 예문도 입력해 주세요.', wordFormReading:'한글 한 글자의 독음을 입력하고, 새 독음이면 영문 소문자 로마자도 입력해 주세요.',
    wordFormReady:'새 한자 정보를 입력한 뒤 다시 단어 추가를 누르세요.', dictionaryImport:'개인 사전 파일 가져오기', dictionaryImportHelp:'이전에 다운로드한 개인 사전 JSON이나 공개 자료 형식의 JSONL 파일을 가져올 수 있어요.', dictionaryImportButton:'파일 가져오기', dictionaryChooseFile:'가져올 파일을 선택해 주세요.',
  },
  en: {
    wordFormTitle:'Add a word', wordFormHelp: "Enter the Korean word and meaning. Add languages as needed for translations and examples.",
    wordFormWord:'Korean word', wordFormHanja:'Hanja or mixed spelling (optional)', wordFormHanjaHelp:'For example: 學習노트. Leave blank for a word without Hanja.',
    wordFormKo:'Korean meaning', wordFormEn:'English meaning', wordFormRu:'Russian meaning (optional)', wordFormExamples:'Add examples (optional)',
    wordFormExampleKo:'Korean example', wordFormExampleEn:'English translation (optional)', wordFormExampleRu:'Russian translation (optional)',
    wordFormAdd:'Add word', wordFormSample:'Fill an example', wordFormChecking:'Checking character connections…',
    wordFormMissing:'New characters', wordFormMissingHelp:'Enter the reading and meanings of these new characters to add them with your word. Existing reading groups are matched automatically.',
    wordFormSound:'Korean reading', wordFormRoman:'Romanization for a new reading (optional)', wordFormRomanHelp:'Leave blank for a registered reading. For a new reading, use lowercase Latin letters, such as seom.',
    wordFormInvalid:'Check the required fields and length limits.', wordFormSpelling:'Keep Hangul in the same position as in the Korean word. Hanja components are extracted automatically.',
    wordFormExample:'Add a Korean example before entering its translations.', wordFormReading:'Enter a single Hangul syllable for the reading and lowercase Roman letters if it is new.',
    wordFormReady:'Complete the new character details, then choose Add word again.', dictionaryImport:'Import a personal dictionary file', dictionaryImportHelp:'Import a previously downloaded personal dictionary JSON file or dictionary records in JSONL format.', dictionaryImportButton:'Import file', dictionaryChooseFile:'Choose a file to import.',
  },
  ru: {
    wordFormTitle:'Добавить слово', wordFormHelp: "Введите корейское слово и его значение. При необходимости добавьте языки перевода и примеры.",
    wordFormWord:'Корейское слово', wordFormHanja:'Написание с иероглифами (необязательно)', wordFormHanjaHelp:'Например: 學習노트. Оставьте поле пустым, если в слове нет иероглифов.',
    wordFormKo:'Значение на корейском', wordFormEn:'Значение на английском', wordFormRu:'Значение на русском (необязательно)', wordFormExamples:'Добавить примеры (необязательно)',
    wordFormExampleKo:'Пример на корейском', wordFormExampleEn:'Английский перевод (необязательно)', wordFormExampleRu:'Русский перевод (необязательно)',
    wordFormAdd:'Добавить слово', wordFormSample:'Заполнить пример', wordFormChecking:'Проверяем связи с иероглифами…',
    wordFormMissing:'Новые иероглифы', wordFormMissingHelp:'Введите чтение и значения новых иероглифов, чтобы добавить их вместе со словом. Существующие группы чтения определяются автоматически.',
    wordFormSound:'Чтение на корейском', wordFormRoman:'Латиница для нового чтения (необязательно)', wordFormRomanHelp:'Для существующего чтения оставьте пустым. Для нового используйте строчные латинские буквы, например seom.',
    wordFormInvalid:'Проверьте обязательные поля и ограничения длины.', wordFormSpelling:'Хангыль должен оставаться на тех же местах, что и в корейском слове. Иероглифы выделяются автоматически.',
    wordFormExample:'Сначала добавьте корейский пример, затем его переводы.', wordFormReading:'Введите чтение одним слогом хангыля. Для нового чтения также введите запись строчными латинскими буквами.',
    wordFormReady:'Заполните сведения о новых иероглифах и снова нажмите «Добавить слово».', dictionaryImport:'Импорт личного словаря из файла', dictionaryImportHelp:'Загрузите ранее скачанный личный словарь в JSON или словарные записи в формате JSONL.', dictionaryImportButton:'Импортировать файл', dictionaryChooseFile:'Выберите файл для импорта.',
  },
};
for (const language of LANGUAGES) Object.assign(copy[language],formCopy[language]);

Object.assign(copy.ko,{home:'漢-Graph 처음으로',mainNavigation:'주요 메뉴',brandMotto:'단어를 잇는 배움.',appDescription:'한자의 뜻을 따라 한국어 단어를 연결하고 문맥 속에서 이해해 보세요.'});
Object.assign(copy.en,{home:'HAN-GRAPH home',mainNavigation:'Main navigation',brandMotto:'WORDS, CONNECTED.',appDescription:'Connect Korean words through Hanja meanings and understand them in context.'});
Object.assign(copy.ru,{home:'На главную HAN-GRAPH',mainNavigation:'Главное меню',brandMotto:'СЛОВА И СВЯЗИ.',appDescription:'Находите связи между корейскими словами через значения иероглифов и контекст.'});

Object.assign(copy.ko,{wordFormUz:'우즈베크어 뜻 (선택)',wordFormKy:'키르기스어 뜻 (선택)',wordFormExampleUz:'우즈베크어 번역 (선택)',wordFormExampleKy:'키르기스어 번역 (선택)',wordFormHelp: "한국어 단어와 뜻을 입력하세요. 다른 언어의 뜻과 예문은 필요한 언어만 추가할 수 있어요.",searchHint:'다른 단어, 한자 또는 뜻으로 찾아보세요.'});
Object.assign(copy.en,{wordFormUz:'Uzbek meaning (optional)',wordFormKy:'Kyrgyz meaning (optional)',wordFormExampleUz:'Uzbek translation (optional)',wordFormExampleKy:'Kyrgyz translation (optional)',wordFormHelp: "Enter the Korean word and meaning. Add languages as needed for translations and examples.",searchHint:'Try another Korean word, character, or meaning.'});
Object.assign(copy.ru,{wordFormUz:'Значение на узбекском (необязательно)',wordFormKy:'Значение на кыргызском (необязательно)',wordFormExampleUz:'Узбекский перевод (необязательно)',wordFormExampleKy:'Кыргызский перевод (необязательно)',wordFormHelp: "Введите корейское слово и его значение. При необходимости добавьте языки перевода и примеры."});
Object.assign(copy.ko, {
  wordFormZh: "중국어 뜻 (선택)",
  wordFormExampleZh: "중국어 번역 (선택)",
  wordFormJa: "일본어 뜻 (선택)",
  wordFormExampleJa: "일본어 번역 (선택)",
  wordFormEs: "스페인어 뜻 (선택)",
  wordFormExampleEs: "스페인어 번역 (선택)",
  wordFormVi: "베트남어 뜻 (선택)",
  wordFormExampleVi: "베트남어 번역 (선택)",
  wordFormNe: "네팔어 뜻 (선택)",
  wordFormExampleNe: "네팔어 번역 (선택)",
  wordFormMn: "몽골어 뜻 (선택)",
  wordFormExampleMn: "몽골어 번역 (선택)",
  wordFormTh: "태국어 뜻 (선택)",
  wordFormExampleTh: "태국어 번역 (선택)",
});
Object.assign(copy.en, {
  wordFormZh: "Chinese meaning (optional)",
  wordFormExampleZh: "Chinese translation (optional)",
  wordFormJa: "Japanese meaning (optional)",
  wordFormExampleJa: "Japanese translation (optional)",
  wordFormEs: "Spanish meaning (optional)",
  wordFormExampleEs: "Spanish translation (optional)",
  wordFormVi: "Vietnamese meaning (optional)",
  wordFormExampleVi: "Vietnamese translation (optional)",
  wordFormNe: "Nepali meaning (optional)",
  wordFormExampleNe: "Nepali translation (optional)",
  wordFormMn: "Mongolian meaning (optional)",
  wordFormExampleMn: "Mongolian translation (optional)",
  wordFormTh: "Thai meaning (optional)",
  wordFormExampleTh: "Thai translation (optional)",
});
Object.assign(copy.ru, {
  wordFormZh: "Значение на китайском (необязательно)",
  wordFormExampleZh: "Перевод на китайском (необязательно)",
  wordFormJa: "Значение на японском (необязательно)",
  wordFormExampleJa: "Перевод на японском (необязательно)",
  wordFormEs: "Значение на испанском (необязательно)",
  wordFormExampleEs: "Перевод на испанском (необязательно)",
  wordFormVi: "Значение на вьетнамском (необязательно)",
  wordFormExampleVi: "Перевод на вьетнамском (необязательно)",
  wordFormNe: "Значение на непальском (необязательно)",
  wordFormExampleNe: "Перевод на непальском (необязательно)",
  wordFormMn: "Значение на монгольском (необязательно)",
  wordFormExampleMn: "Перевод на монгольском (необязательно)",
  wordFormTh: "Значение на тайском (необязательно)",
  wordFormExampleTh: "Перевод на тайском (необязательно)",
});
Object.assign(copy.uz, {
  wordFormZh: "xitoy tilidagi maʼno (ixtiyoriy)",
  wordFormExampleZh: "xitoy tiliga tarjima (ixtiyoriy)",
  wordFormJa: "yapon tilidagi maʼno (ixtiyoriy)",
  wordFormExampleJa: "yapon tiliga tarjima (ixtiyoriy)",
  wordFormEs: "ispan tilidagi maʼno (ixtiyoriy)",
  wordFormExampleEs: "ispan tiliga tarjima (ixtiyoriy)",
  wordFormVi: "vyetnam tilidagi maʼno (ixtiyoriy)",
  wordFormExampleVi: "vyetnam tiliga tarjima (ixtiyoriy)",
  wordFormNe: "Nepal tilidagi maʼno (ixtiyoriy)",
  wordFormExampleNe: "Nepal tilidagi tarjima (ixtiyoriy)",
  wordFormMn: "Moʻgʻul tilidagi maʼno (ixtiyoriy)",
  wordFormExampleMn: "Moʻgʻul tilidagi tarjima (ixtiyoriy)",
  wordFormTh: "Tailand tilidagi maʼno (ixtiyoriy)",
  wordFormExampleTh: "Tailand tilidagi tarjima (ixtiyoriy)",
});
Object.assign(copy.ky, {
  wordFormZh: "Кытайча мааниси (милдеттүү эмес)",
  wordFormExampleZh: "Кытайча котормосу (милдеттүү эмес)",
  wordFormJa: "Жапончо мааниси (милдеттүү эмес)",
  wordFormExampleJa: "Жапончо котормосу (милдеттүү эмес)",
  wordFormEs: "Испанча мааниси (милдеттүү эмес)",
  wordFormExampleEs: "Испанча котормосу (милдеттүү эмес)",
  wordFormVi: "Вьетнамча мааниси (милдеттүү эмес)",
  wordFormExampleVi: "Вьетнамча котормосу (милдеттүү эмес)",
  wordFormNe: "Непал тилиндеги мааниси (милдеттүү эмес)",
  wordFormExampleNe: "Непал тилиндеги котормосу (милдеттүү эмес)",
  wordFormMn: "Монгол тилиндеги мааниси (милдеттүү эмес)",
  wordFormExampleMn: "Монгол тилиндеги котормосу (милдеттүү эмес)",
  wordFormTh: "Тай тилиндеги мааниси (милдеттүү эмес)",
  wordFormExampleTh: "Тай тилиндеги котормосу (милдеттүү эмес)",
});
Object.assign(copy.ko, {"studyRefresh": "통계 새로고침", "studyStats": "학습 통계", "studyMonth": "조회할 달", "studyTime": "이용 시간", "studyAccuracy": "정답률", "studyDays": "학습한 날", "studyStreak": "최장 연속 학습", "studyDaily": "날짜별 학습", "studyDate": "날짜", "studyRounds": "연습 횟수", "studyTimeHelp": "이용 시간은 로그인한 화면에서 마지막 조작 후 2분까지 기록합니다. 이전 연습도 점수와 학습일에 포함합니다."});
Object.assign(copy.en, {"studyRefresh": "Refresh statistics", "studyStats": "Learning statistics", "studyMonth": "Month", "studyTime": "Active time", "studyAccuracy": "Accuracy", "studyDays": "Days studied", "studyStreak": "Longest streak", "studyDaily": "Daily learning activity", "studyDate": "Date", "studyRounds": "Rounds", "studyTimeHelp": "Time is tracked while the signed-in tab is in focus, for up to two minutes after your last interaction. Earlier practice counts toward scores and study days."});
Object.assign(copy.ru, {"studyRefresh": "Обновить статистику", "studyStats": "Статистика обучения", "studyMonth": "Месяц", "studyTime": "Время занятий", "studyAccuracy": "Верные ответы", "studyDays": "Дни занятий", "studyStreak": "Самая длинная серия", "studyDaily": "Занятия по дням", "studyDate": "Дата", "studyRounds": "Раунды", "studyTimeHelp": "После входа время в активной вкладке учитывается до двух минут после последнего действия. Прошлые упражнения учитываются в результатах и днях занятий."});
Object.assign(copy.uz, {"studyRefresh": "Statistikani yangilash", "studyStats": "Oʻqish statistikasi", "studyMonth": "Oy", "studyTime": "Oʻqish vaqti", "studyAccuracy": "Toʻgʻri javoblar ulushi", "studyDays": "Oʻqilgan kunlar", "studyStreak": "Eng uzun ketma-ketlik", "studyDaily": "Kunlik mashgʻulotlar", "studyDate": "Sana", "studyRounds": "Mashqlar soni", "studyTimeHelp": "Hisobga kirgach, faol varaqdagi vaqt oxirgi harakatdan keyin ikki daqiqagacha hisoblanadi. Avvalgi mashqlar ham natijalar va oʻqilgan kunlarga kiradi."});
Object.assign(copy.ky, {"studyRefresh": "Статистиканы жаңыртуу", "studyStats": "Окуу статистикасы", "studyMonth": "Ай", "studyTime": "Окуу убактысы", "studyAccuracy": "Туура жооптордун үлүшү", "studyDays": "Окуган күндөр", "studyStreak": "Эң узак үзгүлтүксүз мезгил", "studyDaily": "Күнүмдүк окуу", "studyDate": "Күнү", "studyRounds": "Машыгуу саны", "studyTimeHelp": "Аккаунтка киргенде активдүү өтмөктөгү убакыт акыркы аракеттен кийин эки мүнөткө чейин эсептелет. Мурунку көнүгүүлөр да упайга жана окуган күндөргө кошулат."});
Object.assign(copy.zh, {"studyRefresh": "刷新统计", "studyStats": "学习统计", "studyMonth": "月份", "studyTime": "使用时长", "studyAccuracy": "正确率", "studyDays": "学习天数", "studyStreak": "最长连续学习天数", "studyDaily": "每日学习记录", "studyDate": "日期", "studyRounds": "练习轮数", "studyTimeHelp": "登录后，仅在当前标签页有焦点时计时，最后一次操作后最多计时两分钟。以前的练习也计入成绩和学习天数。"});
Object.assign(copy.ja, {"studyRefresh": "統計を更新", "studyStats": "学習統計", "studyMonth": "表示する月", "studyTime": "利用時間", "studyAccuracy": "正答率", "studyDays": "学習日数", "studyStreak": "最長連続学習日数", "studyDaily": "日ごとの学習記録", "studyDate": "日付", "studyRounds": "練習回数", "studyTimeHelp": "ログイン中のタブがアクティブな間、最後の操作から最長2分まで時間を記録します。過去の練習も成績と学習日数に含まれます。"});
Object.assign(copy.es, {"studyRefresh": "Actualizar estadísticas", "studyStats": "Estadísticas de aprendizaje", "studyMonth": "Mes", "studyTime": "Tiempo de uso", "studyAccuracy": "Aciertos", "studyDays": "Días de estudio", "studyStreak": "Racha más larga", "studyDaily": "Actividad diaria", "studyDate": "Fecha", "studyRounds": "Rondas", "studyTimeHelp": "Con la sesión iniciada, se mide el tiempo en la pestaña activa hasta dos minutos después de la última interacción. Las prácticas anteriores también cuentan para los resultados y los días de estudio."});
Object.assign(copy.vi, {"studyRefresh": "Làm mới thống kê", "studyStats": "Thống kê học tập", "studyMonth": "Tháng", "studyTime": "Thời gian học", "studyAccuracy": "Tỷ lệ đúng", "studyDays": "Số ngày học", "studyStreak": "Chuỗi ngày dài nhất", "studyDaily": "Hoạt động từng ngày", "studyDate": "Ngày", "studyRounds": "Số lượt luyện tập", "studyTimeHelp": "Khi đã đăng nhập, thời gian trên thẻ đang hoạt động được tính đến hai phút sau thao tác cuối. Các lượt luyện tập trước đây cũng được tính vào điểm và số ngày học."});
Object.assign(copy.ne, {"studyRefresh": "तथ्याङ्क अद्यावधिक गर्नुहोस्", "studyStats": "अध्ययन तथ्याङ्क", "studyMonth": "महिना", "studyTime": "अध्ययन समय", "studyAccuracy": "सही उत्तरको प्रतिशत", "studyDays": "अध्ययन गरेका दिन", "studyStreak": "लगातार अध्ययनको लामो अवधि", "studyDaily": "दैनिक अध्ययन विवरण", "studyDate": "मिति", "studyRounds": "अभ्यास चरण", "studyTimeHelp": "लगइन गरेपछि सक्रिय ट्याबमा अन्तिम क्रियापछि दुई मिनेटसम्मको समय गणना हुन्छ। पहिलेका अभ्यास पनि नतिजा र अध्ययन गरेका दिनमा समावेश हुन्छन्।"});
Object.assign(copy.mn, {"studyRefresh": "Статистик шинэчлэх", "studyStats": "Суралцсан статистик", "studyMonth": "Сар", "studyTime": "Суралцсан хугацаа", "studyAccuracy": "Зөв хариултын хувь", "studyDays": "Суралцсан өдөр", "studyStreak": "Хамгийн олон дараалсан өдөр", "studyDaily": "Өдөр бүрийн үзүүлэлт", "studyDate": "Огноо", "studyRounds": "Дасгалын тоо", "studyTimeHelp": "Нэвтэрсэн үед идэвхтэй хөтчийн таб дээрх хугацааг сүүлийн үйлдлээс хойш хоёр минут хүртэл тооцно. Өмнөх дасгалуудыг ч үр дүн болон суралцсан өдрийн тоонд оруулна."});
Object.assign(copy.th, {"studyRefresh": "รีเฟรชสถิติ", "studyStats": "สถิติการเรียน", "studyMonth": "เดือน", "studyTime": "เวลาใช้งาน", "studyAccuracy": "อัตราการตอบถูก", "studyDays": "จำนวนวันที่เรียน", "studyStreak": "ช่วงที่เรียนติดต่อกันนานที่สุด", "studyDaily": "กิจกรรมรายวัน", "studyDate": "วันที่", "studyRounds": "จำนวนรอบ", "studyTimeHelp": "เมื่อลงชื่อเข้าใช้ ระบบจะนับเวลาขณะที่แท็บอยู่ด้านหน้าจนถึงสองนาทีหลังการโต้ตอบครั้งล่าสุด แบบฝึกหัดที่ผ่านมาใช้คำนวณคะแนนและจำนวนวันที่เรียนด้วย"});

// Chromium distributions with partial locale data may render Uzbek November
// as "M11", or fall back to English day and unit names for these locales.
const studyCalendar = {
  uz:{year:'Yil', months:'Yanvar|Fevral|Mart|Aprel|May|Iyun|Iyul|Avgust|Sentabr|Oktabr|Noyabr|Dekabr', minute:'daq.', second:'son.', day:'kun'},
  ky:{year:'Жыл', months:'Январь|Февраль|Март|Апрель|Май|Июнь|Июль|Август|Сентябрь|Октябрь|Ноябрь|Декабрь', minute:'мүн', second:'сек', day:'күн'},
  ne:{year:'वर्ष', months:'जनवरी|फेब्रुअरी|मार्च|अप्रिल|मे|जुन|जुलाई|अगस्ट|सेप्टेम्बर|अक्टोबर|नोभेम्बर|डिसेम्बर', minute:'मिनेट', second:'सेकेन्ड', day:'दिन'},
  mn:{year:'Жил', months:'Нэгдүгээр сар|Хоёрдугаар сар|Гуравдугаар сар|Дөрөвдүгээр сар|Тавдугаар сар|Зургаадугаар сар|Долоодугаар сар|Наймдугаар сар|Есдүгээр сар|Аравдугаар сар|Арван нэгдүгээр сар|Арван хоёрдугаар сар', minute:'мин', second:'сек', day:'хоног'},
};
export function studyFormats(lang) {
  const local=studyCalendar[lang];
  if(local) {
    const months=local.months.split('|');
    const number=new Intl.NumberFormat(lang,{useGrouping:false,...(lang==='ne'?{numberingSystem:'deva'}:{})});
    return {
      yearLabel:local.year,
      year:y=>number.format(y),
      month:m=>months[m-1],
      date:iso=>iso.split('-').map(s=>number.format(Number(s))).join('-'),
      unit:(n,u)=>number.format(n)+' '+local[u],
    };
  }
  const format=options=>new Intl.DateTimeFormat(lang,{...options,timeZone:'UTC'});
  const year=format({year:'numeric'}),month=format({month:'long'}),day=format({month:'short',day:'numeric',weekday:'short'});
  const units=Object.fromEntries(['minute','second','day'].map(u=>
    [u,new Intl.NumberFormat(lang,{style:'unit',unit:u,unitDisplay:'short'})]));
  return {
    yearLabel:new Intl.DisplayNames([lang],{type:'dateTimeField'}).of('year'),
    year:y=>year.format(Date.UTC(y,0,1)), month:m=>month.format(Date.UTC(2000,m-1,1)),
    date:iso=>day.format(new Date(iso+'T12:00:00Z')), unit:(n,u)=>units[u].format(n),
  };
}

const pluralRules=Object.fromEntries(LANGUAGES.map(language=>[language,new Intl.PluralRules(language)]));
const nouns={
  en:{words:{one:'word',other:'words'},characters:{one:'character',other:'characters'},questions:{one:'question',other:'questions'}},
  ru:{words:{one:'слово',few:'слова',many:'слов',other:'слова'},characters:{one:'иероглиф',few:'иероглифа',many:'иероглифов',other:'иероглифа'},questions:{one:'задание',few:'задания',many:'заданий',other:'задания'}},
  uz:{words:{other:'ta soʻz'},characters:{other:'ta iyeroglif'},questions:{other:'ta savol'}},
  zh:{words:{other:'个词'},characters:{other:'个汉字'},questions:{other:'道题'}},
  ja:{words:{other:'語'},characters:{other:'字'},questions:{other:'問'}},
  es:{words:{one:'palabra',other:'palabras'},characters:{one:'carácter',other:'caracteres'},questions:{one:'pregunta',other:'preguntas'}},
  ne:{words:{other:'शब्द'},characters:{other:'हान्जा'},questions:{other:'प्रश्न'}},
  mn:{words:{other:'үг'},characters:{other:'ханз'},questions:{other:'асуулт'}},
  th:{words:{other:'คำ'},characters:{other:'ตัว'},questions:{other:'ข้อ'}},
  vi:{words:{other:'từ'},characters:{other:'chữ Hán'},questions:{other:'câu hỏi'}},
  ky:{words:{other:'сөз'},characters:{other:'иероглиф'},questions:{other:'суроо'}},
};
export function countText(count,key,language='ko') {
  const lang=normalizeLanguage(language),forms=nouns[lang]?.[key];
  if(lang==='ko') {
    const number=count.toLocaleString(lang);
    if(key==='words')return `단어 ${number}개`;
    if(key==='characters')return `한자 ${number}자`;
    if(key==='questions')return `${number}문항`;
  }
  const separator = ['zh','ja'].includes(lang) ? '' : ' ';
  return `${count.toLocaleString(lang)}${separator}${forms?(forms[pluralRules[lang].select(count)]??forms.other):copy[lang][key]}`;
}
