# 133건 전건 대조 — FR ↔ 단언 매트릭스

> 작성: Phase 7 (WK-041) · FR-H1 · NFR-5의 완료 조건을 충족하는 정식 문서.
> `docs/current/SPEC.md` 1절의 133건 각각을 실제로 판정하는 단언(assertion)과
> 짝짓는다. 두 갈래(Electron·pywebview)에서 결과가 다른 항목이 0개임은
> `scripts/verify-phase{2~7}.mjs`가 매 Phase마다 "Zero divergence" 오케스트레이션
> 단언으로 확인한다(`docs/checklist.md` §1의 분류 규칙 참고).

## 읽는 법

- `scripts/phase{n}-suite.js:ID` — 실제 브라우저(Electron·pywebview 둘 다)에서
  키보드·마우스 조작을 재현해 낸 **사용자 행동 검사** 단언.
- `scripts/verify-phase{n}.mjs:(assert)` — 그 검증 스크립트가 Node 프로세스
  안에서 직접 내는 단언. **`verify-phase3.mjs`의 경우 이 표시는 전부 4절
  (Mock DOM Environment)의 실제 키보드/마우스 시뮬레이션에서 나온 것이다** — 그
  절만 사용자 행동 검사이고, 같은 파일의 1~3·5~7절(정적 검사)은 이 FR들의
  판정에 쓰이지 않는다. 그 밖의 `verify-phase{n}.mjs:(assert)`는 아래 "예외"
  항목(그 FR 자신의 판정 방법이 코드 구조 확인인 경우)에 한해서만 등장한다.
- 코드가 아닌 설명 — 그 FR의 판정 방법 자체가 소스 대조·문서 존재처럼 사용자
  행동이 아닌 것이거나(FR-H1·H2·M5·Q3 등), 이 Phase 7의 새 문서 자체가 그
  결과물인 것(FR-R2·R3)이다. `docs/checklist.md` §3의 "예외" 항목을 본다.

## 매트릭스

