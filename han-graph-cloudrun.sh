#!/usr/bin/env bash
# HAN-GRAPH: Google Cloud Run 운영 명령 모음
# 사용 환경: Google Cloud Shell (bash, gcloud, curl, Python3)
# 실행: bash han-graph-cloudrun.sh help
#
# Cloud Run에서 계정을 영구 보관하려면 HAN_GRAPH_DB_BACKEND=firestore 를 설정합니다.

set -Eeuo pipefail

PROJECT_ID="${PROJECT_ID:-han-graph}"
SERVICE="${SERVICE:-han-graph}"
REGION="${REGION:-asia-northeast3}"
PORT="${PORT:-18080}"
MEMORY="${MEMORY:-1Gi}"
CPU="${CPU:-1}"
MIN_INSTANCES="${MIN_INSTANCES:-0}"
MAX_INSTANCES="${MAX_INSTANCES:-1}"
CONCURRENCY="${CONCURRENCY:-20}"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ -n "${HAN_GRAPH_DIR:-}" ]]; then
  REPO_DIR="$HAN_GRAPH_DIR"
elif [[ -f "$SCRIPT_DIR/Dockerfile" && -d "$SCRIPT_DIR/src" ]]; then
  REPO_DIR="$SCRIPT_DIR"
else
  REPO_DIR="$HOME/han-graph"
fi

info() { printf '\n[INFO] %s\n' "$*"; }
warn() { printf '\n[WARN] %s\n' "$*" >&2; }
die()  { printf '\n[ERROR] %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'HELP'
HAN-GRAPH / Google Cloud Run 관리 스크립트

사용법:
  bash han-graph-cloudrun.sh <명령> [옵션]

자주 사용하는 명령:
  deploy                 소스 빌드 및 Cloud Run 배포
  update                 GitHub 최신 소스 가져오기 (추적 파일 수정 시 중단)
  update-deploy          소스 업데이트 후 배포
  status                 Cloud Run 서비스 정보 및 주소 확인
  check                  홈페이지, 개인정보 처리방침, 통계·세션 API의 HTTP 응답 검사
  beta-check             공개 주소의 가입 방식·방침 버전과 Firestore 설정 확인
  logs [개수]            Cloud Run 최근 로그 조회 (기본 50개)
  url                    기본 Cloud Run 서비스 주소 출력

초기 설정·장애 복구:
  project                gcloud 기본 프로젝트 및 스크립트 대상 확인
  clone                  GitHub 저장소가 없다면 다운로드
  billing                프로젝트 결제 연결 상태 확인
  setup                  Cloud Run / Cloud Build / Artifact Registry API 활성화
  fix-iam                Cloud Build 서비스 계정 역할 복구 (IAM 변경)
  public                 Cloud Run의 Invoker IAM 검사 비활성화 (공개 접속)

선택 사항:
  domain-check [주소]     예: han-graph.cloud.run 사용 가능 여부 검사
  domain [주소]           예: han-graph.cloud.run 사용자 지정 URL 연결
  domains                현재 사용자 지정 URL 목록 확인
  source-status          Git 작업 폴더 상태 확인
  help                   이 도움말 출력

현재 설정 (환경 변수로 변경 가능):
  PROJECT_ID=han-graph          SERVICE=han-graph
  REGION=asia-northeast3        PORT=18080
  MEMORY=1Gi                   CPU=1
  MIN_INSTANCES=0              MAX_INSTANCES=1
  CONCURRENCY=20               HAN_GRAPH_DIR=~/han-graph
  HAN_GRAPH_GOOGLE_CLIENT_ID=Google 웹 클라이언트 ID (생략 시 서비스의 설정 유지)
  HAN_GRAPH_DB_BACKEND=firestore (첫 배포 시 지정, 생략 시 기존 설정 유지)
  HAN_GRAPH_SIGNUP_MODE=open 또는 invite 또는 closed
  HAN_GRAPH_BETA_INVITE_SECRET=Secret Manager의 초대 코드 시크릿명:버전
  GOOGLE_CLOUD_PROJECT=PROJECT_ID의 값   FIRESTORE_DATABASE_ID=(default)

예시:
  bash han-graph-cloudrun.sh deploy
  bash han-graph-cloudrun.sh logs 100
  bash han-graph-cloudrun.sh domain han-graph.cloud.run

주의:
  1) setup, fix-iam, deploy, public, domain은 클라우드 구성을 변경합니다.
  2) 빌드·저장·전송에 비용이 발생할 수 있습니다.
  3) Cloud Run의 파일 DB는 휘발성입니다. Firestore는 미리 만든 데이터베이스와
     런타임 서비스 계정의 데이터 접근 권한을 사용합니다.
