# EPUBtoPDF

EPUB 전자책을 원하는 조판 설정(용지 크기, 여백, 글꼴, 글자 크기, 줄 간격, 쪽당 줄 수 등)으로
PDF로 변환하는 Windows 11용 데스크톱 앱입니다. 변환 결과를 앱 안에서 바로 미리 볼 수 있습니다.

> 개발 진행 중입니다. 현재는 2단계(설정 모델·조판 계산·CSS 생성)까지 완료되었습니다.

## 개발 환경

- Node.js 22.12 이상
- Windows 11 (Linux/macOS에서도 개발은 가능하며, Windows 설치 파일은 GitHub Actions에서 빌드)

```bash
npm ci            # 의존성 설치 (package-lock.json 기준)
npm run dev       # 개발 모드로 실행 (핫 리로드)
npm run typecheck # 타입 검사
npm test          # 단위 테스트
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

## 구조

```
src/
  main/      Electron 메인 프로세스 (EPUB 파싱, PDF 생성)
  preload/   렌더러에 안전하게 API를 노출하는 브리지
  renderer/  React UI (설정 패널, 미리보기)
  shared/    양쪽에서 함께 쓰는 타입과 로직
tests/       vitest 단위 테스트
```
