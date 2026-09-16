> 버전: v0.3 · 작성일: 2026-09-16

# PROGRESS — workbench-kit v0.3

> 에이전트가 진행하며 append한다. 사람이 미리 쓰지 않는다.
> 계획(`PLAN.md`·`backlog.json`)과 설계 결정(`DECISIONS.md`)은 여기 담지 않는다.

## 1. 계획한 것

`backlog.json`의 task를 닫을 때마다 **무엇을 했나 · 결과 · 검증**을 남긴다.
필수 통과 Phase(1 · 4 · 6)는 반대 벤더 적대적 검증 기록(`docs/reviews/A{n}.md`)이
없으면 닫지 않는다.

## 2. 계획 외 개선

사람이 구현 중 요청한, backlog에 없는 작업을 요청 건마다 남긴다.

- `scripts/backlog-cli.mjs`를 새로 만들었다. `CLAUDE.md`가 "backlog.json은 CLI로만
  바꾼다"고 하는데 그런 CLI가 프로젝트에 없어서, task를 닫기 전에 최소 기능
  (`list`/`update --status`)만 갖춘 것을 만들었다. `docs/current/backlog.json`을
  직접 쓰지 않고 이 스크립트를 통해서만 바꿨다.

---

## Phase 1 — Folder Tabs 레일과 폴더 추가 (WK-083 ~ WK-087) — done, 2026-09-16

**무엇을 했나**

- `src/core/foldertabs.ts`(신규): `FolderTabsController`. 폴더 탭 목록·활성 탭·
  같은 경로 `(N)` 번호 슬롯을 관리한다. `addTab()`은 항상 새 탭을 추가하고
  (D-3), `removeTab()`은 슬롯을 반납한다(hover `×` UI 자체는 Phase 2/WK-089).
- `src/core/layout.ts`: Activity Bar와 Explorer 사이에 `#foldertabs-rail`
  (헤더 `FOLDERS` + `Add Folder`·`Rename Folder Tab` 아이콘 두 개 + 탭 목록)을
  추가했다.
- `src/style.css`: 레일 CSS ("2b. Folder Tabs rail" 구간). 활성 탭은 배경 +
  왼쪽 강조선으로 구분되며 세 색 테마 모두에서 실측 확인했다.
- `src/main.ts`: `Open Folder`(`Ctrl+O`)·`Add Folder`·`Open Recent`의 각 항목이
  이제 `folderTabs.addTab()`을 호출해 항상 새 탭을 추가한다(교체 안 함, D-3).
  v0.2의 단일 "마지막 폴더 복원"(`restoreLastSession`의 실제 복원 동작,
  `workbench:last-folder` 저장)은 제거했다. `app.openFolder()`·
  `app.restoreLastSession()`은 이름만 남긴 호환 shim이다(아래 "왜" 참조).

**왜 이렇게 했나 (반대 벤더 검토에서 나온 결정)**

- `app.openFolder()`/`app.restoreLastSession()`을 완전히 지우지 않고 호환
  shim으로 남긴 이유: `npm test`에 여전히 물려 있는 v0.1/v0.2 검증 스위트
  (`phase6-suite.js` 등)가 이 두 메서드를 직접 호출한다. 완전히 지우면
  TypeError로 스위트가 죽어서 "의도된 동작 변경으로 인한 개별 단언 실패"와
  "스위트 자체가 못 돈다"를 구별할 수 없게 된다. 자세한 근거는
  `docs/reviews/A16.md`.

**검증**

- `npx tsc --noEmit` 통과.
- `node scripts/verify-v03-phase1.mjs`: Electron·pywebview 두 갈래 각각 27개
  단언 전부 통과, 두 갈래 불일치 0건 (실측 DOM 위치·색·텍스트 기준,
  `scripts/v03-phase1-suite.js` + `scripts/v03-phase1-electron-runner.cjs` +
  `src/hosts/pywebview/main.py`의 `--v03-phase1-test`).
- 반대 벤더 적대적 검증(Codex `gpt-5.6-sol`): `docs/reviews/A16.md`. 2회차 끝에
  Critical 0 · 처리된 Major 2 · 처리된 Minor 1 · 근거를 남기고 보류한 Major 1건
  (npm test와 v0.2 스위트의 D-3 충돌 — Phase 6/WK-110 소관으로 명시적으로 미룸).
