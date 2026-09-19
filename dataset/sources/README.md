# 외부 출처 자료

[기초 어휘와 출처](../../docs/BASIC_VOCABULARY.md) · [데이터 안내](../../docs/DATA_MODEL.md)

기초 어휘의 참고 목록과 사전 수록 결과, 표기와 개념을 확인하는 자료를 함께 안내합니다. 원문 목록은 출처를 확인하기 위한 자료이며, 앱에서 사용하는 사전은 [word.jsonl](../word.jsonl)입니다.

## 참고 자료

| 항목 | 내용 |
| --- | --- |
| 제작 기관 | 국립국어연구원(현 국립국어원) |
| 자료명 | 한국어 학습용 어휘 목록 |
| 발표 시점 | 2003년 5월 |
| 원문 | [국립국어원 공개 자료](https://korean.go.kr/front/etcData/etcDataView.do?etc_seq=70&mn_id=46&pageIndex=19) |
| 이용 조건 | 공공누리 제1유형: 출처표시 |
| 내려받은 날짜 | 2026-09-17 |
| 포함 범위 | 1단계 A등급 982개 행 |

원문의 CP949 텍스트를 UTF-8로 변환하고 A등급만 추출했습니다. 원문 추출 자료에는 상위 데이터 라이선스와 별도로 이 출처의 이용 조건이 적용됩니다.

## 표기와 개념을 확인하는 자료

한영 뜻풀이는 학습자가 이해하기 쉽게 프로젝트에서 작성합니다. 한자 표기·독음이나 전문 개념을 대조할 때는 다음 자료를 참고합니다. 아래 링크는 확인에 사용한 대표 항목이며, 모든 사전 항목의 개별 출처를 나타내는 목록은 아닙니다.

| 자료 | 확인하는 내용과 대표 항목 |
| --- | --- |
| 국립국어원 한국어기초사전 | 생활 어휘의 표기와 뜻: [전세](https://krdict.korean.go.kr/kor/dicSearch/SearchView?ParaWordNo=25310), [식기세척기](https://krdict.korean.go.kr/kor/dicSearch/SearchView?ParaWordNo=90715), [변기](https://krdict.korean.go.kr/kor/dicSearch/SearchView?ParaWordNo=58246), [처방전](https://krdict.korean.go.kr/kor/dicSearch/SearchView?ParaWordNo=78726) |
| 국립국어원 한국어기초사전: 독음·혼합어 | [옷장](https://krdict.korean.go.kr/kor/dicSearch/SearchView?ParaWordNo=68496), [표지판](https://krdict.korean.go.kr/kor/dicSearch/SearchView?ParaWordNo=84234), [급정거](https://krdict.korean.go.kr/kor/dicSearch/SearchView?ParaWordNo=41482)의 표기와 구성 한자 독음 |
| 국립국어원 온용어 | 전문 용어의 표기와 뜻: [기계체조](https://kli.korean.go.kr/term/trgtWord/indexTrgtWord.do?trgtWordNo=2075845), [날염](https://kli.korean.go.kr/term/trgtWord/indexTrgtWord.do?trgtWordNo=2088060) |
| 국립국어원 국어 순화 자료 | [우체통의 한자 표기](https://www.korean.go.kr/nkview/kclean/kclean_8.htm) |
| 한국학중앙연구원 한국민족문화대백과사전 | [부가가치세의 표기와 개념](https://encykorea.aks.ac.kr/Article/E0024082) |
| 한국정보통신기술협회 정보통신용어사전 | [자연어 처리](https://terms.tta.or.kr/dictionary/dictionaryView.do?subject=%EC%9E%90%EC%97%B0%EC%96%B4+%EC%B2%98%EB%A6%AC), [ICT 시사용어 자료의 심층 기계 학습](https://terms.tta.or.kr/noticeFileDownload.do?attach=2021termsbook.pdf) |
| 한국학중앙연구원 한국민족문화대백과사전: 미술·공예 | [분청사기](https://encykorea.aks.ac.kr/Article/E0024868)와 [염색](https://encykorea.aks.ac.kr/Article/E0037112)의 표현 방식과 기법 |
| 국세청 | [연말정산의 소득공제·세액공제와 세액 계산](https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7904&mi=2324) |
| 식품의약품안전처 식품안전나라 | [식품공전 용어 풀이의 유통기간·소비기한 구분](https://www.foodsafetykorea.go.kr/popup/safefoodlife/food/foodRvlv/foodRvlvDetail.do?rvlv_no=3) |
| 한국야구위원회 | [야구기록규칙의 타율·출루율·장타율 산정](https://lgcxydabfbch3774324.cdn.ntruss.com/KBO_FILE/ebook/pdf/2023recordRule.pdf) |
| 기상청 기상자료개방포털 | [열대야의 관측 기준](https://data.kma.go.kr/climate/tropicalNight/selectTropicalNightChart.do) |

## 제공하는 파일

| 파일 | 내용 |
| --- | --- |
| [nikl_2003_beginner.tsv](nikl_2003_beginner.tsv) | 원문의 순위·단어·품사·풀이·등급과 순서 |
| [nikl_2003_beginner_coverage.jsonl](nikl_2003_beginner_coverage.jsonl) | 각 원문 행의 수록 또는 제외 결과 |

제외된 표현과 접미부를 정리하기 전 표기도 원문 목록에 남아 있습니다. 이를 통해 참고 목록과 실제 사전의 차이를 확인할 수 있습니다.

<details>
<summary>대응표 읽는 방법</summary>

`source_row`는 헤더를 포함한 TSV 줄 번호입니다. `word`와 `hanja`는 대응하는 사전 항목의 한글·한자 표기입니다.

| 표시 | 의미 |
| --- | --- |
| `status: "existing"` | 기초 목록을 반영하기 전부터 있던 사전 항목에 연결 |
| `status: "added"` | 기초 목록을 반영하면서 추가한 항목에 연결 |
| `status: "excluded"`, `reason: "no_hanja"` | 한자 구성이 없어 사전에서 제외 |
| `normalization: "strip_hada"` | 원문의 ‘-하다’를 제거한 결과에 연결 |

`existing`과 `added`는 자료가 구성된 경위를 나타내며 품질이나 난이도 등급이 아닙니다.

</details>

<details>
<summary>원본 다운로드와 무결성 정보</summary>

[국립국어원 텍스트 원본](https://korean.go.kr/common/download.do?c_file_name=b73a8438-4713-4436-8481-ec26fd0dce2a_0.txt&file_path=etcData&o_file_name=%ED%95%9C%EA%B5%AD%EC%96%B4+%ED%95%99%EC%8A%B5%EC%9A%A9+%EC%96%B4%ED%9C%98+%EB%AA%A9%EB%A1%9D.txt)을 기준으로 합니다. A등급 TSV는 UTF-8과 LF 줄바꿈을 사용합니다.

- 원본 다운로드 SHA-256: `3b49681f05d6a7490c13da2a2847e433effdf65da409fd295792d6ee33685064`
- A등급 TSV SHA-256: `28214c5177d642e33efbdeb362e03c4d8de3ccc6e549ac336b3206606bd77bef`

</details>