HELP
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "'$1' 명령이 없습니다. Google Cloud Shell을 이용하십시오."
}

require_cloud() { require_command gcloud; }

cloud() { gcloud --project="$PROJECT_ID" "$@"; }

project_info() {
  require_cloud
  local active=""
  active="$(gcloud config get-value project 2>/dev/null)" || true
  printf 'gcloud 기본 프로젝트: %s\n' "${active:-미설정}"
  printf '스크립트 대상 프로젝트: %s\n' "$PROJECT_ID"
  printf '배포 서비스 / 리전: %s / %s\n' "$SERVICE" "$REGION"
  if [[ "$active" != "$PROJECT_ID" ]]; then
    warn "gcloud 기본 프로젝트와 다릅니다. 스크립트는 항상 PROJECT_ID=$PROJECT_ID 에만 명령을 실행합니다."
  fi
}

clone_repo() {
  require_command git
  if [[ -f "$REPO_DIR/Dockerfile" && -d "$REPO_DIR/src" ]]; then
    info "저장소가 이미 있습니다: $REPO_DIR"
    return 0
  fi
  if [[ -e "$REPO_DIR" ]]; then
    die "대상 경로가 이미 존재하지만 HAN-GRAPH 저장소가 아닙니다: $REPO_DIR"
  fi
  info "HAN-GRAPH 저장소 다운로드: $REPO_DIR"
  git clone 'https://github.com/elecbug/han-graph.git' "$REPO_DIR"
}

require_repo() {
  [[ -f "$REPO_DIR/Dockerfile" && -d "$REPO_DIR/src" && -d "$REPO_DIR/dataset" ]] ||
    die "HAN-GRAPH 저장소를 찾지 못했습니다: $REPO_DIR\n먼저 git clone https://github.com/elecbug/han-graph.git 를 실행하거나 HAN_GRAPH_DIR을 지정하십시오."
}

project_number() {
  cloud projects describe "$PROJECT_ID" --format='value(projectNumber)'
}

billing() {
  require_cloud
  info "프로젝트: $PROJECT_ID / 결제 연결 확인"
  cloud beta billing projects describe "$PROJECT_ID" \
    --format='yaml(projectId,billingAccountName,billingEnabled)'
}

setup() {
  require_cloud
  info "API 활성화 대상: $PROJECT_ID"
  local bill
  bill="$(cloud beta billing projects describe "$PROJECT_ID" --format='value(billingEnabled)' 2>/dev/null)" ||
    die "결제 상태를 조회할 수 없습니다. https://console.cloud.google.com/billing/projects 에서 확인하십시오."
  case "$bill" in
    True|true) ;;
    *) die "활성 결제 계정이 연결되지 않았습니다. https://console.cloud.google.com/billing/projects 에서 연결하십시오." ;;
  esac
  cloud services enable \
    run.googleapis.com \
    cloudbuild.googleapis.com \
    artifactregistry.googleapis.com
  info "API 활성화 명령 완료"
}

fix_iam() {
  require_cloud
  local number agent builder
  number="$(project_number)"
  [[ "$number" =~ ^[0-9]+$ ]] || die "프로젝트 번호를 읽을 수 없습니다."

  info "Cloud Build 서비스 에이전트 확인"
  cloud beta services identity create \
    --service=cloudbuild.googleapis.com \
    --project="$PROJECT_ID"

  agent="service-${number}@gcp-sa-cloudbuild.iam.gserviceaccount.com"
  cloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${agent}" \
    --role='roles/cloudbuild.serviceAgent' \
    --format=none --quiet

  info "Cloud Build의 기본 빌드 계정 확인"
  builder="$(cloud builds get-default-service-account \
    --region="$REGION" \
    --format='value(serviceAccountEmail)')"
  builder="${builder##*/}"
  [[ "$builder" == *@* ]] ||
    die "기본 빌드 계정을 확인하지 못했습니다. Cloud Build의 기본 서비스 계정 설정을 확인하십시오."
  printf '빌드 계정: %s\n' "$builder"
  cloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${builder}" \
    --role='roles/run.builder' \
    --format=none --quiet

  info "빌드 서비스 계정 권한 설정 완료"
  info "추가로 serviceusage.services.use 오류가 나오면 배포자 본인의 Service Usage Consumer 권한도 확인하십시오."
}

# Forward explicitly supported public deployment settings.
deploy_setting() {
  local key="$1"
  if [[ -v "$key" ]]; then
    printf '%s' "${!key}"
    return
  fi
  [[ -f "$REPO_DIR/.env" ]] || return 0
  python3 - "$key" "$REPO_DIR/.env" <<'PY'
import re
import shlex
import sys

key, path = sys.argv[1:]
assignment = re.compile(r"^\s*(?:export\s+)?" + key + r"\s*=\s*(.*)$")
value = ""
with open(path, encoding="utf-8") as source:
    for line in source:
        match = assignment.match(line)
        if match:
            parts = shlex.split(match[1], comments=True)
            if len(parts) > 1:
                sys.exit(f"Invalid value for {key} in .env")
            value = parts[0] if parts else ""
print(value, end="")
PY
}