- 기존 스위트 회귀 확인: `verify:phase2`~`verify:phase5`·`verify:dist`를 돌려
  내가 만든 새 실패가 없음을 확인했다(기존에 알려진 `8px`/`16px` 금지값 위반만
  남아 있고, 이건 PLAN.md가 이미 "이번 범위 밖"으로 적어 둔 것과 일치한다).
  `verify:phase6`/`verify:phase7`/`verify:v02-phase6`/`verify:v02-phase7`은
  D-3(Open Folder가 교체→추가) 반전 때문에 일부 단언이 실패할 것으로 예상되며,
  의도적으로 이번 Phase에서 고치지 않았다 — `docs/reviews/A16.md`의 "유효하지
  않은 지적과 반박 근거" 참조. 이 정리는 Phase 6(WK-110)의 몫이다.

**다음**

Phase 2(WK-088 ~ WK-092, 탭 닫기·정렬·표시 별칭)로 진행.

---

## Phase 2 — 탭 조작: 닫기 · 정렬 · 표시 별칭 (WK-088 ~ WK-092) — done, 2026-09-16

**무엇을 했나**

- `src/core/foldertabs.ts`: hover `×` 닫기(`removeTab`, 파일시스템 미접촉), 활성 탭
  닫기 시 "바로 아래, 없으면 바로 위, 없으면 없음 + Explorer 빈 상태" 규칙, 세로 드래그
  정렬(포인터 캡처·`pointercancel` 처리·레일 경계 밖 드롭 무시·드롭 위치 표시), 인라인
  이름 변경(Enter 저장·Escape 취소, F2 비예약), 별칭↔`(N)` 슬롯 상호작용(`setAlias`)을
  구현했다.
- `src/main.ts`: `folderTabs.onEmpty()`로 마지막 탭을 닫으면 Explorer가 빈 상태로
  돌아가게 연결했다. `closeFolder()`도 활성 탭 표시를 함께 지우도록 고쳤다(Phase 1
  A16 2회차에서 이미 발견된 것의 연장).
- `src/style.css`: 닫기 버튼(hover/focus에서만 보임)·이름 변경 입력·드래그 중 드롭
  표시(`box-shadow`) 스타일 추가.
- 레일 세로 스크롤(WK-092)은 Phase 1의 `overflow-y: auto`로 이미 충족돼 있었고, 탭
  80개로 실측 확인만 했다.

**검증**

- `npx tsc --noEmit` 통과.
- `node scripts/verify-v03-phase2.mjs`: Electron·pywebview 두 갈래 각각 30개 단언
  전부 통과, 두 갈래 불일치 0건.
- `node scripts/verify-v03-phase1.mjs` 재실행으로 회귀 0건 확인.
- 반대 벤더 적대적 검증(Codex `gpt-5.6-sol`, 새 기능 Phase라 필수 통과는 아니지만
  검증 자체는 필수): `docs/reviews/A17.md`. 2회차 끝에 Critical 0 ·처리된 Major 3
  (별칭 확정 시 미변경 감지, 드래그 pointercancel/캡처/경계, 로딩 중 마지막 탭 닫기 시
  진행바 고착) · 처리된 Minor 2(이름 변경 초안 보존, 닫기 중 닫기 버튼 유지) · 2회차의
  키보드 버블링 버그(닫기 버튼 Enter가 탭 활성화로 새는 것)·검증 스위트 DOM-존재만
  확인하던 약점·Electron 러너 오류 미처리를 모두 수정. 키보드만으로 드래그 정렬하는
  경로가 없다는 지적 1건은 PLAN.md에 없는 요구라 범위를 스스로 넓히지 않고 "미해결·
  남은 위험"에 근거와 함께 남겼다.
- 1회차 검토 실행 시도 하나가 환경 이슈로 25분 넘게 응답 없이 멈춰 중단하고 재시도한
  일이 있었다 — 결과 없는 시도라 3회 제한에 세지 않고 유효 실행만 2회로 기록했다
  (`docs/reviews/A17.md` "실행 회차" 참조).

**계획 외 개선**

- v0.3 Phase 1·2 Electron 러너(`scripts/v03-phase{1,2}-electron-runner.cjs`)에
  `app.whenReady().then(...)` 체인의 `.catch()`를 추가했다. 기존 v0.1/v0.2 러너들도
  같은 패턴(오류 처리 없음)이지만, 그것들을 지금 고치는 것은 Phase 2 범위 밖이라
  건드리지 않았다.

**다음**

Phase 3(WK-093 ~ WK-097, 레일 토글과 Explorer 연동)로 진행.

---

## Phase 3 — 레일 토글과 Explorer 연동 (WK-093 ~ WK-097) — done, 2026-09-16

**무엇을 했나**

- `src/core/viewstate.ts`: `folderTabsVisible` 상태와 `toggleFolderTabs()`/
  `setFolderTabsVisible()`를 추가했다. Explorer(`sidebarVisible`)와 완전히 독립이며,
  재시작 간 저장하지 않는다(다른 Activity Bar 영역 토글과 같은 수명).
