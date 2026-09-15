# 데이터 작업 기록

## 파일

| 파일 | 내용 |
| --- | --- |
| `TARGETS.md` | 수집 대상 한자와 훈음의 초기 목록 및 추가 한자 |
| `meta.jsonl` | 음 그룹 407개 |
| `character.jsonl` | 한자·독음 레코드 1,820개: 중등 900, 고등 900, 확장 20 |
| `normal_word.jsonl` | 단어 149개, 한국어·영어 뜻, 구성 한자와 선택적 의미 힌트 |
| `practice.json` | 직접 작성한 문맥 연습 6문항과 해설 초안 |

데이터 형식과 검증 규칙은 [데이터 모델](../docs/DATA_MODEL.md)을 따른다. JSONL에는 주석이나 진행 메모를 넣지 않는다.

## 2026-09-15: 이어서 21–30번째 한자 확장

`gan-100`부터 `gam-002`까지 다음 10개 한자에 연결 단어를 5개씩 채웠다. 감각(感覺)은 이미 수록되어 있어 재사용하고 새 단어는 **49개** 추가했다. 현재는 **149개 단어, 308개 단어–한자 연결, 연결된 한자 170개**다. 첫 30개 한자 모두 연결 단어가 5개씩이며, 감각처럼 서로 공유하는 단어는 파일에 한 번만 저장한다.

| 한자 ID | 한자 | 연결 단어 5개 |
| --- | --- | --- |
| gan-100 | 刊 | 간행, 출간, 발간, 월간, 주간 |
| gan-101 | 姦 | 간사(姦邪), 간악, 간계, 간음, 간통 |
| gan-102 | 幹 | 간부, 간선, 근간, 기간(基幹), 간사(幹事) |
| gan-103 | 懇 | 간절, 간청, 간담회, 간곡, 간원 |
| gan-104 | 簡 | 간단, 간략, 간결, 서간, 간소 |
| gan-105 | 肝 | 간장(肝臟), 간염, 간암, 간담, 간경화 |
| gal-000 | 渴 | 갈증, 갈망, 고갈, 갈구, 해갈 |
| gam-000 | 感 | 감각(기존), 감정, 감사, 감동, 공감 |
| gam-001 | 敢 | 용감, 과감, 감행, 용감무쌍, 언감생심 |
| gam-002 | 減 | 감소, 감량, 감면, 삭감, 절감 |

다음 순차 수집 시작점은 **`gam-003`(甘)**이다.

### 보완 및 표기 검수

- 간암·간담의 구성에 필요한 `癌[암]`(`am-200`), `膽[담]`(`dam-200`)을 등록했다.
- `幹[간]`의 중심·주관, `懇[간]`의 간절함, `簡[간]`의 간단함·편지, `姦[간]`의 간음 의미를 기존 뜻에 보강했다.
- `姦[간]`과 `奸[간]`을 임의로 치환하지 않았다. 간사(姦邪)·간악(姦惡)·간계(姦計)는 아래 국역 문헌에서 확인한 **문헌 표기**로 수록하고, 웹에 표시되는 의미 힌트에도 표시했다. 현대 한국어기초사전의 간사하다·간악하다에는 각각 奸邪·奸惡이 실려 있다. 이체 관계를 자동으로 합치는 기능은 아직 없으며 현대 표기와 문헌 표기를 동일한 그래프 노드로 취급하지 않는다.
- 간사(幹事)는 실무 담당자를 뜻하는 별도 항목으로 보존했다. 기간(基幹)·간장(肝臟)에도 같은 한글 표기와 구별하는 힌트를 넣었다.
- 간단·간소·과감 등 어근으로 주로 쓰이는 항목은 '-하다'와 함께 쓰는 예를 힌트에 적었다. 새 힌트의 직접 한자 표기는 모두 `漢[한]` 형식으로 독음을 병기했다.
- 기존 JSONL 포맷과 문항 6개의 독음 병기 규칙을 유지했다. 이번 작업에서 기존 단어 100개와 `practice.json`의 내용은 바꾸지 않았다.