deploy() {
  require_cloud
  require_repo
  local -a db_args=()
  local backend db_project database google_client_id signup_mode invite_secret
  local -a settings=()
  backend="$(deploy_setting HAN_GRAPH_DB_BACKEND)"
  case "$backend" in
    firestore)
      db_project="$(deploy_setting GOOGLE_CLOUD_PROJECT)"
      database="$(deploy_setting FIRESTORE_DATABASE_ID)"
      settings+=("HAN_GRAPH_DB_BACKEND=firestore" "GOOGLE_CLOUD_PROJECT=${db_project:-$PROJECT_ID}" "FIRESTORE_DATABASE_ID=${database:-(default)}")
      ;;
    file)
      die "Cloud Run의 계정과 피드백에는 영구 저장소가 필요합니다. HAN_GRAPH_DB_BACKEND=firestore를 지정하세요."
      ;;
    "") ;;
    *) die "Cloud Run 배포에는 HAN_GRAPH_DB_BACKEND=firestore를 지정하세요." ;;
  esac
  signup_mode="$(deploy_setting HAN_GRAPH_SIGNUP_MODE)"
  case "$signup_mode" in
    open|closed|invite) settings+=("HAN_GRAPH_SIGNUP_MODE=$signup_mode") ;;
    "") ;;
    *) die "HAN_GRAPH_SIGNUP_MODE에는 open, invite, closed 중 하나를 지정하세요." ;;
  esac
  invite_secret="$(deploy_setting HAN_GRAPH_BETA_INVITE_SECRET)"
  if [[ -n "$invite_secret" ]]; then
    [[ "$invite_secret" =~ ^[a-zA-Z0-9_-]+:([1-9][0-9]*|latest)$ ]] || die "초대 코드 시크릿을 이름:버전 형식으로 지정하세요."
    db_args+=("--update-secrets=HAN_GRAPH_BETA_INVITE_CODE=$invite_secret")
  fi
  google_client_id="$(deploy_setting HAN_GRAPH_GOOGLE_CLIENT_ID)"
  if [[ -n "$google_client_id" ]]; then
    [[ "$google_client_id" =~ ^[0-9]+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$ ]] || die "Google 웹 클라이언트 ID 형식을 확인하세요."
    settings+=("HAN_GRAPH_GOOGLE_CLIENT_ID=$google_client_id")
  fi
  if (( ${#settings[@]} )); then
    local IFS=,
    db_args+=("--update-env-vars=${settings[*]}")
  fi
  info "Cloud Run 배포: ${PROJECT_ID}/${SERVICE} (${REGION})"
  cloud run deploy "$SERVICE" \
    --source="$REPO_DIR" \
    --region="$REGION" \
    --port="$PORT" \
    --memory="$MEMORY" \
    --cpu="$CPU" \
    --min="$MIN_INSTANCES" \
    --max="$MAX_INSTANCES" \
    --concurrency="$CONCURRENCY" \
    "${db_args[@]}" \
    --cpu-throttling \
    --allow-unauthenticated \
    --args="-data,/app/dataset,-accounts,/app/var/accounts.db,-addr,0.0.0.0:${PORT},-secure-cookies,serve"
  info "배포 완료. URL:"
  url
}

update() {
  require_command git
  require_repo
  git -C "$REPO_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1 ||
    die "Git 저장소가 아닙니다: $REPO_DIR"
  if [[ -n "$(git -C "$REPO_DIR" status --porcelain --untracked-files=no)" ]]; then
    die "Git 추적 파일에 로컬 변경 사항이 있습니다. 충돌 방지를 위해 git pull을 중단했습니다.\ngit -C '$REPO_DIR' status -sb 로 확인하십시오."
  fi
  info "GitHub 코드 업데이트 (fast-forward 전용)"
  git -C "$REPO_DIR" pull --ff-only
}

url() {
  require_cloud
  cloud run services describe "$SERVICE" --region="$REGION" \
    --format='value(status.url)'
}

status() {
  require_cloud
  cloud run services describe "$SERVICE" --region="$REGION" \
    --format='yaml(metadata.name,status.url,status.latestReadyRevisionName,status.traffic)'
}

check() {
  require_command curl
  local service_url path code failed=0
  service_url="$(url)"
  [[ "$service_url" == https://* ]] || die "배포된 서비스 URL을 읽지 못했습니다."
  for path in '/' '/privacy' '/api/stats' '/api/auth/session'; do
    if code="$(curl --silent --show-error --location --max-time 60 \
      --output /dev/null --write-out '%{http_code}' "${service_url}${path}")"; then
      printf '%-13s HTTP %s   %s\n' "$path" "$code" "${service_url}${path}"
      [[ "$code" == 2* ]] || failed=1
    else
      warn "${service_url}${path} 연결 실패"
      failed=1
    fi
  done
  if (( failed != 0 )); then
    warn "HTTP 오류가 있다면 'logs' 명령으로 원인을 확인하십시오."
    return 1
  fi
}

beta_check() {
  require_cloud
  require_command python3
  check
  local service_url settings backend db_project database
  service_url="$(url)"
  curl --fail --silent --show-error --max-time 20 "$service_url/api/auth/session" |
    python3 -c 'import json, sys
s = json.load(sys.stdin)
if s.get("signup_mode") not in ("closed", "invite", "open") or not s.get("privacy_version"):
    sys.exit("공개 리비전에서 베타 가입 설정과 방침 버전을 확인할 수 없습니다.")
print("공개 가입 모드:", s["signup_mode"], "/ 개인정보 처리방침:", s["privacy_version"])'
  settings="$(cloud run services describe "$SERVICE" --region="$REGION" --format=json |
    python3 -c 'import json, sys
env = {e["name"]: e.get("value", "") for e in json.load(sys.stdin)["spec"]["template"]["spec"]["containers"][0].get("env", [])}
print(env.get("HAN_GRAPH_DB_BACKEND", "file"), env.get("GOOGLE_CLOUD_PROJECT") or sys.argv[1], env.get("FIRESTORE_DATABASE_ID") or "(default)")' "$PROJECT_ID")"
  read -r backend db_project database <<< "$settings"
  [[ "$backend" == firestore ]] || die "서비스 템플릿에 Firestore가 설정되지 않았습니다."
  gcloud firestore databases describe --database="$database" --project="$db_project" --format='table(name,locationId,type)'
}

logs() {
  require_cloud
  local n="${1:-50}"
  [[ "$n" =~ ^[0-9]+$ ]] || die "로그 개수에는 양의 정수를 입력하십시오."
  cloud run services logs read "$SERVICE" --region="$REGION" --limit="$n"
}

public() {
  require_cloud
  warn "Google 계정 로그인이 없어도 누구나 서비스에 접근하도록 변경합니다."
  cloud run services update "$SERVICE" --region="$REGION" --no-invoker-iam-check
}

validate_domain() {
  local domain="$1" subdomain
  [[ "$domain" == *.cloud.run ]] || die "사용자 지정 URL은 '<이름>.cloud.run' 형식이어야 합니다."
  subdomain="${domain%.cloud.run}"
  [[ ${#subdomain} -ge 6 && ${#subdomain} -le 63 && "$subdomain" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$ ]] ||
    die "하위 도메인은 6~63자의 영문 소문자·숫자·하이픈이어야 하며 하이픈으로 시작/끝날 수 없습니다."
}

domain_check() {
  require_cloud
  local domain="${1:-han-graph.cloud.run}"
  validate_domain "$domain"
  cloud beta run domain-mappings create \
    --service="$SERVICE" --domain="$domain" --region="$REGION" --dry-run
}

domain_create() {
  require_cloud
  local domain="${1:-han-graph.cloud.run}"
  validate_domain "$domain"
  info "사용자 지정 URL 검사: $domain"
  domain_check "$domain"
  info "사용자 지정 URL 연결: $domain"
  cloud beta run domain-mappings create \
    --service="$SERVICE" --domain="$domain" --region="$REGION"
}

domains() {
  require_cloud
  cloud beta run domain-mappings list --region="$REGION"
}

source_status() {
  require_repo
  info "로컬 경로: $REPO_DIR"
  if command -v git >/dev/null 2>&1; then
    git -C "$REPO_DIR" status --short
  fi
}

main() {
  local cmd="${1:-help}"
  if (( $# > 0 )); then shift; fi
  case "$cmd" in
    help|-h|--help) usage ;;
    project) project_info ;;
    clone) clone_repo ;;
    billing) billing ;;
    setup) setup ;;
    fix-iam) fix_iam ;;
    deploy) deploy ;;
    update) update ;;
    update-deploy) update; deploy ;;
    status) status ;;
    check) check ;;
    beta-check) beta_check ;;
    logs) logs "$@" ;;
    url) url ;;
    public) public ;;
    domain-check) domain_check "$@" ;;
    domain) domain_create "$@" ;;
    domains) domains ;;
    source-status) source_status ;;
    *) warn "알 수 없는 명령: $cmd"; usage >&2; exit 2 ;;
  esac
}

main "$@"