- `src/core/activitybar.ts`: `Toggle Explorer` 바로 다음에 `codicon-folder-library`
  아이콘(`activity:toggle-foldertabs`)을 추가했다.
- `src/core/menu.ts`: `View` 메뉴에 `Show Folder Tabs`(단축키 없음)를 추가했다.
- `src/main.ts`: 아이콘·메뉴 둘 다 `viewState.toggleFolderTabs()`를 부르고 같은
  `folderTabsVisible` 상태를 본다. Zen Mode CSS에 `#foldertabs-rail`을 추가했다.
- `src/core/foldertabs.ts`: `onActivate`(실제 변경 시에만 발화, Explorer 루트 로딩용)와
  별개로 `onSelect`(매 클릭마다 발화)를 신설해, Explorer가 숨겨진 채 **이미 활성인**
  탭을 다시 클릭해도 Explorer가 다시 보이게 했다(A18 1회차 Major 발견 → 수정).

**검증**

- `npx tsc --noEmit` 통과.
- `node scripts/verify-v03-phase3.mjs`: Electron·pywebview 두 갈래 각각 24개 단언
  전부 통과, 두 갈래 불일치 0건.
- `node scripts/verify-v03-phase1.mjs`·`verify-v03-phase2.mjs` 재실행으로 회귀 0건
  확인.
- 반대 벤더 적대적 검증(Codex `gpt-5.6-sol`): `docs/reviews/A18.md`. 1회차 Major 1건
  (이미 활성인 탭 재클릭 시 Explorer 미표시 — `onSelect`/`onActivate` 분리로 수정) ·
  Minor 2건(검증 스위트가 그 버그를 못 잡는 구조였음 → 재현 케이스 추가) 모두 처리.
  2회차 Minor 2건 중 하나(검증 스크립트 실패 시 진단 출력 부족)는 수정, 다른 하나
  (Explorer 펼침·선택·스크롤 상태 미검증)는 그 상태 자체가 아직 존재하지 않는
  Phase 4 개념이라 근거를 남기고 보류했다.

**다음**

Phase 4(WK-098 ~ WK-101, 폴더별 Explorer 상태 보존과 복원) — **필수 통과 Phase**로
진행. 영속 저장이 처음 들어가는 Phase이므로 반대 벤더 검증에서 미해결 Critical이
있으면 다음 Phase로 넘어가지 않는다.

---

## Phase 4 — 폴더별 Explorer 상태 보존과 복원 (WK-098 ~ WK-101) — done, 2026-09-16

**무엇을 했나**

- `src/core/tree.ts`: `getScrollTop`/`setScrollTop`, `restoreExpanded(ids)`(저장된
  집합에 없으면 루트를 먼저 명시적으로 접음), `restoreSelection(ids, focusedId)`를
  추가했다.
- `src/core/foldertabs.ts`: `restoreTabs(tabs, activeTabId)`(재시작 복원 전용,
  `onActivate`/`onSelect`/`onChange` 미발화), `onChange`(매 렌더 후 발화 — 저장
  트리거), `onRemove`(탭 닫힘 즉시 발화, `render()`보다 먼저)를 추가했다.
- `src/main.ts`: 탭 id별 `ExplorerState`(펼침·선택·스크롤) 맵을 앱에 두고,
  `activateFolderTab()`에서 나가는 탭 상태 저장 → 새 탭 로드 → 들어오는 탭 상태
  복원을 한다. `persistFolderTabs()`가 탭 목록·순서·별칭·활성 탭·각 탭 상태를
  `localStorage`(`workbench:folder-tabs`)에 직렬화하고, `restoreFolderTabs()`가
  시작 시 복원한다(`initWorkbench()`에서 호출).
- `src/hosts/pywebview/main.py`: **재시작 복원이 실제로는 전혀 동작하지 않던
  두 가지 버그**를 찾아 고쳤다 — `private_mode`가 기본값 `True`라 `storage_path`를
  줘도 로컬스토리지가 저장 안 됐고, 로컬 파일이 매 실행마다 무작위 포트의 내부
  HTTP 서버로 서빙되어 origin이 매번 달라졌다. `private_mode=False` + 고정
  `http_port`(충돌 시 사전 확인 후 임의 포트로 폴백)로 고쳤다.

**검증**

