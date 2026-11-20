#!/usr/bin/env bash
# HAN-Graph: Google Cloud Run 운영 명령 모음
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

FONT_DIR="$REPO_DIR/src/internal/webapp/static/fonts"
SOURCE_GO="$REPO_DIR/src/internal/webapp/server.go"
FONT_REGULAR="$FONT_DIR/NotoSansKR-Regular.woff2"
FONT_SEMIBOLD="$FONT_DIR/NotoSansKR-SemiBold.woff2"
FONT_LICENSE="$FONT_DIR/LICENSE"

info() { printf '\n[INFO] %s\n' "$*"; }
warn() { printf '\n[WARN] %s\n' "$*" >&2; }
die()  { printf '\n[ERROR] %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'HELP'
HAN-Graph / Google Cloud Run 관리 스크립트

사용법:
  bash han-graph-cloudrun.sh <명령> [옵션]

자주 사용하는 명령:
  deploy                 소스 빌드 및 Cloud Run 배포 (폰트 누락 시 설치)
  update                 GitHub 최신 소스 가져오기 (추적 파일 수정 시 중단)
  update-deploy          소스 업데이트 후 배포
  status                 Cloud Run 서비스 정보 및 주소 확인
  check                  홈페이지와 /api/stats의 HTTP 응답 검사
  logs [개수]            Cloud Run 최근 로그 조회 (기본 50개)
  url                    기본 Cloud Run 서비스 주소 출력
  fonts                  누락된 Noto Sans KR WOFF2 / LICENSE 설치

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
  source-status          Git 작업 폴더와 폰트 파일 상태 확인
  help                   이 도움말 출력

현재 설정 (환경 변수로 변경 가능):
  PROJECT_ID=han-graph          SERVICE=han-graph
  REGION=asia-northeast3        PORT=18080
  MEMORY=1Gi                   CPU=1
  MIN_INSTANCES=0              MAX_INSTANCES=1
  CONCURRENCY=20               HAN_GRAPH_DIR=~/han-graph
  HAN_GRAPH_GOOGLE_CLIENT_ID=Google 웹 클라이언트 ID (생략 시 서비스의 설정 유지)
  HAN_GRAPH_DB_BACKEND=file 또는 firestore (생략 시 서비스의 설정 유지)
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
  4) GitHub 원본의 정적 폰트 파일이 누락되면 fonts 명령으로 생성합니다.
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
    die "대상 경로가 이미 존재하지만 HAN-Graph 저장소가 아닙니다: $REPO_DIR"
  fi
  info "HAN-Graph 저장소 다운로드: $REPO_DIR"
  git clone 'https://github.com/elecbug/han-graph.git' "$REPO_DIR"
}

