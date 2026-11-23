# 교내 베타 운영

비회원은 검색·그래프·듣기·문맥 연습을 바로 이용할 수 있습니다. 회원 기능을 여는 시점은 서버에서 변경합니다. 화면 하단의 **개인정보 처리방침**은 로그인 없이 12개 언어로 열립니다. 운영자는 **HAN-GRAPH Team**이며, 문의는 같은 화면의 **피드백 보내기**에서 받습니다.

## 모집 단계와 가입 설정

| `HAN_GRAPH_SIGNUP_MODE` | 새 회원가입 | 기존 계정 |
| --- | --- | --- |
| `closed` | 닫힘. 비회원 체험 기간이나 모집 종료 시 사용 | 로그인·자료 열람·탈퇴 가능 |
| `invite` | 초대 코드를 받은 학생이 가입 | 평소처럼 로그인 |
| `open` | 누구나 가입. 로컬 설치의 기본값 | 평소처럼 로그인 |

교내 게시판에 처음 안내할 때는 `closed`로 시작하고, 계정 테스트를 희망하는 학생에게 코드를 전달할 때 `invite`로 변경합니다. 코드는 초대된 사람이 공유할 수 있으므로 모집 인원과 기간은 운영팀이 관리합니다. 가입자는 방침을 확인하고 수집·이용에 동의합니다. DB에는 동의 시각과 버전도 함께 기록됩니다. Google 인증이 설정된 배포에서는 가입할 때 Google 확인을 거칩니다.

Docker Compose는 `.env`에서 가입 모드와 `HAN_GRAPH_BETA_INVITE_CODE`를 읽습니다. 초대 코드는 8~128바이트로 설정합니다. Cloud Run에서는 Firestore를 선택하고 초대 코드를 Secret Manager에 등록한 뒤 런타임 서비스 계정에 해당 시크릿의 읽기 권한을 줍니다. 배포 스크립트에는 시크릿 이름과 버전을 전달합니다.

```sh
HAN_GRAPH_DB_BACKEND=firestore HAN_GRAPH_SIGNUP_MODE=invite \
HAN_GRAPH_BETA_INVITE_SECRET=campus-invite:1 bash han-graph-cloudrun.sh deploy
bash han-graph-cloudrun.sh beta-check
```