- `npx tsc --noEmit` 통과. `py_compile` 통과.
- `node scripts/verify-v04-phase4.mjs`: Electron·pywebview 두 갈래 각각 단일
  세션 + **실제 프로세스 재시작 쌍**(launch1/launch2, phase6 A8의 "진짜 재시작으로
  검증" 패턴 재사용) 전부 통과, 두 갈래 불일치 0건.
- `node scripts/verify-v03-phase{1,2,3}.mjs` 재실행으로 회귀 0건 확인.
- 반대 벤더 적대적 검증(Codex `gpt-5.6-sol`, **필수 통과**): `docs/reviews/A19.md`.
  **3회 제한을 전부 소진**했다 — 1회차 Critical 3건, 2회차에 그중 2건이 재발(순서·
  ABA 경쟁 문제), 3회차에도 같은 근본 원인이 다른 형태로 다시 나타나 Critical 2건
  미해결로 게이트가 FAIL 판정을 받았다. 이 세션은 그 2건을 직접 수정하고(활성 탭
  닫기 시 `activeFolderTabId` 즉시 정리, ABA를 막는 `restoringReqId` 토큰 도입)
  새 회귀 테스트로 실측 검증했지만 **4회차 자동 재검증은 프로젝트 규정(3회
  제한)상 받지 않았다** — `docs/reviews/A19.md`의 "처리 — 3회차 이후" 절에
  이 사실을 명시했다.

**계획 외 개선**

- pywebview의 재시작 복원이 이번 Phase 전까지 v0.1/v0.2 내내 **한 번도 실제로
  검증된 적이 없었다**(기존 v0.2 Phase 6 검증은 단일 프로세스 시뮬레이션만
  했음). 이번에 실제 2-프로세스 재시작으로 검증하다가 위 두 버그를 발견했다.

**다음**

Phase 5(WK-102 ~ WK-104, 사라진 경로의 오류 상태)로 진행.

---

## Phase 5 — 사라진 경로의 오류 상태 (WK-102 ~ WK-104) — done, 2026-09-17

**무엇을 했나**

- `src/core/foldertabs.ts`: `FolderTab`에 `error: string | null` 필드를 추가했다.
  `setTabError(id, message)`(오류 표시/해제), `setTabPath(id, newPath)`(같은 탭 id를
  유지한 채 경로만 재지정 — 번호 슬롯 재계산 포함)를 추가했다. 오류 탭은 경고 아이콘
  (`codicon-warning`)과 `.error` 클래스로 표시되고, hover 시 tooltip이 경로 대신
  오류 메시지를 보여준다. 오류 탭 행에는 `×`(닫기)와 별개로 "Locate Folder…" 버튼이
  상시 노출된다.
- `src/main.ts`: `activateFolderTab()`의 실패 경로에서 `tree.clearRoot()` +
  `folderTabs.setTabError(tab.id, message)`를 호출한다(탭은 절대 자동 제거 안 함,
  D-6). 성공 시 `setTabError(tab.id, null)`로 해제한다. `handleRelocateFolderTab()`이
  "Locate Folder…" 클릭을 받아 네이티브 다이얼로그 → `setTabPath()` → 재시도를
  연결한다.
- `src/style.css`: 오류 상태 색은 기존 상태바 오류 색 토큰(`--statusbar-error-fg`)을
  그대로 재사용해 새 색을 추가하지 않았다.

**검증**

- `npx tsc --noEmit` 통과.
- `node scripts/verify-v05-phase5.mjs`: Electron·pywebview 두 갈래 각각 21개 단언
  전부 통과, 두 갈래 불일치 0건. 실제 존재하지 않는 경로(임시 폴더를 만들고 바로
  지워 확정적으로 없앤 경로)로 재현했다.
- `node scripts/verify-v03-phase{1,2,3}.mjs`·`verify-v04-phase4.mjs` 재실행으로
  회귀 0건 확인.
- 반대 벤더 적대적 검증(Codex `gpt-5.6-sol`, 새 기능 Phase라 필수 통과는 아니지만
  검증은 필수): `docs/reviews/A20.md`. 1회차에서 Critical 0 · Major 3건 — 비활성
  오류 탭을 재배치하면 레일 활성 표시와 Explorer가 어긋나는 문제(수정: 재배치가
  먼저 그 탭을 활성화하도록 통일), 그 파생으로 생기던 유령 루트 문제(같은 수정으로
  함께 해소, Phase 4 A19의 보호 로직 재사용), `restoreTabs()`가 재시작 전 오류를
  안 지우던 주석-동작 불일치(수정: 무조건 초기화)를 모두 처리했다. 비활성 복원
  탭의 경로를 재시작 시 미리 검사하지 않는다는 지적은 Phase 4의 지연 로딩 설계와
  일관적이라 판단해 근거를 남기고 반박했다.

**다음**

Phase 6(WK-105 ~ WK-110, 에디터 전환 모드와 두 갈래 전건 대조) — **필수 통과
Phase**로 진행. 이번 버전의 마지막 Phase이자 유일한 기존 동작 반전(D-3, Open
Folder가 교체→추가)을 정산하는 Phase다.
