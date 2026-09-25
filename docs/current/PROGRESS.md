> 버전: v0.4 · 작성일: 2026-09-25

# PROGRESS — workbench-kit v0.4

## 1. 계획된 작업

- **Phase 1 — 렌더링 파이프라인** (2026-09-25)
  - 무엇을 했나: `src/core/markdown/`에 markdown-it·DOMPurify 렌더러와 `rendered` 탭을 등록했다. 테이블 CSS와 공통부 정적 검사 예외를 좁게 추가했다.
  - 결과: `.md`를 직접 rendered 모드로 열 수 있다. 원문 HTML은 정화 후 렌더링하며, 스크립트·이벤트 속성·위험한 링크·폼 탐색을 차단한다.
  - 검증: Electron·pywebview 전용 검사에서 제목·목록·실측 테이블·툴팁·정화·스크립트 미실행 통과. `npm run typecheck`, `npm run build`, `verify:phase3`, `verify:dist`, `verify:text-open` 통과. `verify:open-modes`는 첫 실행에서 터미널 타이밍 2건 실패 후 재실행 통과. 세션 내 리뷰 및 반대 벤더 3회 검토는 `docs/reviews/A30.md`에 기록.
  - 특이사항: `npm test`는 기존 v0.1 Phase 4 계열 7건에서 중단됐다. Phase 1 변경의 직접 회귀는 확인되지 않았다.

- **Phase 2 — 토글과 열기 규칙** (2026-09-25)
  - 무엇을 했나: 마크다운 렌더링 전역 토글과 SVG 두 상태를 Activity Bar의 File Filter 아래에 추가했다. `.md`의 탐색기 클릭·Enter·F3·F4와 열린 탭 모드 전환을 연결했다.
  - 결과: 처음에는 꺼짐, 재시작 후 상태 복원, 기본 Editor 모드보다 토글 우선, 비 `.md` 파일 독립, 기존 열린 탭 유지. 편집 중 같은 파일을 다시 선택하거나 F3/F4를 사용해도 원문과 dirty 상태가 유지된다.
  - 검증: Electron·pywebview 전용 검사에서 두 아이콘의 세 테마 실측 색, 위치·라벨, 클릭·Enter·F3·F4, 토글 꺼짐, 기본 모드, 비 `.md`, 편집 중 탭, 재시작을 확인. `typecheck`, `build`, `verify:dist`, `verify:phase3`, `verify:open-modes`, `verify:text-open` 통과. 세션 내 리뷰 및 반대 벤더 3회 결과는 `docs/reviews/A31.md`에 기록.
  - 특이사항: 마지막 반대 벤더 회차 뒤 수정한 같은 파일 재클릭 경로는 3회 한도 때문에 벤더 재검증 없이 두 호스트 재현 검사로 확인했다. 미해결 Critical은 없다.

- **Phase 3 — 수식과 코드 강조** (2026-09-25)
  - 무엇을 했나: VS Code 계열 markdown-it KaTeX 구문 분석, KaTeX HTML·번들 CSS·글꼴, highlight.js 코드 블록과 세 테마 토큰색을 추가했다. 원문 정화 뒤 생성된 수식만 별도로 정화해 넣는다.
  - 결과: 인라인·블록 수식과 코드 토큰색이 두 호스트에서 표시된다. Phase 4 이미지 경로 이전의 원격 자원 태그를 차단했다.
  - 검증: Electron·pywebview에서 실측 수식 크기·글꼴·CSS, 세 테마 본문 대비 코드색, 악성 수식·코드·원격 이미지 미실행을 확인. `typecheck`, `build`, `verify:phase3`, `verify:dist`, `verify:open-modes`, `verify:text-open` 통과. 리뷰는 `docs/reviews/A32.md`.

- **Phase 4 — 이미지·링크·저장 갱신** (2026-09-25)
  - 무엇을 했나: CSP에 `img-src 'self' blob:`을 추가하고, 두 호스트에 폴더 경계를 검사하는 이미지 읽기와 `http(s)` 외부 열기 브릿지를 연결했다. 상대 파일 링크·앵커와 저장 후 열린 rendered 탭 갱신을 구현했다. 앱 페이지 밖 탐색을 호스트에서 차단했다.
  - 결과: 상대 PNG는 `blob:`으로 보이고 원격 이미지는 로드되지 않는다. 상대 `.md` 링크는 토글 규칙을 따르며, 외부 링크와 문서 앵커가 동작한다. editor 저장 전에는 rendered가 그대로이고 저장 후 갱신된다.
  - 검증: Electron·pywebview 화면 검사, 실제 Electron 호스트 브릿지 검사, Python 3.11.8·pywebview 6.2.1 pywebview 검사 통과. `typecheck`, `build`, `verify:dist`, `verify:phase3`, `verify:open-modes`, `verify:text-open` 통과. 리뷰는 `docs/reviews/A33.md`.
  - 특이사항: `npm test`는 이전부터 알려진 v0.1 Phase 4 단언 7건 실패로 중단된다. Claude CLI 2회차는 HTTP 429 한도로 거절됐으며 1회차 유효 검토의 Critical은 없었다.

## 2. 계획 외 개선
