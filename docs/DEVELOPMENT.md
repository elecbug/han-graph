# 설치와 활용

[처음으로](../README.md) · [사용 안내](WEB_APP.md) · [데이터 안내](DATA_MODEL.md)

漢-Graph를 자신의 컴퓨터에서 실행하거나, 함께 제공되는 명령줄 도구와 API로 자료를 살펴보는 방법입니다.

## 준비하기

웹 브라우저와 Docker Engine·Docker Compose 또는 Go 1.26.2 이상이 필요합니다. 별도 데이터베이스 서버나 프런트엔드 빌드 도구는 필요하지 않습니다. 기본 계정 저장소는 bbolt 파일이며 Firestore도 선택할 수 있습니다. Docker 명령은 저장소 루트에서, `go` 명령은 `src` 디렉터리에서 실행합니다.

## Docker Compose로 실행

저장소 루트에서 처음 한 번 계정 폴더와 `.env`를 준비합니다. Linux에서는 컨테이너가 `var` 폴더 소유자의 UID·GID로 실행되어야 기존 계정 파일에 접근할 수 있습니다.

```sh
mkdir -p var
test -f .env || printf 'HAN_GRAPH_UID=%s\nHAN_GRAPH_GID=%s\nHAN_GRAPH_DB_BACKEND=file\n' "$(id -u)" "$(id -g)" > .env
```

이미 `.env`가 있으면 덮어쓰지 말고 필요한 설정만 수정하세요. 다른 사용자가 만든 `var` 폴더를 사용하는 경우에는 해당 소유자의 UID·GID를 지정합니다. 설정 예시는 [`.env.example`](../.env.example)에 있습니다.

기존 수동 서버를 정상 종료한 뒤 실행합니다. 동일한 계정 파일과 포트를 함께 사용할 수 없습니다.

```sh
docker compose up -d --build
docker compose ps
docker compose logs -f han-graph
```

기본 접속 주소는 <http://127.0.0.1:18080>이며 모든 호스트 인터페이스에서 접속을 받습니다. 로컬에서만 접속하려면 `.env`에 `HAN_GRAPH_HOST=127.0.0.1`, 포트를 바꾸려면 `HAN_GRAPH_PORT=8081`처럼 추가한 뒤 `docker compose up -d`로 적용합니다. 기본 bridge 네트워크의 서브넷은 `10.230.9.0/24`로 고정되어 있습니다.

공개 사전과 웹 화면은 이미지에 포함되고, `./var`는 컨테이너의 `/app/var`에 연결됩니다. 파일 모드에서는 기존 `var/accounts.db`를 사용하며 컨테이너 재생성이나 `docker compose down` 후에도 보존됩니다. `var`와 `.env`, Git 이력은 이미지 빌드에 포함하지 않습니다. 소스나 공개 데이터를 수정한 뒤에는 `docker compose up -d --build`로 다시 빌드합니다. 상태 검사는 `/api/stats`를 사용하며, Docker Engine이 재시작되면 수동으로 중지하지 않은 서버도 자동으로 다시 실행됩니다.

```sh
docker compose down
```

위 명령은 서버를 정상 종료합니다. 파일 모드에서 백업은 종료한 뒤 `var/accounts.db`를 복사하세요.

이미지에 포함된 사전은 다음과 같이 검사할 수 있습니다. 계정 데이터베이스를 열지 않으므로 서버가 실행 중이어도 사용할 수 있습니다.

```sh
docker compose exec han-graph han-graph -data /app/dataset validate
```

HTTPS 프록시 뒤에서 운영한다면 `compose.override.yaml`의 명령을 다음과 같이 설정한 뒤 `docker compose up -d`로 적용하세요.

```yaml
services:
  han-graph:
    command: ["-data", "/app/dataset", "-accounts", "/app/var/accounts.db", "-addr", "0.0.0.0:18080", "-secure-cookies", "serve"]
```

## 웹 앱 실행

아래 명령은 `src` 디렉터리에서 실행합니다. 첫 실행 시 Go가 필요한 모듈을 내려받습니다.

```sh
go run ./cmd -addr 127.0.0.1:18080 serve
```

