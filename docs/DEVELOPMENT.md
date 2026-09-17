# 설치와 활용

[처음으로](../README.md) · [사용 안내](WEB_APP.md) · [데이터 안내](DATA_MODEL.md)

漢-Graph를 자신의 컴퓨터에서 실행하거나, 함께 제공되는 명령줄 도구와 API로 자료를 살펴보는 방법입니다.

## 준비하기

Go 1.26.2 이상과 웹 브라우저가 필요합니다. 별도 데이터베이스, 외부 Go 라이브러리나 프런트엔드 빌드 도구는 필요하지 않습니다. 저장소를 내려받은 뒤 터미널에서 `src` 디렉터리로 이동하세요. 아래 명령은 모두 그 위치에서 실행합니다.

## 웹 앱 실행

```sh
go run ./cmd -addr 127.0.0.1:18080 serve
```

브라우저에서 <http://127.0.0.1:18080>을 열면 됩니다. 터미널에서 `Ctrl+C`를 누르면 종료합니다.

| 바꾸고 싶은 설정 | 사용 방법 |
| --- | --- |
| 포트 | `go run ./cmd -addr 127.0.0.1:8081 serve` |
| 데이터 위치 | `go run ./cmd -data ../dataset -addr 127.0.0.1:18080 serve` |

옵션은 `serve` 같은 명령보다 앞에 둡니다. `-data`의 기본값은 `../dataset`이며 실행하는 디렉터리를 기준으로 합니다. `-addr`를 생략하면 `0.0.0.0:18080`에서 접속을 받습니다.

데이터는 서버를 시작할 때 읽으므로 수정한 자료를 보려면 재시작해야 합니다. 화면 파일은 실행 프로그램에 포함되므로 화면 소스를 바꾼 경우 `go run`을 다시 실행하거나 다시 빌드한 뒤 브라우저를 새로고침합니다.

## 명령줄에서 조회하기

```sh
go run ./cmd word 가격
go run ./cmd character 家
go run ./cmd character 가
go run ./cmd -json word 번화가
```

`word`는 한글·한자 표기가 정확히 일치하는 단어를 찾습니다. `character`는 글자, 한글 독음 또는 한자 항목의 ID로 조회합니다. `-json`을 붙이면 결과를 다른 도구에서 읽기 좋은 JSON으로 출력합니다. 결과가 없으면 빈 배열을 반환합니다.

### 실행 파일로 사용하기

Linux·macOS 등의 셸에서는 다음처럼 빌드할 수 있습니다.

```sh
go build -o /tmp/han-graph ./cmd
/tmp/han-graph -addr 127.0.0.1:18080 serve
```

Windows PowerShell에서는 다음을 사용합니다.

```powershell
go build -o "$env:TEMP\han-graph.exe" ./cmd
& "$env:TEMP\han-graph.exe" -addr 127.0.0.1:18080 serve
```

실행 파일을 옮겼다면 `-data`로 데이터 경로를 지정하세요. 경로는 실행 파일이 놓인 위치가 아니라 명령을 실행한 디렉터리를 기준으로 해석합니다.

## HTTP API

서버를 실행하면 같은 주소에서 읽기 전용 JSON API를 사용할 수 있습니다. 예를 들어 `/api/search?q=하&mode=sound`는 독음 ‘하’로 검색합니다. 별도로 운영되는 공개 API 주소는 제공하지 않습니다.

<details>
<summary>API 경로와 조회 조건</summary>

| 경로 | 입력 | 반환 내용 |
| --- | --- | --- |
| `GET /api/stats` | 없음 | 어휘·한자·독음·연결 수 |
| `GET /api/search` | 선택적 `q`, `mode`, `level` | 단어·한자 목록과 전체 일치 수 |
| `GET /api/words` | 필수 `q` | 정확히 일치한 단어와 구성 한자 |
| `GET /api/characters` | 필수 `q` | 글자·독음·ID에 일치한 한자와 연결 단어 |
| `GET /api/neighborhood` | 필수 `q` | 시작 한자와 직접 연결된 단어·한자 |
| `GET /api/random-word` | 선택적 `level`, `exclude_word`, `exclude_hanja` | 무작위 단어 하나 |
| `GET /api/practice` | 없음 | 전체 문항, 난이도·어휘 분류, 정답과 해설 |

검색 모드는 `all`(전체 검색)과 `sound`(소리 검색), 어휘 분류는 `all`, `normal`, `classical`입니다. 생략 시 모두 `all`을 사용합니다. 소리 검색은 한글 또는 로마자 독음의 정확한 일치를 찾고 혼합어의 한글 부분은 제외합니다.

검색 결과는 단어·한자별 최대 60개이며 개수 필드는 제한 전 일치 수입니다. 어휘 필터를 먼저 적용하고, 전체 검색에서는 정확히 일치한 표제어를 먼저 표시합니다. 빈 검색어는 목록의 앞부분을 반환합니다.

`q`는 앞뒤 공백을 제외하고 최대 100개 유니코드 문자까지 받습니다. 필수 검색어 누락이나 잘못된 조건에는 `400`, 없는 경로에는 `404`, 허용하지 않는 메서드에는 `405`를 반환합니다. 정확 조회 결과가 없으면 빈 배열입니다. API 응답은 캐시하지 않도록 `Cache-Control: no-store`를 사용합니다.

그래프 조회는 단어를 먼저 찾고, 일치하는 단어가 없으면 글자·독음·ID로 시작점을 정합니다. 응답의 `roots`, `characters`, `words`는 전체 어휘 분류를 포함하며 화면에서 분류를 거릅니다. 무작위 조회는 같은 분류에 다른 항목이 있으면 지정한 한글·한자 쌍을 제외합니다.

연습 API는 정답과 해설도 전달합니다. 문항 선택과 채점은 브라우저에서 이루어지는 자율 학습 기능입니다.

</details>

## 검증

자료 형식을 확인하려면 다음 명령을 사용하세요.

```sh
go run ./cmd validate
```

이 명령은 `meta.jsonl`, `character.jsonl`, `word.jsonl`의 형식·중복·참조와 연결 수를 확인합니다. 웹 연습 파일은 서버 시작 시 따로 검사합니다. 내용의 정확성과 출처 기준은 [콘텐츠 원칙](DATA_GUIDELINES.md)을 참고하세요.

<details>
<summary>코드를 수정한 경우 확인하기</summary>

```sh
go test -count=1 ./...
go vet ./...
```

웹 코드를 바꿨다면 변경 기능에 해당하는 JavaScript 테스트와 실제 화면을 확인합니다. JavaScript 테스트에는 Node.js가 필요하며 앱 실행에는 필요하지 않습니다. 예를 들어 혼합어 그래프는 다음과 같이 검사합니다.

```sh
node --test internal/webapp/tests/mixed-network.test.mjs
```

기본 검사는 변경 기능에 맞게 선택합니다. 모든 어휘의 그래프 배치를 전수 검사하는 테스트와 전체 JavaScript 테스트 실행은 일반적인 자료 수정에 필수인 절차가 아닙니다.

</details>
