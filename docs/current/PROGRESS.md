> 버전: v0.4 · 작성일: 2026-09-25

# PROGRESS — workbench-kit v0.4

## 1. 계획된 작업

- **Phase 1 — 렌더링 파이프라인** (2026-09-25)
  - 무엇을 했나: `src/core/markdown/`에 markdown-it·DOMPurify 렌더러와 `rendered` 탭을 등록했다. 테이블 CSS와 공통부 정적 검사 예외를 좁게 추가했다.
  - 결과: `.md`를 직접 rendered 모드로 열 수 있다. 원문 HTML은 정화 후 렌더링하며, 스크립트·이벤트 속성·위험한 링크·폼 탐색을 차단한다.
  - 검증: Electron·pywebview 전용 검사에서 제목·목록·실측 테이블·툴팁·정화·스크립트 미실행 통과. `npm run typecheck`, `npm run build`, `verify:phase3`, `verify:dist`, `verify:text-open` 통과. `verify:open-modes`는 첫 실행에서 터미널 타이밍 2건 실패 후 재실행 통과. 세션 내 리뷰 및 반대 벤더 3회 검토는 `docs/reviews/A30.md`에 기록.
  - 특이사항: `npm test`는 기존 v0.1 Phase 4 계열 7건에서 중단됐다. Phase 1 변경의 직접 회귀는 확인되지 않았다.

## 2. 계획 외 개선
