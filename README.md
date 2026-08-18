# 이슈 대응·성과 보고서 초안 생성기

키워드, 기사 본문, 문서 양식을 바탕으로 이슈 대응 보고서 초안을 만드는 웹 애플리케이션입니다.

## 주요 기능

- OpenAI Web Search 및 Gemini Google Search 연동
- HWP/HWPX/DOCX/PDF/XLS/XLSX 양식 분석
- 업로드 양식의 제목·항목·문단 순서 반영
- OpenAI·Gemini 결과 분리 및 통합 보기
- 출처 인용과 URL 정리
- DOCX·HWPX 다운로드
- API 키의 브라우저 세션 저장

## 실행

```bash
pnpm install
pnpm dev
```

브라우저에서 `http://127.0.0.1:5173/`을 엽니다.

## 환경변수와 API 키

`.env.example`을 참고할 수 있습니다. 실제 OpenAI·Gemini API 키는 파일이나 환경변수에 저장하지 않고 웹 화면에서 입력합니다. 입력한 키는 현재 브라우저 세션에서만 사용됩니다.

## 빌드

```bash
pnpm run build
```

## 구조

- `src/`: React 화면과 브라우저 API 클라이언트
- `server/api/search.mjs`: OpenAI·Gemini 검색 Route Handler
- `server/api/template.mjs`: kordoc 문서 양식 분석 Route Handler
- `server/api/export.mjs`: DOCX·HWPX 생성 Route Handler
- `server/index.mjs`: Node.js 서버 및 Vite 개발 서버