| FR | 판정하는 단언 (파일:ID) |
| --- | --- |
| FR-A1 | `scripts/phase7-suite.js:P7-FR-A1`(round-2: 실제 File > 폴더 열기 메뉴 클릭 → `handleOpenFolderDialog()` → `promptOpenFolderDialog()` → 호스트 브리지 → IPC의 전 경로가 실제로 실행됨. 네이티브 OS 선택창의 반환값만 스텁하고(FR-N2·N3와 같은 종류의 한계), P를 연 뒤 Q를 열어 P가 트리에서 완전히 사라짐을 확인) |
| FR-A2 | `scripts/phase7-suite.js:P7-FR-A2`(실호스트, 실제 ArrowDown/ArrowUp) |
| FR-A3 | `scripts/phase7-suite.js:P7-FR-A3`(실호스트, 실제 ArrowRight) |
| FR-A4 | `scripts/phase7-suite.js:P7-FR-A4`(실호스트, 실제 ArrowLeft) |
| FR-A5 | `scripts/phase7-suite.js:P7-FR-A5`(실호스트, 실제 Space) |
| FR-A6 | `scripts/phase4-suite.js:P4-FR-A6` |
| FR-A7 | `scripts/phase7-suite.js:P7-FR-A7` |
| FR-A8 | `scripts/phase7-suite.js:P7-FR-A8`(실호스트, 실제 Home/End) |
| FR-A9 | `scripts/phase7-suite.js:P7-FR-A9`(실호스트, 실제 Shift+ArrowDown) |
| FR-A10 | `scripts/phase7-suite.js:P7-FR-A10`(실호스트, 실제 Ctrl+A) |
| FR-A11 | `scripts/phase7-suite.js:P7-FR-A11`(실호스트, 실제 Ctrl+클릭·Shift+클릭) |
| FR-A12 | `scripts/phase7-suite.js:P7-FR-A12`(실호스트, 실제 Escape) |
| FR-A13 | `scripts/phase7-suite.js:P7-FR-A13` |
| FR-A14 | `scripts/phase4-suite.js:P4-FR-A14-SPLIT` · `P4-FR-A14-CONTENT` · `P4-FR-A14-2D-COUNT` · `P4-FR-A14-2D-TARGET` · `P4-FR-A14-DUP` · `scripts/phase5-suite.js:P5-FR-I4` |
| FR-A15 | `scripts/phase7-suite.js:P7-FR-A15`(round-2: 실호스트로 승격 — 실제 렌더된 DOM에 "상위로" 수단이 0개이고, 실제 ArrowUp·ArrowLeft·Home 키보드 조작이 `tree.getRoot()`를 바꾸지 않음을 확인) |
| FR-A16 | `scripts/phase7-suite.js:P7-FR-A16`(실호스트, 실제 PageDown/PageUp — 뿌리 항목 5개뿐이라 끝 항목으로 고정되는 경계만 증명, 진짜 여러 페이지 스크롤은 이 환경에서 강제 불가) |
| FR-A17 | `scripts/phase7-suite.js:P7-FR-A17`(실호스트, 실제 Ctrl+ArrowDown — 포커스 불변만 증명, 스크롤 위치 자체는 항목 5개뿐이라 스크롤이 필요 없어 검증 불가) |
| FR-A18 | `scripts/phase7-suite.js:P7-FR-A18` |
| FR-A19 | `scripts/phase7-suite.js:P7-FR-A19`(실호스트, 실제 Ctrl+Alt+F) |
| FR-A20 | `scripts/phase7-suite.js:P7-FR-A20`(실호스트, 실제 뷰 제목줄 DOM 확인) |
| FR-A21 | `scripts/phase7-suite.js:P7-FR-A21`(실호스트, 실제 Collapse All 버튼 클릭) · `P7-FR-A7`(같은 결과를 Ctrl+←로도 확인) |
| FR-A22 | `scripts/phase7-suite.js:P7-FR-A22-STATE`(실호스트, 실제 Refresh 버튼 클릭 — 펼침·선택 유지 확인) · `P7-FR-A22-NEWROW`(round-2: 러너가 디스크에 실제로 새 파일을 떨어뜨린 뒤 Refresh가 그 새 행을 실제로 집어옴을 확인) |
| FR-A23 | `scripts/phase7-suite.js:P7-FR-A23-OPEN` · `P7-FR-A23-COMMIT` · `P7-FR-A23-CANCEL`(실호스트, 실제로 등록한 앱 액션 버튼을 클릭 — 기본 셸은 이 트리거를 렌더링하지 않으므로(INTENT 7) 시험이 데모 앱 액션 하나를 등록해 실제 클릭으로 연다) |
| FR-A24 | `scripts/phase7-suite.js:P7-FR-A20`(WK-048의 데모 배선이 이미 앱 액션 1개를 등록해 두므로 "앱 미등록" 상태 자체는 실호스트에서 재현 불가 — 대신 앱 액션이 존재해도 껍데기 액션 2개가 `:not(.app-action-btn)`로 항상 구분되어 정확히 2개임을 확인하는 더 좁은 형태로 판정) |
| FR-B1 | `scripts/phase4-suite.js:P4-FR-B1` |
| FR-B2 | `scripts/phase4-suite.js:P4-FR-B2` · `P4-FR-A14-DUP` |
| FR-B3 | **v0.2에서 대체됨** — `docs/current/SPEC.md` 0.1절. 후속 판정은 `scripts/v02-phase1-suite.js:V2P1-FR-P8` |
| FR-B4 | `scripts/phase4-suite.js:P4-FR-B4` |
| FR-C1 | `scripts/verify-phase4.mjs:(assert)`(구조 확인) · `scripts/phase4-suite.js:P4-D13-D15` · `P4-FR-C1` · `P4-FR-C1-ACTIVE` |
| FR-C2 | `scripts/phase4-suite.js:P4-FR-C2` |
| FR-C3 | `scripts/phase4-suite.js:P4-FR-C3` |
| FR-C4 | `scripts/verify-phase4.mjs:(assert)`(구조 확인) · `scripts/phase4-suite.js:P4-FR-J1` · `P4-FR-J7-COUNT` |
| FR-C5 | `scripts/phase4-suite.js:P4-FR-C5-DRAGGABLE` · `P4-FR-C5` |
| FR-C6 | `scripts/phase4-suite.js:P4-FR-E2-INSTANCE` · `P4-FR-C6` |
| FR-C7 | `scripts/phase4-suite.js:P4-FR-C7` |
| FR-C8 | `scripts/verify-phase4.mjs:(assert)`(구조 확인) · `scripts/phase4-suite.js:P4-FR-C8` |
| FR-C9 | `scripts/phase4-suite.js:P4-FR-C9` |
| FR-D1 | `scripts/verify-phase4.mjs:(assert)`(구조 확인) · `scripts/phase4-suite.js:P4-FR-D1` |
| FR-D2 | `scripts/verify-phase4.mjs:(assert)`(구조 확인) · `scripts/phase4-suite.js:P4-FR-D2` |
| FR-D3 | `scripts/phase4-suite.js:P4-FR-D3-ACTBAR` · `P4-FR-D3-MENU` |
| FR-D4 | `scripts/phase4-suite.js:P4-FR-D4-SASH` · `P4-FR-D4-RESIZE` |
| FR-D5 | `scripts/phase4-suite.js:P4-FR-D5-HEADER` |
| FR-D6 | `scripts/phase4-suite.js:P4-FR-D6` |
| FR-D7 | `scripts/phase4-suite.js:P4-FR-D7` |
| FR-D8 | `scripts/verify-phase4.mjs:(assert)`(구조 확인) · `scripts/phase4-suite.js:P4-FR-D8-MENU` · `P4-FR-D8-ACTBAR` |
| FR-E1 | `scripts/phase4-suite.js:P4-FR-E1-INSTANCE` · `P4-FR-E1-CREATION` · `P4-FR-E1-DISPOSAL` · `P4-FR-E1-DOM-STATE` |
| FR-E2 | `scripts/phase4-suite.js:P4-FR-E2-INSTANCE` · `P4-FR-E2-CREATION` · `P4-FR-E2-TIMER` · `P4-FR-E2-DOM-STATE` |
| FR-E3 | `scripts/phase4-suite.js:P4-FR-E3` · `P4-MEM-CLEANUP` |
| FR-E4 | `scripts/phase4-suite.js:P4-FR-E4` |
| FR-E5 | `scripts/phase4-suite.js:P4-FR-E5` · `P4-FR-E5-TIMER` · `P4-FR-E5-ISOLATION` |
| FR-F1 | `scripts/phase7-suite.js:P7-FR-F1` |
| FR-F2 | `scripts/phase7-suite.js:P7-FR-F2` |
| FR-F3 | `scripts/phase7-suite.js:P7-FR-F3` |
| FR-F4 | `scripts/phase7-suite.js:P7-FR-F4` |
| FR-F5 | `scripts/phase7-suite.js:P7-FR-F5` |
| FR-F6 | `scripts/phase7-suite.js:P7-FR-F6` |
| FR-F7 | `scripts/phase7-suite.js:P7-FR-F7` |
| FR-G1 | `scripts/phase7-suite.js:P7-FR-G1`(실호스트, File > 폴더 닫기 직후의 실제 빈 상태) |
| FR-G2 | `scripts/phase6-suite.js:P6-FR-G2` |
| FR-G3 | `scripts/phase6-suite.js:P6-FR-G3` |
| FR-G4 | `scripts/phase6-suite.js:P6-FR-G4-START` · `P6-FR-G4-END` |
| FR-G5 | `scripts/phase5-suite.js:P5-FR-G5-DEFAULT-OFF` |
| FR-G6 | `scripts/phase5-suite.js:P5-FR-G6-ITEM-COUNT` |
| FR-H1 | **예외(구조 확인)** — 전건 대조 자체가 이 요구의 실행이다: 이 표의 모든 행이 Electron·pywebview 두 갈래에서 각각 실행되고, `npm test`의 매 Phase가 "Zero divergence" 오케스트레이션 단언으로 두 갈래 결과 개수·내용 일치를 확인한다 |
| FR-H2 | **예외(구조 확인)** — `scripts/verify-dist.mjs` 5절(Cross-Host Parity): 두 갈래가 읽는 dist/ 파일 목록·해시가 같음을 확인 |
| FR-I1 | `scripts/phase5-suite.js:P5-FR-I1-REGISTER` (등록 코드가 공통 코어 밖에만 있다는 diff-0줄 주장 자체는 verify-phase5.mjs 1절의 core-purity 구조 확인이 보강한다) |
| FR-I2 | `scripts/phase5-suite.js:P5-FR-I2` |
| FR-I3 | `scripts/phase5-suite.js:P5-FR-I3` |
| FR-I4 | `scripts/phase5-suite.js:P5-FR-I4` |
| FR-I5 | `scripts/phase5-suite.js:P5-FR-I5-OWN` · `P5-FR-I5-BESIDE` |
| FR-I6 | `scripts/phase5-suite.js:P5-FR-R1A` |
| FR-I7 | `scripts/phase5-suite.js:P5-FR-I7` |
| FR-I8 | `scripts/verify-phase5.mjs:(assert)`(구조 확인) · `scripts/phase5-suite.js:P5-FR-I8-SURFACE-EDITOR` · `P5-FR-I8-SURFACE-HANDLE` |
| FR-I9 | `scripts/phase5-suite.js:P5-FR-I9-CORE-ORDER` · `P5-FR-I9-SEPARATOR` · `P5-FR-I9-APP-ITEM` · `P5-FR-I8-SURFACE-NO-MENU-CONTROL` |
| FR-I10 | `scripts/phase5-suite.js:P5-FR-I10-POSITION` · `P5-FR-I10-COUNT` |
| FR-I11 | `scripts/phase5-suite.js:P5-FR-I11` · `P5-FR-I8-SURFACE-NO-MENU-CONTROL` |
| FR-J1 | `scripts/phase4-suite.js:P4-FR-J1` |
| FR-J2 | `scripts/verify-phase4.mjs:(assert)`(구조 확인) · `scripts/phase4-suite.js:P4-FR-J2` · `P4-FR-J3-VIEWMENU` |
| FR-J3 | `scripts/verify-phase4.mjs:(assert)`(구조 확인) · `scripts/phase4-suite.js:P4-FR-J3-ACTBAR` · `P4-FR-J3-VIEWMENU` |
| FR-J4 | `scripts/phase4-suite.js:P4-FR-J4` |
| FR-J5 | `scripts/phase4-suite.js:P4-FR-J5` |
| FR-J6 | `scripts/verify-phase4.mjs:(assert)`(구조 확인) · `scripts/phase4-suite.js:P4-FR-D8-MENU` · `P4-FR-D8-ACTBAR` |
| FR-J7 | `scripts/verify-phase4.mjs:(assert)`(구조 확인) · `scripts/phase4-suite.js:P4-FR-J7-COUNT` · `P4-FR-J7-DOM` |
| FR-J8 | `scripts/phase4-suite.js:P4-FR-J8-PATH1` · `P4-FR-J8-PATH2` · `P4-FR-J8-PATH3` |
| FR-K1 | `scripts/phase6-suite.js:P6-FR-K1-PERSIST` · `P6-FR-K1-RESTORE` · `scripts/verify-phase6.mjs` 6b절(Electron 실제 2프로세스 재시작) |
| FR-K2 | `scripts/phase4-suite.js:P4-INIT-GROUP` · `P4-INIT-PANEL` · `scripts/phase6-suite.js:P6-FR-K2` |
| FR-K3 | `scripts/phase6-suite.js:P6-FR-K3` |
| FR-L1 | `scripts/phase4-suite.js:P4-FR-L1-SET` · `P4-FR-L1-CLEAR` · `scripts/phase6-suite.js:P6-FR-L1-SET` · `P6-FR-L1-CLEAR` |
| FR-L2 | `scripts/phase6-suite.js:P6-FR-L2` |
| FR-L3 | `scripts/phase6-suite.js:P6-FR-L3` |
| FR-L4 | `scripts/phase6-suite.js:P6-FR-L4` |
| FR-L5 | `scripts/phase6-suite.js:P6-FR-L5` |
| FR-L6 | `scripts/phase6-suite.js:P6-FR-L6-CANCEL`(실제 종료 경로) · `P6-FR-L6-DISCARD` |
| FR-L7 | `scripts/phase6-suite.js:P6-FR-L7` |
| FR-M1 | `scripts/phase7-suite.js:P7-FR-M1-MENU` · `P7-FR-M1-ACTBAR` |
| FR-M2 | **예외(구조 확인)** — `scripts/verify-phase2.mjs` 2절(Theme Tokens & Contrast): Light/Dark Modern 색 토큰 값이 VS Code 공식 값과 정확히 일치함을 확인 |
| FR-M3 | **예외(구조 확인)** — `scripts/verify-phase2.mjs` 2절: 회색 배경이 흰색·검정 대응 값의 산술 중간(L* ≈ 54~56)임을 실제 보간 비율 계산으로 확인 |
| FR-M4 | `scripts/phase7-suite.js:P7-FR-M4`(실호스트 — 같은 codicon 글리프 클래스가 3테마 모두에서 동일하고 실제 계산된 색만 다름을 확인. 색 대비 자체는 verify-phase2.mjs 2절이 계산 검증) |
| FR-M5 | **예외(구조 확인)** — `scripts/verify-dist.mjs:(assert)`: `src/style.css`에 tab-explorer-templates 토큰 값이 0건 |
| FR-N1 | `scripts/phase7-suite.js:P7-FR-N1` |
| FR-N2 | `scripts/phase7-suite.js:P7-FR-N2-STRUCTURAL`(구조 확인 — 실제 OS 드래그는 자동화 불가, A4의 실제 드래그앤드롭 한계와 같은 종류) |
| FR-N3 | **예외(구조 확인)** — `scripts/verify-phase7.mjs` 2b절: 두 호스트의 창 생성 코드가 `resizable: false`/`resizable=False`로 리사이즈를 끄지 않았음을 소스에서 확인. round-1에서 이 항목을 `record(id, true, ...)`로 무조건 통과시키던 것을 실제 검사로 교체(Critical 지적) — 실제 OS 리사이즈 자체는 가로챌 workbench-kit 코드 경로가 0개라 이 이상 자동화할 수 없음 |
| FR-N4 | `scripts/phase7-suite.js:P7-FR-N4-MINIMIZE-CLICK` · `P7-FR-N4-MAXIMIZE-CLICK`(실제 클릭 발사; 닫기는 P6-FR-L6이 실제 종료 경로로 이미 검증) |
| FR-N5 | `scripts/phase7-suite.js:P7-FR-N5`(상시 가로 메뉴줄 0개) · `P7-FR-N5-GROUPS`(햄버거를 열면 최상위 묶음이 정확히 3개) |
| FR-N6 | `scripts/phase5-suite.js:P5-FR-I9-CORE-ORDER` · `scripts/phase7-suite.js:P7-FR-N6` |
| FR-N6a | `scripts/phase6-suite.js:P6-FR-N6A-PICKER` · `P6-FR-N6A` |
| FR-N6b | `scripts/verify-phase4.mjs:(assert)`(구조 확인) · `scripts/phase4-suite.js:P4-FR-N6b-KEY` · `P4-FR-N6b-MENU` |
| FR-N6c | `scripts/phase7-suite.js:P7-FR-N6C`(실호스트, 실제 File > 폴더 닫기 메뉴 클릭) |
| FR-N7 | `scripts/phase7-suite.js:P7-FR-N7` · `P7-FR-N7-CHECKBOX-OFF` |
| FR-N8 | `scripts/phase7-suite.js:P7-FR-N8` |
| FR-N9 | `scripts/phase7-suite.js:P7-FR-N9`(오른쪽 자리: 이름·버전·갈래 실제 문자열 대조) · `P7-FR-N9-PATH`(왼쪽 자리: 실제 트리 행 선택 후 상태 표시줄 텍스트가 그 행의 실제 대상과 일치함을 확인) |
| FR-N10 | `scripts/phase5-suite.js:P5-FR-N10-APPEND` · `P5-FR-N10-SLOTS` |
| FR-N10a | `scripts/phase6-suite.js:P6-FR-N10A` |
| FR-N10b | `scripts/phase6-suite.js:P6-FR-N10B-PERSIST` · `P6-FR-N10B-STOP` |
| FR-N11 | **예외(구조 확인)** — `scripts/verify-dist.mjs:(assert)`: 세로 띠 아이콘 목록·순서와 칸 삭제/합치기 항목 0건을 소스에서 확인 |
| FR-N12 | `scripts/phase5-suite.js:P5-FR-N12-SWAP` · `P5-FR-N12-MENU-UNCHANGED` |
| FR-P1 | `scripts/phase6-suite.js:P6-FR-P1-COLOR` · `P6-FR-P1-LINENUM` |
| FR-P2 | `scripts/phase6-suite.js:P6-FR-P2-FIND` · `P6-FR-P2-REPLACE`(find controller를 통한 실치환 — 렌더된 위젯 입력 자체는 아직 미검증, `docs/reviews/A6.md` 잔여 위험 참고) |
| FR-P3 | `scripts/phase6-suite.js:P6-FR-P3-UNDOREDO` |
| FR-P4 | `scripts/phase6-suite.js:P6-FR-P4` |
| FR-P5 | `scripts/verify-phase6.mjs:(assert)`(구조 확인) · `scripts/phase6-suite.js:P6-FR-P5-MINIMAP` · `P6-FR-P5-MULTICURSOR` · `P6-FR-P5-SUGGEST` · `P6-FR-P5-HOVER` · `P6-FR-P5-MARKERS` |
| FR-P6 | **예외(구조 확인)** — `scripts/verify-phase6.mjs:(assert)`: 앱 쪽 의존성에 monaco-editor가 0건 |
| FR-P7 | `scripts/phase6-suite.js:P6-FR-L4`(저장 핸들러 호출 = FR-P7의 "앱이 상태를 올림") |
| FR-Q1 | `scripts/phase7-suite.js:P7-FR-Q1A`(선택 가능한 두 세트가 실제로 다르게 렌더됨을 실증) |
| FR-Q1a | `scripts/verify-dist.mjs:(assert)`(구조 확인) · `scripts/phase7-suite.js:P7-FR-Q1A` · `P7-FR-Q1A-ROUNDTRIP` · `P7-FR-Q1A-NOT-ON-ACTBAR` |
| FR-Q2 | `scripts/phase7-suite.js:P7-FR-Q2`(실호스트 — 색 테마 3 × 아이콘 테마 2 = 6조합을 실제로 순회하며 각 조합에서 방금 설정한 색 테마가 그대로 적용되고 아이콘 테마 클래스가 딱 2가지로만 나타남을 확인. round-1에서 이 항목을 `record(id, true, ...)`로 무조건 통과시키던 것을 교체(Critical 지적)) |
| FR-Q3 | **예외(구조 확인)** — `scripts/verify-dist.mjs` · `verify-phase3.mjs` · `verify-phase5.mjs` · `verify-phase6.mjs`: 공통 코어에 확장자→아이콘 대응표가 0건임을 각 Phase가 새 코드를 추가할 때마다 반복 확인 |
| FR-Q4 | **예외(구조 확인)** — `scripts/verify-dist.mjs:(assert)`: `licenses/`에 5개 항목의 라이선스 본문이 모두 있고 목록 1개가 있음을 확인 |
| FR-Q5 | `scripts/phase7-suite.js:P7-FR-Q5` |
| FR-R1 | `scripts/verify-phase5.mjs:(assert)`(문서 존재·내용 확인) · `scripts/phase5-suite.js:P5-FR-R1-GLOBAL` |
| FR-R1a | `scripts/verify-phase5.mjs:(assert)`(문서 존재·내용 확인) · `scripts/phase5-suite.js:P5-FR-R1A` |
| FR-R2 | **예외(문서 자체가 결과물)** — `docs/vscode-comparison.md` 존재와 divergence 정확히 1건(Zen 모드)을 `scripts/verify-phase7.mjs`가 확인 |
| FR-R3 | **예외(문서 자체가 결과물)** — `docs/checklist.md` 존재와 두 종류 구분을 `scripts/verify-phase7.mjs`가 확인 |

