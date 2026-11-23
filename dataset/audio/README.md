# 한국어 듣기 음원

공개 사전의 한글 표제어와 한국어 예문을 MeloTTS의 한국어 화자 KR로 미리 합성합니다. 한국어 원문이 같으면 하나의 MP3를 공유합니다. 예문의 괄호 속 한자는 생략하고 숫자와 분수는 한글로 풀어 읽습니다. MP3는 모노, 24 kHz, 40 kbit/s입니다.

음원은 HAN-GRAPH 학습용 원문을 합성한 자료이며 원문의 [데이터 라이선스](../LICENSE)를 따릅니다. 원문 목록의 출처는 [데이터 출처](../sources/README.md)에 있습니다. 합성에는 MyShell.ai의 MIT 라이선스 [MeloTTS](https://github.com/myshell-ai/MeloTTS/tree/209145371cff8fc3bd60d7be902ea69cbdb7965a), [한국어 음성 모델](https://huggingface.co/myshell-ai/MeloTTS-Korean/tree/0207e5adfc90129a51b6b03d89be6d84360ed323), 모델이 사용하는 [한국어 BERT](https://huggingface.co/kykim/bert-kor-base/tree/1779cc0982ada0216dd6de0dd4e86fb78201926d)를 사용합니다. 배포 이미지에는 학습 음원만 포함합니다.

## 생성과 검증

저장소 루트에서 실행합니다. Linux의 systemd 사용자 서비스와 cgroup v2, Bash, Git, curl, util-linux, Python 3, uv가 필요합니다. 처음 실행하면 생성 도구와 모델을 `.audio-build/`에 받습니다.

```sh
bash scripts/korean-audio.sh                 # 전체 생성 또는 이어서 생성
bash scripts/korean-audio.sh --background    # 터미널을 닫아도 같은 제한 안에서 계속 생성
HAN_AUDIO_CPUS=2 bash scripts/korean-audio.sh --background  # 최대 2코어로 생성
bash scripts/korean-audio.sh --batch 5       # 51–60번째 항목 생성
bash scripts/korean-audio.sh --check         # 전체 원문과 대조하고 모든 MP3 디코딩
bash scripts/korean-audio.sh --check --batch 5
```

합성기는 한 번에 하나만 실행하며 CPU를 기본 최대 8코어까지 사용합니다. 실행 시 환경 변수 `HAN_AUDIO_CPUS`를 1부터 8까지 지정하면 상한을 낮출 수 있습니다. 사용 가능한 코어 수와 서비스 한도에 맞춰 합성 스레드 수도 조정합니다. 열 항목을 처리한 합성기는 종료해 메모리를 반환하고 다음 묶음으로 넘어갑니다. 메모리는 3 GiB에서 회수를 시작하고 4 GiB에서 제한하며 스왑은 0입니다. 합성기와 설치 프로그램에는 일반 작업보다 낮은 우선순위가 적용됩니다. 현재 사용량은 `systemctl --user status han-graph-korean-audio`로 확인하고, `systemctl --user stop han-graph-korean-audio`로 중지할 수 있습니다. 다음 실행은 이미 저장한 MP3와 검증된 묶음을 재사용합니다.

`word.jsonl` 순서로 열 항목씩 묶고 마지막 묶음에는 남은 항목을 넣습니다. 한 묶음에 처음 등장하는 원문의 UTF-8 SHA-256이 MP3 이름입니다. 모든 MP3의 원문 키, 디코딩, 길이, 채널, 샘플레이트, 신호를 확인한 뒤 `ko/00000.zip` 등의 이름으로 게시합니다. 서버는 시작할 때 게시된 묶음의 색인을 읽습니다. 웹에서는 듣기를 눌렀을 때 해당 MP3 구간만 전송합니다.
