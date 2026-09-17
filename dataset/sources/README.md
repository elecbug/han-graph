# 외부 출처 자료

[기초 어휘와 출처](../../docs/BASIC_VOCABULARY.md) · [데이터 안내](../../docs/DATA_MODEL.md)

기초 어휘의 참고 목록과 사전 수록 결과를 함께 공개합니다. 원문 목록은 출처를 확인하기 위한 자료이며, 앱에서 사용하는 사전은 [word.jsonl](../word.jsonl)입니다.

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