브라우저에서 <http://127.0.0.1:18080>을 열면 됩니다. 터미널에서 `Ctrl+C`를 누르면 종료합니다.

| 바꾸고 싶은 설정 | 사용 방법 |
| --- | --- |
| 포트 | `go run ./cmd -addr 127.0.0.1:8081 serve` |
| 계정 저장 위치 | `go run ./cmd -accounts ../var/accounts.db -addr 127.0.0.1:18080 serve` |
| HTTPS 프록시 뒤에서 운영 | 위 명령에 `-secure-cookies` 추가 |
| 데이터 위치 | `go run ./cmd -data ../dataset -addr 127.0.0.1:18080 serve` |

옵션은 `serve` 같은 명령보다 앞에 둡니다. `-data`의 기본값은 `../dataset`이며 실행하는 디렉터리를 기준으로 합니다. `-addr`를 생략하면 `0.0.0.0:18080`에서 접속을 받습니다.

데이터는 서버를 시작할 때 읽으므로 수정한 자료를 보려면 재시작해야 합니다. 화면 파일은 실행 프로그램에 포함되므로 화면 소스를 바꾼 경우 `go run`을 다시 실행하거나 다시 빌드한 뒤 브라우저를 새로고침합니다.

### 계정 데이터 보관

저장소 루트의 `.env`에서 **계정·세션·단어장·노트·개인 사전**의 저장소를 선택합니다. 설정을 바꾼 뒤 Compose는 `docker compose up -d`, 직접 실행한 서버는 재시작으로 적용합니다. 두 저장소는 독립적이며 다시 선택하면 해당 저장소에 있던 계정을 사용합니다. 공개 어휘·예문·문항은 두 모드 모두 `-data` 디렉터리에서 읽습니다.

| `.env` 설정 | 용도 |
| --- | --- |
| `HAN_GRAPH_DB_BACKEND=file` | 기본값. 기존 bbolt 파일 사용 |
| `HAN_GRAPH_DB_BACKEND=firestore` | Cloud Firestore 사용 |
| `GOOGLE_CLOUD_PROJECT` | Firestore 데이터베이스가 속한 프로젝트 ID |
| `FIRESTORE_DATABASE_ID` | 생략하면 `(default)`. 이름 있는 데이터베이스도 선택 가능 |
| `GOOGLE_APPLICATION_CREDENTIALS` | 인증 파일을 사용할 때 서버 프로세스가 읽을 수 있는 경로 |
| `FIRESTORE_EMULATOR_HOST` | 로컬 에뮬레이터를 쓸 때만 지정하는 `호스트:포트` |

직접 실행한 서버는 작업 디렉터리의 `.env`를 읽습니다. 저장소의 `src`에서 실행하면 그곳에 `.env`가 없을 때 상위 저장소 루트의 파일을 읽습니다. 셸이나 컨테이너에 이미 설정된 환경변수가 우선합니다.

**Firestore로 실행하는 예시**

```dotenv
HAN_GRAPH_DB_BACKEND=firestore
GOOGLE_CLOUD_PROJECT=my-project-id
FIRESTORE_DATABASE_ID=(default)
```