### 대조 출처

풀이와 힌트는 직접 작성했다. 아래는 혼동하기 쉬운 표기·의미의 대조 출처이며, 49개 전체의 외부 사전 대조나 전문가 검수 완료를 뜻하지 않는다. 문헌 표기와 관용 표현을 일상 고빈도 어휘로 간주하지 않는다.

| 확인 항목 | 출처 |
| --- | --- |
| 간사(姦邪)의 문헌 표기와 현대 표기 차이 | [조선왕조실록 단종 3년 6월 9일](https://sillok.history.go.kr/popup/print.do?gubun=kor&id=kfa_10306009_003), [한국어기초사전 간사하다(奸邪)](https://krdict.korean.go.kr/eng/dicSearch/SearchView?ParaWordNo=15623&nation=eng) |
| 간악(姦惡)의 문헌 표기 | [조선왕조실록 세종 16년 6월 5일](https://sillok.history.go.kr/id/kda_11606005_001), [한국어기초사전 간악하다(奸惡)가 포함된 의미 범주 목록](https://krdict.korean.go.kr/jpn/dicSearch/senseCategory?categoryName=null&currentPage=11&lgCategoryCode=1&miCategoryCode=-1&nation=jpn&searchFlag=Y&searchType=null) |
| 간계(姦計)의 문헌 표기 | [국사편찬위원회 고려사 국역](https://db.history.go.kr/goryeo/level.do?levelId=kr_126r_0010_0010_0120&types=r) |
| 간음·간통의 한자와 의미 | [한국어기초사전 간음하다](https://krdict.korean.go.kr/eng/dicSearch/SearchView?ParaWordNo=14043&nation=eng), [간통하다](https://krdict.korean.go.kr/eng/dicSearch/SearchView?ParaWordNo=15099&nation=eng) |
| 간사(幹事)·근간(根幹)의 의미 | [한국어기초사전 간사](https://krdict.korean.go.kr/jpn/dicSearch/SearchView?ParaWordNo=15509&nation=jpn), [근간](https://krdict.korean.go.kr/eng/dicSearch/SearchView?ParaWordNo=33008) |
| 간단·간결·간소의 뜻 | [한국어기초사전 간단하다](https://krdict.korean.go.kr/eng/dicSearch/SearchView?ParaWordNo=70702&nation=eng), [간결하다](https://krdict.korean.go.kr/eng/dicSearch/SearchView?ParaWordNo=35609), [간소하다](https://krdict.korean.go.kr/eng/dicSearch/SearchView?ParaWordNo=15515&nation=eng) |
| 간담(肝膽)의 장기·비유 의미 | [KBS 한국어 학습: 간담](https://world.kbs.co.kr/service/contents_view.htm?board_seq=230459&id=&lang=k&menu_cate=learnkorean), [충청북도교육문화원 한글사랑관](https://www.cbec.go.kr/hangeul/sub.php?menukey=218&mod=view&no=199323&page=70) |
| 간암의 한자 표기 | [국립국어원 온용어: 간암 치료제의 원어](https://kli.korean.go.kr/term/trgtWord/indexTrgtWord.do?trgtWordNo=2008870) |
| 간경화의 의미·용어 | [서울아산병원 질환백과](https://bsh.asanfoundation.or.kr/asan/healthinfo/disease/diseaseDetail.do?contentId=30480), [국립국어원 국어 순화 자료](https://www.korean.go.kr/nkview/kclean/kclean_1.htm) |
| 용감무쌍·언감생심의 한자 구성과 의미 | [경향신문·재능한자 용감무쌍](https://www.khan.co.kr/article/200710230943361), [위키낱말사전 언감생심](https://ko.wiktionary.org/wiki/%EC%96%B8%EA%B0%90%EC%83%9D%EC%8B%AC) |

구조 검증 및 회귀 테스트의 단어 수 검사 범위를 첫 30개 한자로 넓혔다. 동음이의어 간사(姦邪/幹事)도 두 항목이 보존되는지 검사한다.

## 2026-09-15: 첫 20개 한자, 각각 연결 단어 5개

이전 수집은 `character.jsonl`의 첫 10개 한자에 단어 2개씩, 총 20개였다. 이번에는 기존 항목을 보강하고 다음 10개 한자를 추가하여 **100개 단어, 204개 단어–한자 연결, 연결된 한자 110개**가 되었다. 단어의 키는 `(word, hanja)`이므로 같은 한글 표기의 다른 한자어도 각각 센다.

| 한자 ID | 한자 | 연결 단어 5개 |
| --- | --- | --- |
| ga-000 | 佳 | 가인, 가경(佳景), 가작, 가약, 가경(佳境) |
| ga-001 | 假 | 가명, 가설(假設), 가정(假定), 가상, 가면 |
| ga-002 | 價 | 가격, 가치, 물가, 정가, 고가(高價) |
| ga-003 | 加 | 가산, 가속, 추가, 증가, 가입 |
| ga-004 | 可 | 가능, 허가, 불가, 가결, 가부 |
| ga-005 | 家 | 가정(家庭), 작가, 가족, 국가(國家), 전문가 |
| ga-006 | 歌 | 가곡, 국가(國歌), 가수, 가사, 교가 |
| ga-007 | 街 | 가로, 번화가, 상가, 가로수, 시가 |
| ga-100 | 暇 | 여가, 한가, 휴가, 병가, 연가 |
| ga-101 | 架 | 고가(高架), 서가, 가교, 가공, 가설(架設) |
| gak-000 | 各 | 각자, 각각, 각국, 각지, 각종 |
| gak-001 | 脚 | 각본, 각색, 삼각대, 각광, 실각 |
| gak-002 | 角 | 각도, 삼각, 사각, 직각, 다각형 |
| gak-100 | 刻 | 시각(時刻), 각인, 조각, 심각, 각박 |
| gak-101 | 却 | 기각, 각하(却下), 퇴각, 망각, 냉각 |
| gak-102 | 覺 | 감각, 시각(視覺), 청각, 자각, 각오 |
| gak-103 | 閣 | 내각, 각의, 각하(閣下), 누각, 전각 |
| gan-000 | 干 | 간섭, 간만, 약간, 간조, 간지 |
| gan-001 | 看 | 간판, 간호, 간병, 간과, 간파 |
| gan-002 | 間 | 시간, 공간, 인간, 중간, 순간 |

이 차수는 `gan-002`까지 채웠고, 위의 다음 차수에서 `gan-100`(刊)부터 이어 수집했다. 추가 단어에 필요한 구성 한자를 먼저 등록하는 일은 이 순서와 별개다. 이 차수의 `彫`는 조각(彫刻)의 구성을 위해 `jo-200`으로 추가했다.

### 기존 데이터 수정

- `灰`의 잘못된 독음 ID `hui-200`(희)을 **`hoe-200`(회)**으로 이관했다. 옛 ID는 더 이상 조회되지 않는다. 글자 자체는 같아 단어 구성 참조에는 영향이 없다. `TARGETS.md`의 소리 열도 고쳤다.
- `TARGETS.md`의 사·유·정·주 행에서 빠지거나 글자와 훈음 사이로 들어간 표 구분자를 바로잡았다.
- 가명의 뜻을 본명 대신 쓰는 이름으로, 가정(家庭)을 생활 공동체·공간으로 명료화했다. 가능은 명사에 맞게 영어 풀이를 고쳤다.
- 가곡의 일반적인 `song` 풀이를 전통 성악곡과 서양식 예술 가곡으로 구체화했다. 작가와 가로의 풀이도 다듬었다.
- `假`, `家`, `歌`, `架`, `角`, `干`, `看`의 뜻을 보강했다. 특히 작가의 `家`(전문가), 간섭·간조·간지의 `干`처럼 대표 훈음 하나만으로는 설명이 부족한 경우를 반영했다.
- `가경/가정/가설/고가/국가/시각/각하`의 한자 표기가 다른 항목을 보존한다. `각각(各各)`은 구성 글자 두 개를 보존하되 역방향 연결은 한 번만 센다.

### 출처 대조와 검수 범위

표기·뜻·번역은 학습용으로 직접 정리했다. 다음 출처는 혼동하기 쉬운 표기나 뜻을 대조하는 데 사용했으며 사전 예문을 복제하지 않았다. **100개 항목 전체의 외부 사전 대조나 전문가 검수를 완료했다는 뜻은 아니다.** 일반적인 뜻을 편집 검토했고, 전체 파일의 구조·참조·중복을 자동 검증했다. 빈도·TOPIK 난이도는 아직 부여하지 않았다.

| 확인 항목 | 대조 출처 |
| --- | --- |
| 灰의 훈음 ‘재 회’ | [EBS 제공 한국어문회 4급 배정 한자](https://static.ebs.co.kr/contents/www/hanja/%EC%96%B4%EB%AC%B8%ED%9A%8C4%EA%B8%89_%EB%B0%B0%EC%A0%95%ED%95%9C%EC%9E%90.pdf) |
| 가곡(歌曲)의 두 음악적 용법 | [국립국어원 한국어기초사전 가곡](https://krdict.korean.go.kr/eng/dicSearch/SearchView?ParaWordNo=27940&nation=eng) |
| 휴가·병가의 暇 표기 | [한국어기초사전 휴가](https://krdict.korean.go.kr/jpn/dicSearch/SearchView?ParaWordNo=73251), [병가](https://krdict.korean.go.kr/eng/dicSearch/SearchView?ParaWordNo=58999) |
| 연가(年暇) 표기 | [군 특성화고 학생 가이드북, 휴가 종류](https://mnd-hs.or.kr/files/upload/navigation/2025/guide.pdf) |
| 가경(佳境)의 장소·이야기 용법 | [위키낱말사전 가경](https://ko.wiktionary.org/wiki/%EA%B0%80%EA%B2%BD) |
| 가약(佳約)의 혼인 약속 | [한국가사문학관 자료, 가약 주석](https://www.gasa.go.kr/GDATA/pdf/V00003134.pdf) |
| 家의 전문가 의미 | [전북일보 한자 교실: 가](https://www.jjan.kr/article/20001112022441) |
| 架空·架橋의 표기와 용례 | [국립국어원 국어 순화 자료](https://www.korean.go.kr/nkview/kclean/kclean_1.htm) |
| 간섭과 干의 여러 뜻 | [한국어기초사전 간섭](https://krdict.korean.go.kr/eng/dicSearch/SearchView?ParaWordNo=16417&nation=eng) |
| 彫의 ‘새길 조’ 독음 | [한국어기초사전 조각칼의 원어 정보](https://krdict.korean.go.kr/kor/dicSearch/SearchView?ParaWordNo=75252) |
| 각하(却下)의 절차적 의미 | [디지털집현전의 우리말샘 용어 정보](https://k-knowledge.kr/srch/read.jsp?id=268766734) |

재검증은 `src`에서 `go run ./cmd validate`와 `go test ./...`로 실행한다. 회귀 테스트는 대상 20개 ID의 단어 수가 5개 미만이 되지 않는지, 동음이의어·반복 한자·수정 독음이 유지되는지도 검사한다.

## 문맥 연습과 다음 검수

`practice.json`의 정답은 가명·가격·허가·가속·작가·서가이며 기존 6문항을 유지한다. 검수 상태는 `draft`다. 단어 추가와 별개로 예문 난이도, 자연스러움과 해설의 정확성을 검수해야 한다.

다음에는 새 동음이의어 대조 예문, 단어별 구성 의미와 출처·검수 상태 필드, 학습 빈도와 난이도를 보강한다. 가인·가약·각의·각하처럼 문어적이거나 격식 있는 항목을 일상 회화의 고빈도 어휘로 취급하지 않는다. 기존 전체 한자 목록의 언어 검수도 계속 필요하다.
