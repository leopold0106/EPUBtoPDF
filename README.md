# EPUBtoPDF

EPUB 전자책을 원하는 조판 설정(용지 크기, 여백, 글꼴, 글자 크기, 줄 간격, 쪽당 줄 수 등)으로
PDF로 변환하는 Windows 11용 데스크톱 앱입니다. 변환 결과를 앱 안에서 바로 미리 볼 수 있습니다.

> 개발 진행 중입니다. 설정 화면, 미리보기, 그림 빼기, 줄 격자 맞춤까지 동작합니다.

## 개발 환경

- Node.js 22.12 이상
- Windows 11 (Linux/macOS에서도 개발은 가능하며, Windows 설치 파일은 GitHub Actions에서 빌드)

```bash
npm ci            # 의존성 설치 (package-lock.json 기준)
npm run dev       # 개발 모드로 실행 (핫 리로드)
npm run typecheck # 타입 검사
npm test          # 단위 테스트
npm run test:e2e  # 앱을 빌드해 샘플 EPUB을 실제로 PDF로 변환하는 테스트 (Linux: xvfb-run -a npm run test:e2e)
npm run sample    # 시험용 샘플 EPUB 만들기 (samples/강가의-기록.epub)
```

## Windows 설치 파일 만들기

```bash
npm run build:win
```

`dist/` 폴더에 다음 두 파일이 생성됩니다.

- `EPUBtoPDF-Setup-<버전>.exe` — 설치형
- `EPUBtoPDF-Portable-<버전>.exe` — 설치 없이 바로 실행

`main` 브랜치에 푸시하면 GitHub Actions가 Windows 설치 파일을 빌드해 Actions 아티팩트로 올리고,
`v*` 태그를 푸시하면 Release에도 첨부합니다.

코드 서명을 하지 않았기 때문에 처음 실행할 때 Windows SmartScreen 경고가 뜰 수 있습니다.
"추가 정보 → 실행"을 누르면 실행됩니다.

## 명령줄 변환

창을 띄우지 않고 변환할 수도 있습니다. 설정 파일은 앱 설정과 같은 JSON 형식이며, 빠진 항목은 기본값을 씁니다.
편집 파일로 뺄 그림을 정할 수 있습니다 (예: `{"hiddenImages": ["0:0"]}` — `장 위치:장 안의 그림 순서`, 0부터).

```bash
EPUBtoPDF --convert 책.epub [--out 책.pdf] [--settings 설정.json] [--edits 편집.json]
# 개발 중에는: npx electron . --convert 책.epub
```

## 구조

```
src/
  main/      Electron 메인 프로세스 (EPUB 파싱, PDF 생성, 명령줄 변환)
  preload/   앱 창과 렌더링 창의 preload
  render/    렌더링 창 안에서 장 문서들을 하나의 문서로 조립하는 코드
  renderer/  React UI (설정 패널, 미리보기)
  shared/    양쪽에서 함께 쓰는 타입과 로직
tests/       vitest 단위 테스트 (fixtures/: 테스트용 EPUB 생성기, e2e/: 실제 변환 테스트)
scripts/     개발용 스크립트
```
