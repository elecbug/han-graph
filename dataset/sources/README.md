# 외부 어휘 출처

어휘 수록 범위를 재현하고 누락을 확인하기 위한 자료다. 앱의 사전 원본은 상위 디렉터리의 JSONL 파일이다.

- `nikl_2003_beginner.tsv`: 국립국어연구원 「한국어 학습용 어휘 목록」(2003년 5월) 중 A등급. CP949 텍스트를 UTF-8로 변환하고 해당 등급을 추출했다.
- `nikl_2003_beginner_coverage.jsonl`: 위 목록의 각 행에 수록 또는 제외 결과를 기록한 프로젝트 작성 대응표다. `source_row`는 헤더를 포함한 TSV의 줄 번호다. `status`가 `existing`·`added`이면 사전 항목을 참조하며, 한자 없는 항목은 `excluded`와 `reason: "no_hanja"`로 표시한다. 한자 어근 뒤 `-하다`를 제거한 행은 결과 표제어와 한자에 연결하고 `normalization: "strip_hada"`를 기록한다. 이때 `status`는 최종 대상이 기초 어휘 추가 전부터 있던 `existing`인지, 이번에 추가한 `added`인지로 판단한다. 원본 목록은 출처 자료이므로 제외 항목과 원래 파생형도 보존한다.

출처: [국립국어원 공개 자료](https://korean.go.kr/front/etcData/etcDataView.do?etc_seq=70&mn_id=46&pageIndex=19). 원문 목록의 이용 조건은 **공공누리 제1유형(출처표시)**이다. 원문 추출 자료에는 상위 데이터 라이선스와 별도로 이 출처 조건을 적용한다.

범위·표기 대조·검증 방법은 [기초 어휘 수록 기준](../../docs/BASIC_VOCABULARY.md)에 정리한다.