선택할 Firestore Native 데이터베이스를 먼저 생성하고, 서버의 실행 계정에 읽기·쓰기 권한인 `roles/datastore.user`를 부여합니다. Cloud Run에서는 연결된 서비스 계정으로 인증합니다. 직접 실행할 때는 `gcloud auth application-default login`으로 만든 로컬 인증 정보 또는 `GOOGLE_APPLICATION_CREDENTIALS`를 사용할 수 있습니다. [Firestore 서버 IAM](https://docs.cloud.google.com/firestore/native/docs/security/iam) · [기본 인증 정보](https://cloud.google.com/docs/authentication/application-default-credentials)

Compose에서 인증 파일을 쓸 때는 컨테이너 내부 경로를 지정하세요. 예를 들어 기본 마운트를 이용해 호스트의 `var/google-credentials.json`을 `GOOGLE_APPLICATION_CREDENTIALS=/app/var/google-credentials.json`으로 참조할 수 있습니다. 파일은 컨테이너 실행 사용자가 읽을 수 있어야 합니다. Cloud Run 배포 스크립트는 저장소 선택·프로젝트·데이터베이스 ID와 Google 로그인용 웹 클라이언트 ID를 서비스 설정에 전달합니다.

Firestore 에뮬레이터가 실행 중이면 `src`에서 `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 go test -count=1 -run TestFirestorePersistence ./internal/account`로 계정 저장과 동시 수정을 확인할 수 있습니다. 에뮬레이터 주소에는 스킴 없이 호스트와 포트를 지정하세요. [Firestore 에뮬레이터 연결 안내](https://firebase.google.com/docs/emulator-suite/connect_firestore)

**파일 모드**에서는 계정 데이터를 `-accounts`가 가리키는 파일에 저장합니다. 기본값 `../var/accounts.db`는 실행 디렉터리를 기준으로 하며, 저장소의 `src`에서 실행하면 루트의 `var` 폴더에 만들어집니다. 서버를 재시작해도 같은 파일을 사용하면 계정·개인 사전·단어장·노트가 유지됩니다. 이 파일은 공개 사전 데이터와 별개이며 저장소에 포함하지 않습니다.

회원 탈퇴 시 파일 DB는 한 트랜잭션에서 계정과 학습 데이터를 삭제합니다. Firestore는 계정과 로그인 수단, 세션을 먼저 삭제하고 같은 트랜잭션에 하위 문서 정리 작업을 기록합니다. 개인 사전과 연습 기록의 삭제가 중단되면 서버가 시작할 때와 실행 중에 작업을 재개합니다.

백업할 때는 서버를 정상 종료한 뒤 데이터베이스 파일을 복사합니다. 복원할 때도 서버가 정지한 상태에서 되돌려 놓으세요. 파일 권한은 소유자만 읽고 쓰도록 설정됩니다. 같은 파일을 두 서버 프로세스가 동시에 열 수 없습니다. 컨테이너나 임시 실행 환경을 사용한다면 `-accounts` 위치를 영구 볼륨에 두세요.

외부에 서비스할 때는 HTTPS로 제공하고, HTTPS 리버스 프록시 뒤에서 `-secure-cookies`를 켜 로그인 쿠키를 HTTPS 연결로 제한하세요. 기본 로그인 시도 제한은 서버가 직접 보는 접속 주소에 적용하므로 프록시를 쓰는 경우 여러 이용자가 같은 제한을 공유할 수 있습니다.

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

서버를 실행하면 같은 주소에서 사전 조회와 계정용 JSON API를 사용할 수 있습니다. 예를 들어 `/api/search?q=하&mode=sound`는 독음 ‘하’로 검색합니다. 별도로 운영되는 공개 API 주소는 제공하지 않습니다.

<details>
<summary>API 경로와 조회 조건</summary>

| 경로 | 입력 | 반환 내용 |
| --- | --- | --- |
| `GET /api/stats` | 없음 | 어휘·한자·독음·연결 수 |
| `GET /api/readings` | 없음 | 현재 공개·개인 사전의 독음 그룹 목록 |
| `GET /api/search` | 선택적 `q`, `mode`, `level` | 단어·한자 목록과 전체 일치 수 |
| `GET /api/words` | 필수 `q` | 정확히 일치한 단어, 구성 한자와 `example` 예문 |
| `GET /api/characters` | 필수 `q` | 글자·독음·ID에 일치한 한자와 연결 단어 |
| `GET /api/neighborhood` | 필수 `q` | 시작 한자와 직접 연결된 단어·한자 |
| `GET /api/random-word` | 선택적 `level`, `exclude_word`, `exclude_hanja` | 무작위 단어 하나 |
| `GET /api/practice` | 없음 | 전체 문항, 정답 어휘 분류, 정답과 해설 |

검색 모드는 `all`(전체 검색)과 `sound`(소리 검색), 어휘 분류는 `all`, `easy`, `normal`, `hard`, `classical`입니다. 생략 시 모두 `all`을 사용합니다. 소리 검색은 한글 또는 로마자 독음의 정확한 일치를 찾고 혼합어의 한글 부분은 제외합니다.

검색 결과는 단어·한자별 최대 60개이며 개수 필드는 제한 전 일치 수입니다. 어휘 필터를 먼저 적용하고, 전체 검색에서는 정확히 일치한 표제어를 먼저 표시합니다. 빈 검색어는 목록의 앞부분을 반환합니다.

`q`는 앞뒤 공백을 제외하고 최대 100개 유니코드 문자까지 받습니다. 필수 검색어 누락이나 잘못된 조건에는 `400`, 없는 경로에는 `404`, 허용하지 않는 메서드에는 `405`를 반환합니다. 정확 조회 결과가 없으면 빈 배열입니다. API 응답은 캐시하지 않도록 `Cache-Control: no-store`를 사용합니다.

그래프 조회는 단어를 먼저 찾고, 일치하는 단어가 없으면 글자·독음·ID로 시작점을 정합니다. 응답의 `roots`, `characters`, `words`는 전체 어휘 분류를 포함합니다. 웹 화면에서는 선택한 한자 하나로 조회하고, 그 한자와 직접 연결된 단어만 남긴 뒤 어휘 분류를 거릅니다. 무작위 조회는 같은 분류에 다른 항목이 있으면 지정한 한글·한자 쌍을 제외합니다.

연습 API는 정답과 해설도 전달합니다. 문항 선택과 채점은 브라우저에서 이루어지는 자율 학습 기능입니다.

</details>

### Google 계정 연동

Google Cloud 콘솔의 **Google Auth Platform**에서 앱 브랜딩과 대상을 설정하고 **웹 애플리케이션** 유형의 OAuth 클라이언트를 만드세요. **승인된 자바스크립트 원본**에 사용자가 실제 접속하는 HTTPS 주소를 등록합니다. Cloud Run이라면 서비스 URL 또는 사용자 도메인을, 로컬 테스트라면 `http://localhost:18080`을 등록하세요. 테스트 모드에서는 사용할 Google 계정을 테스트 사용자로 추가합니다. [Google 공식 설정 안내](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid)

웹 클라이언트 ID를 `.env`의 `HAN_GRAPH_GOOGLE_CLIENT_ID`에 지정한 뒤 Compose는 `docker compose up -d --build`, 직접 실행은 재시작으로 적용하세요. Cloud Run 배포 스크립트도 이 공개 값을 서비스에 전달합니다. Google에서 발급한 ID 토큰으로 주소를 확인하므로 필요한 설정값은 클라이언트 ID 하나입니다. Gmail과 Google이 관리하는 Workspace 주소를 지원합니다.

클라이언트 ID를 설정하면 신규 회원은 Google 계정을 확인한 뒤 아이디와 비밀번호를 정합니다. 기존 회원은 이메일 없이 계속 로그인할 수 있습니다. 개인 설정에서 현재 비밀번호로 Google 계정을 연결하거나 교체하면 연결된 Google 계정으로도 로그인할 수 있습니다. 서버는 Google 서명, 발급자, 클라이언트 ID, 만료 시간, 브라우저 인증 요청 및 검증된 주소를 확인하고 Google 계정 고유 ID로 연결을 찾습니다. [Google ID 토큰 검증 안내](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)

### 계정 API

| 경로 | 용도 |
| --- | --- |
| `POST /api/auth/google/challenge` | `{intent}`로 login, register, link 또는 recover 용도의 인증 요청 생성 |
| `POST /api/auth/recovery/verify` | `{credential}`로 복구용 Google 인증과 기존 계정 연결을 확인하고 검증된 이메일 반환 |
| `POST /api/auth/recovery/reset` | 같은 브라우저에서 `{credential,new_password}`로 10분 안에 비밀번호를 재설정하고 모든 세션 종료. 기존 Google 클라이언트 ID 설정만 사용 |
| `POST /api/auth/register` | `{username,password}`로 가입하고 로그인. Google 연동 시 ID 토큰을 `credential`로 함께 전송 |
| `POST /api/auth/login` | `{username,password}` 또는 연결된 Google 계정의 `{credential}`로 로그인 |
| `GET /api/auth/session` | 현재 사용자와 개인 사전·단어장·노트, Google 연동 설정(`google_client_id`) 조회. 비회원은 `user: null` |
| `POST /api/auth/logout` | `{}`로 현재 로그인 종료 |
| `PUT /api/account/credentials` | `{username,current_password}`와 `new_username` 또는 `new_password`로 로그인 정보 변경. 비밀번호 변경 시 요청 세션을 제외한 기존 세션 종료 |
| `POST /api/account/google` | `{username,password,credential}`로 로그인한 계정에 Google 계정 연결 또는 교체 |
| `DELETE /api/account` | `{username,current_password,confirm:true}`로 회원 탈퇴. 모든 세션, 로그인 정보, 개인 학습 데이터 삭제 |
| `POST /api/account/practice` | 완료한 회차의 `{id,level,answers:[{question,selected:{word,hanja}}]}` 저장. 서버가 출제 자료에서 정답을 확인하며 같은 회차의 재시도는 한 번만 저장 |
| `GET /api/account/practice` | 본인의 완료 기록을 최근 순으로 20회씩 조회. 응답의 `next`를 `after`로 보내면 다음 페이지 조회 |
| `POST /api/account/words` | `{words:[{word,hanja}]}`를 기존 목록에 합치기 |
| `DELETE /api/account/words` | `{word,hanja}`를 단어장에서 삭제 |
| `GET /api/account/dictionary` | 본인의 개인 사전 항목 조회 |
| `POST /api/account/dictionary` | `{words,characters,meta,examples}` 배열로 개인 사전에 추가 |
| `DELETE /api/account/dictionary` | `{kind:"word",word,hanja}` 또는 `{kind:"character"/"meta",id}`로 개인 항목 삭제 |
| `PUT /api/account/note` | `{word,hanja,text,revision}`으로 노트 저장; 빈 내용은 삭제 |

요청 본문은 JSON입니다. 로그인 쿠키는 HttpOnly·SameSite로 설정하고 다른 출처의 쓰기 요청은 거부합니다. 로그아웃과 개인 자료 변경에는 현재 세션 응답의 사용자 ID를 `X-Account-ID` 헤더로 전달해야 합니다. 브라우저의 다른 탭에서 계정이 바뀌더라도 이전 계정에서 작성한 내용이 잘못 저장되는 것을 막습니다.

로그인한 사전 조회는 공개 사전과 본인의 개인 사전을 합쳐 반환합니다. 읽기 요청에 `X-Account-ID`를 넣으면 현재 세션의 사용자와 일치해야 하며, `guest`를 넣으면 공개 사전만 조회합니다. 사전 응답은 `Vary: Cookie, X-Account-ID`와 `Cache-Control: no-store`를 사용합니다. 첫 화면의 HTML에는 공개 자료만 포함합니다.

계정 응답의 `dictionary`는 네 배열을 담고, `dictionary_revision`은 개인 사전이 변경될 때 증가합니다. 등록·삭제는 하나의 저장 작업으로 처리하며 필드·연결 오류는 `400 dictionary_invalid`, 중복은 `409 dictionary_duplicate`로 반환합니다. 오류의 `detail`에는 배열과 항목 위치, 이유를 담습니다. 기존 사전 항목은 변경하지 않습니다. 등록 형식과 한도는 [개인 사전 안내](WEB_APP.md#나만의-사전)를 참고하세요.

노트의 첫 저장은 `revision: 0`, 이후 수정은 서버에서 받은 버전을 보냅니다. 버전이 다르면 `409 conflict`를 반환합니다. 계정 응답은 캐시하지 않으며 아이디 중복은 `409`, 인증 실패는 `401`, 저장 한도 초과는 `422`, 과도한 로그인 시도는 `429`입니다. 비밀번호는 개별 salt를 사용한 PBKDF2-HMAC-SHA256 해시로 저장합니다.

## 검증

자료 형식을 확인하려면 다음 명령을 사용하세요.

```sh
go run ./cmd validate
```

이 명령은 `meta.jsonl`, `character.jsonl`, `word.jsonl`의 형식·중복·참조와 연결 수를 확인하며, `example.jsonl`이 있으면 예문의 참조·중복·문장 형식도 검사합니다. `practice.json`이 있으면 선택지·정답·문맥·해설도 함께 검사합니다. 내용의 정확성과 출처 기준은 [콘텐츠 원칙](DATA_GUIDELINES.md)을 참고하세요.

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