---

## 집계

- 133건 전부 이 표에 있다 (`docs/current/SPEC.md` 1절과 1:1 대조 — `scripts/verify-phase7.mjs`가 자동으로 재확인하고, 인용된 `scripts/phase{n}-suite.js:ID` 단언이 실제로 그 파일에 존재하는지도 함께 확인한다).
- "예외(구조 확인)"·"예외(문서 자체가 결과물)"로 표시된 13건(FR-H1·H2·M2·M3·M5·N3·N11·P6·Q3·Q4·R2·R3, 그리고 부분적으로 Q1a)을 제외한 나머지는 전부 실제 브라우저(Electron·pywebview)에서 시뮬레이션된 사용자 조작으로 판정된다.
- 두 갈래 결과가 다른 항목 0개는 `npm test`가 매 Phase에서 확인하는 "Zero divergence" 오케스트레이션 단언으로 보장된다(FR-H1).
- **A7 라운드-1·2 대응**: Phase 3 Mock DOM(로직 수준 시뮬레이션, `docs/checklist.md` §1)에만 의존하던 FR-A1~A5·A8~A12·A15~A24·G1·N6c를 Phase 7의 실호스트 `phase7-suite.js`로 승격했다(라운드 1에서 A2~A24 대부분, 라운드 2에서 A1·A15 추가). 이제 Phase 3 Mock DOM(로직 수준 시뮬레이션)에만 의존하는 FR 행은 0개다.
- **미해결로 남은 것(A7 라운드 1~3에서 지적, 3회 한도 소진까지 완전히 해소되지 않음)**: FR-E1·E3·J1·D6·D7·G2~G4·K1~K3·P2~P4·P7 등 Phase 4~6의 기존 단언 다수가 실제 UI 트리거(닫기 버튼·Ctrl+W·찾기 위젯 입력 등) 대신 내부 API를 직접 호출한다(별도 후속 작업 필요, 사람의 재착수 승인 필요). FR-A13·A17·A23(New Folder)·A24(앱 미등록 상태)·N2·N3·N4·Q2(시각 유효성)는 실호스트로 옮겨졌지만 요구의 일부만 증명한다(추가 코드 작업으로 해결 가능). `docs/vscode-comparison.md`의 "divergence 정확히 1개" 주장과 `docs/checklist.md`의 3분류(FR-R3는 2분류를 요구)는 사람의 SPEC/DECISIONS 판단이 필요하다. 전체 목록은 `docs/reviews/A7.md`를 본다.
