# 인쇄용 글꼴

단어장 PDF에는 **Noto Sans KR**을 사용합니다. 한국어 글꼴을 앱에서 함께 제공하므로 사용자 기기에 설치된 한자 글꼴에 의존하지 않습니다. 인쇄 전 두 글꼴을 불러오며, 본문과 한자는 보통 굵기로, 단어 제목은 굵게 표시합니다.

- 제작: Adobe · Google
- 원본: [Google Fonts의 Noto Sans KR](https://github.com/google/fonts/tree/b38c5c93af322c45f633e17ac440ec1e6c94d489/ofl/notosanskr)
- 라이선스: [SIL Open Font License 1.1](LICENSE). 이 폴더의 글꼴에는 상위 코드의 MIT 라이선스 대신 이 라이선스가 적용됩니다.
- 제공 파일: Regular(400), SemiBold(600)의 고정 굵기 WOFF2
- 문자 범위: 원본을 줄이지 않았습니다. 각 글꼴은 한글·한자 등을 포함한 23,174개 유니코드 문자에 대응하며, 현재 사전의 고유 한자 2,232자를 모두 포함합니다.

원본 `NotoSansKR[wght].ttf`에서 FontTools 4.65.0의 `instantiateVariableFont`로 굵기를 400과 600에 고정하고, 글꼴 이름도 해당 굵기로 갱신했습니다. 이후 Brotli 1.2.0으로 WOFF2 형식으로 압축했습니다. 고정 굵기를 사용해 PDF 변환 과정에서도 글꼴을 안정적으로 포함하도록 했습니다.

배포 파일의 SHA-256:

- `NotoSansKR-Regular.woff2`: `25a372d8b35b3e2dcb818aca0a69cefb7130abce85561280644a9974f939d1ed`
- `NotoSansKR-SemiBold.woff2`: `75333fb24c0c15fa3bb49ad01eab58bd9038c8cadc8e467a65531fa82707e7c9`