require_repo() {
  [[ -f "$REPO_DIR/Dockerfile" && -d "$REPO_DIR/src" && -d "$REPO_DIR/dataset" ]] ||
    die "HAN-Graph 저장소를 찾지 못했습니다: $REPO_DIR\n먼저 git clone https://github.com/elecbug/han-graph.git 를 실행하거나 HAN_GRAPH_DIR을 지정하십시오."
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

fonts() {
  require_repo
  require_command curl
  require_command python3
  mkdir -p "$FONT_DIR"

  if [[ -s "$FONT_REGULAR" && -s "$FONT_SEMIBOLD" ]]; then
    info "두 WOFF2 폰트가 이미 존재합니다. 변환을 생략합니다."
  else
    info "Google Fonts 공식 Noto Sans KR 폰트를 내려받아 WOFF2로 변환합니다."
    local tmpdir
    tmpdir="$(mktemp -d)"
    # 함수 종료 또는 오류 시 임시 파일 삭제
    trap 'rm -rf -- "$tmpdir"' RETURN

    curl --fail --location --retry 3 --silent --show-error \
      'https://raw.githubusercontent.com/google/fonts/main/ofl/notosanskr/NotoSansKR%5Bwght%5D.ttf' \
      --output "$tmpdir/NotoSansKR-variable.ttf"
    [[ -s "$tmpdir/NotoSansKR-variable.ttf" ]] || die "원본 폰트 다운로드에 실패했습니다."

    python3 -m venv "$tmpdir/venv" ||
      die "Python 가상환경을 만들 수 없습니다. Cloud Shell의 python3-venv 설치 여부를 확인하십시오."
    "$tmpdir/venv/bin/python" -m pip install --quiet 'fonttools[woff]'

    FONT_INPUT="$tmpdir/NotoSansKR-variable.ttf" FONT_DEST="$FONT_DIR" \
      "$tmpdir/venv/bin/python" - <<'PY'
import os
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

src = os.environ['FONT_INPUT']
out = Path(os.environ['FONT_DEST'])
for name, weight in [('Regular', 400), ('SemiBold', 600)]:
    dst = out / f'NotoSansKR-{name}.woff2'
    if dst.is_file() and dst.stat().st_size > 0:
        print(f'SKIP {dst}')
        continue
    font = TTFont(src)
    font = instantiateVariableFont(font, {'wght': weight}, updateFontNames=True)
    font.flavor = 'woff2'
    font.save(dst)
    check = TTFont(dst)
    check.close()
    font.close()
    print(f'OK   {dst} ({dst.stat().st_size:,} bytes)')
PY
    rm -rf -- "$tmpdir"
    trap - RETURN
  fi

  if [[ ! -s "$FONT_LICENSE" ]]; then
    info "OFL 라이선스 다운로드"
    curl --fail --location --retry 3 --silent --show-error \
      'https://raw.githubusercontent.com/google/fonts/main/ofl/notosanskr/OFL.txt' \
      --output "$FONT_LICENSE"
  fi

  [[ -s "$FONT_REGULAR" && -s "$FONT_SEMIBOLD" && -s "$FONT_LICENSE" ]] ||
    die "필요한 폰트 또는 라이선스 파일이 누락되었습니다."

  ls -lh "$FONT_REGULAR" "$FONT_SEMIBOLD" "$FONT_LICENSE"

  if [[ -f "$SOURCE_GO" ]] && ! grep -Fq '"/fonts/NotoSansKR-Regular.woff2"' "$SOURCE_GO"; then
    warn "server.go에서 폰트 URL 참조가 보이지 않습니다. 과거 sed 명령으로 삭제했다면 해당 변경을 수동 복원하십시오."
    warn "git diff -- src/internal/webapp/server.go 로 수정 내역을 확인하십시오."
  fi
  info "폰트 준비 완료"
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
  fonts
  local -a db_args=()
  local backend db_project database google_client_id
  local -a settings=()
  backend="$(deploy_setting HAN_GRAPH_DB_BACKEND)"
  case "$backend" in
    firestore)
      db_project="$(deploy_setting GOOGLE_CLOUD_PROJECT)"
      database="$(deploy_setting FIRESTORE_DATABASE_ID)"
      settings+=("HAN_GRAPH_DB_BACKEND=firestore" "GOOGLE_CLOUD_PROJECT=${db_project:-$PROJECT_ID}" "FIRESTORE_DATABASE_ID=${database:-(default)}")
      ;;
    file)
      settings+=("HAN_GRAPH_DB_BACKEND=file")
      warn "Cloud Run 인스턴스의 파일 DB는 재배포 시 사라질 수 있습니다."
      ;;
    "") ;;
    *) die "HAN_GRAPH_DB_BACKEND에는 file 또는 firestore를 지정하세요." ;;
  esac
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
  for path in '/' '/api/stats'; do
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
  if [[ -d "$FONT_DIR" ]]; then
    ls -lh "$FONT_DIR" || true
  else
    warn "아직 폰트 디렉터리가 없습니다."
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
    fonts) fonts ;;
    deploy) deploy ;;
    update) update ;;
    update-deploy) update; deploy ;;
    status) status ;;
    check) check ;;
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
