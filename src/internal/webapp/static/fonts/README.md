# 화면 및 인쇄용 글꼴

글꼴 열 파일을 저작권 고지 및 SIL Open Font License 1.1 전문과 함께 소스에 포함합니다. Go 빌드가 글꼴을 실행 파일에 내장하므로 로컬 실행, Docker Compose, Cloud Run에서 같은 파일을 제공합니다. 저장소 루트에서 `bash han-graph-cloudrun.sh fonts`를 실행하면 라이선스 파일의 존재와 각 글꼴의 SHA-256을 확인할 수 있습니다. [글꼴 라이선스](LICENSE) · [체크섬 목록](SHA256SUMS)

| 용도 | 글꼴 | 배포 형식과 굵기 |
| --- | --- | --- |
| 한국어 단어·한자와 단어장 인쇄 | Noto Sans KR | WOFF2, Regular 400 · SemiBold 600 |
| 중국어 간체 UI와 뜻풀이 | Noto Sans SC | WOFF2, Regular 400 · Bold 700 |
| 일본어 UI와 뜻풀이 | Noto Sans JP | WOFF2, Regular 400 · Bold 700 |
| 라틴·키릴 문자. 베트남어 성조, 우즈베크어 표기, 키르기스어·몽골어 확장 키릴 문자 포함 | Noto Sans | WOFF2, Regular 400 · Bold 700 |
| 네팔어 데바나가리 문자 | Noto Sans Devanagari | TTF, Regular 400 |
| 태국 문자 | Noto Sans Thai | TTF, Regular 400 |

중국어·일본어는 화면과 단어장 PDF에서 언어에 맞는 한자 자형을 사용합니다. 한국어 학습 단어와 그 한자 표기는 한국어로 표시합니다. 네팔어와 태국어는 해당 문자가 표시될 때 기기에 같은 글꼴이 없으면 앱의 TTF를 불러옵니다.

## 원본과 변환

- **Noto Sans KR**은 Adobe와 Google이 제작한 `NotoSansKR[wght].ttf`에서 FontTools 4.65.0의 `instantiateVariableFont`로 400·600 굵기를 추출하고 글꼴 이름을 해당 굵기로 갱신했습니다. 각 파일에는 원본의 유니코드 문자 23,174개가 들어 있습니다. [Google Fonts 원본](https://github.com/google/fonts/tree/b38c5c93af322c45f633e17ac440ec1e6c94d489/ofl/notosanskr)
- **Noto Sans SC와 JP**는 Noto CJK 2.004 릴리스의 지역별 `NotoSansSC-VF.ttf`와 `NotoSansJP-VF.ttf`에서 고정 굵기 400·700을 추출했습니다. 원본의 문자 범위는 유지했습니다. 고정 굵기를 사용하면 브라우저에서 만든 PDF에도 글꼴을 TrueType으로 내장할 수 있습니다. [지역별 원본](https://github.com/notofonts/noto-cjk/tree/Sans2.004/Sans/Variable/TTF/Subset) · [원본 라이선스](https://github.com/notofonts/noto-cjk/blob/Sans2.004/LICENSE)
- **Noto Sans 2.004**, **Noto Sans Devanagari 2.001**, **Noto Sans Thai 2.000**은 `fonts-noto-core` 20201225-2에서 가져왔습니다. Noto Sans의 Regular와 Bold는 WOFF2로 압축했고, 데바나가리와 태국어는 패키지의 원본 TTF를 사용합니다. [Noto 프로젝트](https://github.com/notofonts/noto-fonts) · [원본 라이선스](https://github.com/notofonts/noto-fonts/blob/main/LICENSE)

모든 WOFF2는 FontTools 4.65.0과 Brotli 1.2.0으로 압축했습니다. 변환 도구는 앱 빌드나 배포에 필요하지 않습니다.
