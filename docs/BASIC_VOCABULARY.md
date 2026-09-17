# 외국인 학습용 기초 어휘 수록

[프로젝트 현황](README.md) · [데이터 작성·검수 원칙](DATA_GUIDELINES.md) · [데이터 모델](DATA_MODEL.md) · [작업 기록](../log/UPDATE_LOG.md)

## 기준 목록과 범위

국립국어연구원(현 국립국어원)이 2003년에 공개한 [한국어 학습용 어휘 목록](https://korean.go.kr/front/etcData/etcDataView.do?etc_seq=70&mn_id=46&pageIndex=19)의 **1단계 A등급 전체를 대조하고, 한자 성분이 있는 어휘만 수록한다.** 외국인 한국어 학습을 위해 선정된 목록이며, 2단계 B·3단계 C는 이번 범위에 포함하지 않는다. 웹의 모든 기초 어휘 목록의 합집합이나 현행 TOPIK 공식 등급을 뜻하지 않는다.

원문의 품사·동형어 번호를 남긴 [A등급 원본 목록](../dataset/sources/nikl_2003_beginner.tsv)과 [수록·제외 대응표](../dataset/sources/nikl_2003_beginner_coverage.jsonl)를 함께 관리한다. 한자 구성이 없는 고유어·외래어는 사전에서 제외하고, `검은색`처럼 일부에 한자가 쓰인 혼합어는 유지한다. 다만 한자 어근에 붙은 `-하다`는 제거하고 같은 한글·한자 쌍의 항목에 합친다. 원본 목록은 출처 자료로 보존한다. 현재 수록 규모는 [프로젝트 현황](README.md#현재-상태), 추가 당시의 대조 결과와 검증은 [작업 기록](../log/UPDATE_LOG.md)에 남긴다.

## 대응과 작성 원칙

- 원문 A등급의 모든 행을 대조한다. 단어 뒤 숫자는 동형어 번호이므로 사전 표제어에서는 제거하고 원본 목록에 보존한다. 같은 한글 표기에 다른 한자가 있으면 별도 사전 항목으로 유지한다.
- 같은 `(word, hanja)` 쌍의 품사·용법은 현재 모델에 맞게 하나의 항목에 담는다. 대응표에는 수록·제외 여부와 관계없이 원문의 각 행을 모두 남긴다.
- 원문의 호환 한자는 NFC 정규화한 표기를 기존 데이터와 비교한다. 서로 다른 이체자를 일괄 치환하지 않는다. 사탕의 원문 `沙糖`은 기존의 같은 뜻 항목 `砂糖`에 명시적으로 대응시켜 중복 추가하지 않았다.
- 한자 표기가 비어 있고 구성 한자도 없는 어휘는 사전에서 제외한다. 대응표에는 `status: "excluded"`, `reason: "no_hanja"`를 남긴다. 이 기준은 확인된 한자 구성의 유무이며 역사적 어원이 반드시 고유어라는 판정은 아니다.
- 혼합어는 확인된 한자 부분만 표시한다. `검은색`은 `검은色`으로 저장하며 그래프에는 한자만 연결한다. 원문의 하이픈은 해당 위치의 한글 부분으로 풀어 쓰되, 한자 어근 뒤의 `-하다`는 아래 정리 규칙을 적용한다. 한글 부분을 한자로 추측하여 바꾸지 않는다.
- `공부하다/工夫하다`처럼 확인된 `-하다` 접미부는 한글 표제어와 혼합 한자 표기에서 함께 제거한다. 결과인 `공부/工夫`가 이미 있으면 파생 항목을 삭제하고 기존 풀이를 보존한다. 한글이 같아도 한자가 다르면 별도 항목으로 남긴다. 원문의 해당 행은 결과 항목을 가리키고 `normalization: "strip_hada"`로 변경을 기록한다.
- 접미부 제거 후 새로 남는 항목은 풀이와 영어 번역을 명사·어근의 의미로 고친다. ‘죄송’처럼 어근인 항목을 독립 명사인 것처럼 설명하지 않는다. 뜻풀이·힌트·예문의 자연스러운 ‘-하다’ 활용형에는 이 표제어 정리 규칙을 적용하지 않는다.
- 한국어 풀이와 영어 번역은 프로젝트에서 직접 작성하고 기존 항목의 풀이와 순서는 보존한다. 새 항목은 현대 학습용 어휘인 `normal`로 수록한다. 원문의 A등급, 일반·고전 분류, 문맥 연습 난이도는 서로 다른 기준이다.

## 표기 대조

2003년 목록과 현재 사전의 차이가 있거나 표기·독음에 주의가 필요한 항목은 다음 자료로 추가 확인했다.

| 항목 | 반영 기준과 출처 |
| --- | --- |
| 미안·죄송 | [한국어기초사전 미안](https://krdict.korean.go.kr/vie/dicSearch/SearchView?ParaWordNo=56257&nation=vie)의 명사 용법과 [국립국어원 의미역 기술 모형 연구](https://www.korean.go.kr/common/download.do?c_file_name=cc839a3e-4753-4a85-a49e-ff44439904a8.pdf&file_path=reportData)의 ‘죄송(어근)’ 분류를 참고했다. 풀이·번역은 직접 작성했다. |
| 남동생·여동생 | 현재 한국어기초사전의 [남동생](https://krdict.korean.go.kr/eng/dicSearch/SearchView?ParaWordNo=26820), [여동생](https://krdict.korean.go.kr/eng/dicSearch/SearchView?ParaWordNo=71002)에 따라 `男동생`, `女동생`으로 저장한다. |
| 동생 | [국립국어원 원어 설명](https://www.korean.go.kr/front/onlineQna/onlineQnaView.do?mn_id=261&pageIndex=1&qna_seq=323279)에 따라 현재의 아우라는 뜻에는 한자를 붙이지 않고 이번 기초 어휘 수록에서 제외한다. |
| 시월·유월 | [한글 맞춤법 제52항](https://www.korean.go.kr/kornorms/regltn/popup/regltnNtfcView.do?ntfc_hist_no=1001&ntfc_no=6&regltn_code=0001)의 속음 표기를 적용하고 `十[시]`, `六[유]` 독음을 등록한다. |
| 칫솔 | [국립국어원 표기 설명](https://www.korean.go.kr/front/onlineQna/onlineQnaView.do?mn_id=216&pageIndex=1&qna_seq=309271)과 [사이시옷 설명](https://www.korean.go.kr/front/mcfaq/mcfaqView.do?mcfaq_seq=8186)에 따라 `齒솔`로 저장한다. `齒[치]`를 유지하며 ‘칫’을 새 한자 독음으로 등록하지 않는다. |
| 사탕 | 원문 `沙糖`과 기존 `砂糖`은 [국립국어원 남북 언어 비교 자료](https://www.korean.go.kr/common/download.do?book_seq=182&c_file_name=98e19b00-c19f-4c27-844f-30826d0ba2a3_0.pdf&downGubun=bookDataView&file_path=bookData&o_file_name=%EB%82%A8%EB%B6%81%EC%96%B8%EC%96%B4-01-3.pdf)에 함께 제시된 표기를 대조했다. 기존 항목을 재사용한다. |

## 출처 파일과 검증

원본 게시물은 **공공누리 제1유형(출처표시)**으로 공개되어 있다. 출처는 국립국어연구원, 자료명은 「한국어 학습용 어휘 목록」, 발표 시점은 2003년 5월이며 2026-09-17에 내려받았다. [텍스트 원본](https://korean.go.kr/common/download.do?c_file_name=b73a8438-4713-4436-8481-ec26fd0dce2a_0.txt&file_path=etcData&o_file_name=%ED%95%9C%EA%B5%AD%EC%96%B4+%ED%95%99%EC%8A%B5%EC%9A%A9+%EC%96%B4%ED%9C%98+%EB%AA%A9%EB%A1%9D.txt)의 CP949를 UTF-8로 변환하고 A등급만 추출했다. 원문의 순위는 당시 빈도 조사 결과이며 현재 빈도로 해석하지 않는다.

| 파일 | 역할 |
| --- | --- |
| `dataset/sources/nikl_2003_beginner.tsv` | 원문 A등급의 순위·단어·품사·풀이·등급과 순서를 보존한 자료; LF 줄바꿈 사용 |
| `dataset/sources/nikl_2003_beginner_coverage.jsonl` | 헤더를 포함한 목록의 줄 번호 `source_row`별 결과; 수록은 `(word, hanja)`와 `status: existing/added`, 제외는 `status: excluded`, `reason: no_hanja`; 접미부 제거는 `normalization: strip_hada` |

원본 다운로드의 SHA-256은 `3b49681f05d6a7490c13da2a2847e433effdf65da409fd295792d6ee33685064`, A등급 UTF-8 목록의 SHA-256은 `28214c5177d642e33efbdeb362e03c4d8de3ccc6e549ac336b3206606bd77bef`다.

Go 회귀 검사는 모든 원본 행에 한 번씩 수록·제외 결과가 있는지, 수록 항목이 실제 사전에 존재하고 제외 항목은 존재하지 않는지 확인한다. `strip_hada`로 표시한 행은 원문 표제어의 접미부를 뺀 결과와 일치하고, 이전 파생 항목이 중복으로 남지 않았는지도 검사한다. 새 풀이·번역은 작성 단계의 자료이며 전체 항목이 외부 전문가 감수를 마쳤다는 뜻은 아니다. 교정 시 원본 자료는 보존하고 사전 대응표와 작업 기록을 함께 갱신한다.