새 배포가 사용할 Firestore 프로젝트·DB 이름·위치를 확인하세요. Cloud Run에서는 계정과 피드백을 임시 디스크에 기록하는 설정을 서버가 거부합니다. 전용 Firestore DB의 클라이언트 보안 규칙으로 저장소 루트의 `firestore.rules`를 적용하면 브라우저의 직접 읽기·쓰기가 차단됩니다. HAN-GRAPH 서버는 서비스 계정의 IAM 권한으로 접근합니다. 다른 앱과 DB를 공유한다면 기존 규칙도 함께 검토하세요. [Firestore 보안 규칙](https://firebase.google.com/docs/firestore/security/get-started) · [서버 IAM](https://cloud.google.com/firestore/docs/security/iam)

## 공개 주소에서 확인할 항목

- 비회원 브라우저에서 검색, 문제 풀이, 단어·예문 듣기, 하단 피드백 제출, `/privacy` 열기를 확인합니다.
- 테스트 계정 두 개를 사용해 한 계정에 단어·노트·문맥 연습 기록을 저장합니다. 두 번째 계정에는 그 자료가 표시되지 않아야 합니다. 새 리비전에 접속해 첫 계정의 자료가 남는지 확인합니다.
- Google 로그인을 사용할 때는 실제 공개 HTTPS 주소를 Google 웹 클라이언트의 승인된 JavaScript 원본에 등록하고 가입·로그인·연결 변경·복구를 시험합니다. 기존 비밀번호로도 로그인되는지 확인합니다.
- 테스트 계정으로 탈퇴한 뒤 해당 세션과 자격 증명이 무효화되고 학습 자료가 삭제되는지 확인합니다. Firestore는 삭제 작업이 중단되면 다시 시작합니다. 다른 테스트 계정에서 기존 자료에 접근할 수 있어야 합니다.

한 서버 인스턴스에서 같은 접속 주소의 가입·로그인 요청은 합쳐서 15분에 300회까지 허용합니다. 같은 주소와 아이디 조합에는 가입과 비밀번호 로그인 각각 10회 한도를 적용합니다. 비밀번호 해시는 동시에 두 건을 계산하고, 몰리는 요청은 최대 64건까지 10초 동안 대기시킵니다. 요청 제한은 `Retry-After`가 있는 HTTP 429로 표시됩니다. 서버가 직접 본 연결 주소를 사용하므로 학교 NAT나 프록시 뒤의 학생들은 주소 한도를 공유합니다. 인스턴스가 늘어나거나 재시작하면 각 인스턴스의 카운터는 독립적으로 동작합니다.

## 피드백 확인과 처리

화면 하단의 피드백은 회원과 비회원 모두 제출할 수 있습니다. 운영팀은 본문·화면 언어·접수 시각·접수 번호를 DB에서 확인합니다. PIN, 비밀번호, 세션, 계정 아이디, 이메일을 자동 첨부하지 않습니다. 공개 웹에는 제출 기능만 있습니다.

- **Firestore** 콘솔에서 선택한 DB의 `hanGraphFeedback` 컬렉션을 열고 접수 번호로 문서를 찾습니다.
- **파일 DB**의 `feedback` 버킷에서 확인합니다. 운영자 CLI는 선택된 DB를 직접 열어 한 줄에 한 건씩 JSON으로 출력합니다. 파일 DB는 한 프로세스가 점유하므로 서버를 정상 종료하거나 일관된 백업 사본을 사용합니다.

```sh
# 저장소의 src 디렉터리에서, 서버를 멈춘 파일 DB 또는 백업 사본 조회
HAN_GRAPH_DB_BACKEND=file go run ./cmd -accounts /secure/path/accounts.db feedback-list
# 처리한 문의를 원본 DB에서 접수 번호로 삭제
HAN_GRAPH_DB_BACKEND=file go run ./cmd -accounts /secure/path/accounts.db feedback-resolve "$RECEIPT_ID"
```

Firestore에서도 같은 명령을 사용할 수 있습니다. 해당 프로젝트의 DB 접근 권한이 필요합니다. 운영팀은 문의 종료 후 해당 항목을 삭제합니다. 문의자가 답변이나 개인정보 관련 조치를 요청하면 필요한 본인 확인을 별도로 진행합니다.

## 비용·오류·중단 대응

Cloud Billing에서 베타 프로젝트에 맞는 월 예산과 실제·예측 비용 알림을 설정하고 수신자에게 테스트 알림이 도달하는지 확인합니다. 예산 알림 자체는 지출을 자동으로 멈추지 않습니다. Cloud Run 배포 스크립트의 기본 최대 인스턴스 수는 1입니다. Firestore 읽기·쓰기, 음원 전송량과 429·5xx 비율도 함께 봅니다. [예산 알림 설정](https://cloud.google.com/billing/docs/how-to/budgets)

```sh
bash han-graph-cloudrun.sh logs 100
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="han-graph" AND (severity>=ERROR OR httpRequest.status>=500 OR httpRequest.status=429)' --project="$PROJECT_ID" --limit=50
```

신규 모집만 멈출 때는 가입 모드를 닫습니다. 외부 접속까지 긴급 차단할 때는 해당 서비스의 인그레스를 내부로 제한하고 외부 브라우저에서 차단을 확인합니다. 수정 후 테스트를 거쳐 기존 인그레스 설정을 복구합니다. 배포 회귀가 원인이면 정상 동작을 확인한 리비전으로 트래픽을 되돌릴 수 있습니다. [Cloud Run 인그레스](https://cloud.google.com/run/docs/securing/ingress) · [트래픽 롤백](https://cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration)

```sh
gcloud run services update "$SERVICE" --region="$REGION" --project="$PROJECT_ID" --update-env-vars=HAN_GRAPH_SIGNUP_MODE=closed
gcloud run services update "$SERVICE" --region="$REGION" --project="$PROJECT_ID" --ingress=internal
```

## 백업과 복원 시험

파일 DB는 서버를 정상 종료한 뒤 DB 파일을 소유자 전용 권한으로 복사합니다. 테스트 서버가 사본을 열도록 `-accounts` 경로를 변경하고 가입·단어장·노트·연습 기록·피드백을 확인합니다.

Firestore 운영 백업은 접근 권한을 제한한 저장 위치에 내보내고, 별도 테스트 DB에 가져와 같은 항목을 확인합니다. 내보내기·가져오기는 결제가 필요할 수 있습니다. 복원본에는 백업 당시의 로그인 정보와 삭제 전 자료도 포함됩니다. 외부 접속을 차단한 환경에서 시험하고, 실제 전환 전에 백업 이후 탈퇴·삭제 요청을 반영합니다. 백업·인프라 로그의 보존 기간, 저장 위치, 접근 권한과 예산 알림 수신자는 공개 전에 실제 Google Cloud 설정에서 확인하고 운영 기록에 남깁니다. [Firestore 내보내기·가져오기](https://cloud.google.com/firestore/docs/manage-data/export-import)

로컬 Firestore 에뮬레이터에서 `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 go test -count=1 ./internal/account`를 실행하면 계정·세션·학습 자료 저장 및 탈퇴 정리를 확인할 수 있습니다. 개인정보 처리방침을 개정할 때는 적용일, 번역, 서버가 기록하는 동의 버전을 함께 검토합니다. [개인정보보호위원회 2026년 개인정보 처리방침 작성지침](https://www.privacy.go.kr/front/bbs/bbsView.do?bbsNo=BBSMSTR_000000000049&bbscttNo=20885)
