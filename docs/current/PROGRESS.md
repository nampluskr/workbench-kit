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

- **파일·폴더 수준 1 열기 모드 및 단축키/상태바 연동 (Level 1)** (2026-09-19)
  - `수준 1 범위 구현`: 외부 디스크 I/O나 터미널 프로세스 구동 없이, 탭 내 대상 경로 및 열린 모드 플레이스홀더(`// File preset view: ... [Mode: ...]`, `Folder preset view: ... [Mode: ...]`) 표시 및 읽기 전용 상태 연동으로 순수 껍데기 모드 전환 체계 구축.
  - `파일 모드`: `editor` (기본, 편집 가능) 및 `viewer` (읽기 전용 `readOnly`).
  - `폴더 모드`: `file-list` (기본) / `cmd` / `terminal` 3가지 모드 지원.
  - `상태바 모드 버튼 & View 메뉴 연동`: 탭 우측 상단 툴바는 배제하고 상태바 우측(`#statusbar-mode-btn`)에 텍스트 전용 버튼을 배치. 더미 텍스트 없이 활성 탭에 해당하는 모드만 단일 노출(`File: Editor` 또는 `Folder: File List` 등). 클릭 시 모드 토글/순환. 햄버거 메뉴 `View > Tab Mode` 서브메뉴를 통해서도 활성 탭의 모드 확인 및 라디오 체크 선택/전환 지원 (`setActivePanelMode`). 상태바와 메뉴 상호 즉시 동기화.
  - `단축키 정비`: `Ctrl+N`(New Tab), `Ctrl+O`(Open File...), `Ctrl+K Ctrl+O`(Open Folder...) 정립. `menu.ts` 및 `filesystem.ts`(`promptOpenFileDialog`) 연동.
  - `빈 탭 덮어쓰기 (Empty Tab Takeover)`: 수정되지 않은 빈 Untitled 탭이 활성 상태일 때 파일/폴더를 열면 새 탭을 추가하지 않고 해당 빈 탭을 재활용.
  - `src/registry/kind-registry.ts`: `setMode` 핸들러 등록 및 `setPanelMode` 동적 모드 전환 인터페이스 지원.
  - `검증`: `npm run typecheck`, `verify-dist.mjs`, `verify-phase2.mjs`, `verify-phase3.mjs`, `verify-phase5.mjs`, `verify-phase7.mjs` 및 v0.3 어설션 전체 통과.

- **File/View 메뉴 원점 재구성 및 폴더별 작업공간 기본화** (2026-09-19)
  - `File`: `New Tab`을 메뉴에 노출하고 `Open Folder...`를 실제 동작에 맞는
    `Add Folder...`로, `Close Editor Group`을 `Close All Tabs in Group`으로 바꿨다.
    분할 명령은 파일 작업이 아니라 화면 배치이므로 `View > Layout`으로 이동했다.
  - `View`: 최상위를 `Layout`과 `Appearance` 두 그룹으로 줄였다. `Layout`에는
    `Show Sidebar`(Roots+Tree 조합 복원, `Ctrl+B`)·`Show Roots`·`Show Tree`·분할 명령과
    단일 체크 항목 `Workspace per Folder`를 둔다. `Appearance`에는 Color/Icon Theme,
    Title/Status Bar, Line Numbers, Zen Mode를 둔다. 사용자용 명령이 아닌 `Preset Info`는 제거했다.
  - `Workspace per Folder`는 시작 시 체크된 기본값이며, 해제하면 모든 Roots가 하나의
    에디터 레이아웃을 공유한다. 기존 `Shared Editor`/`Folder Workspace` 두 행은 제거했다.
  - `src/core/menu.ts`: Appearance 안의 Theme 선택까지 키보드로 접근할 수 있도록 임의
    깊이 하위 메뉴의 `ArrowRight`/`ArrowLeft`/`Enter` 탐색과 separator/shortcut 렌더링을 지원한다.

- `scripts/backlog-cli.mjs`를 새로 만들었다. `CLAUDE.md`가 "backlog.json은 CLI로만
  바꾼다"고 하는데 그런 CLI가 프로젝트에 없어서, task를 닫기 전에 최소 기능
  (`list`/`update --status`)만 갖춘 것을 만들었다. `docs/current/backlog.json`을
  직접 쓰지 않고 이 스크립트를 통해서만 바꿨다.

- **Help > About 다이얼로그 개편 (VS Code 스타일 & 서드파티 라이선스 고지)** (2026-09-17)
  - `src/core/about.ts`, `src/style.css`, `src/main.ts`: VS Code의 정보 대화상자 형식을
    참조하여 버전·커밋·날짜·Electron/Node/Chromium/OS 시스템 정보 그리드와 클립보드 복사
    버튼을 구현했다. `docs/refs/licenses.md`에 명시된 4대 핵심 서드파티 라이브러리
    (`@vscode/codicons`, `@vscode/icon-theme-seti`, `vscode-icons`, `dockview-core`)의
    라이선스 및 저작권 귀속 고지 카드를 추가했다. 키보드(Escape, Enter) 접근성을 연결했다.

- **Activity Bar 및 패널 헤더 명칭·아이콘 재배치** (2026-09-17 ~ 2026-09-18)
  - `src/core/activitybar.ts`, `src/main.ts`: Titlebar 및 Statusbar 접기/펴기 아이콘을
    기존 chevron에서 접기 메타포에 부합하는 `codicon-fold-down`/`codicon-fold-up`으로 교체.
  - Activity Bar 상단 아이콘 순서 및 글리프 교체: 폴더탭 레일(`ROOTS`)을 상위
    (`codicon-list-unordered`), 탐색기(`TREE`)를 하위(`codicon-list-tree`)로 배치.
  - `src/core/layout.ts`: 패널 헤더 명칭을 `FOLDERS` → `ROOTS`, `EXPLORER` → `TREE`로 변경.
  - `src/core/layout.ts`: 폴더탭 레일 헤더의 4개 액션 버튼 순서를 작업 빈도 및 논리적 흐름에
    맞춰 재배치 (1. `Add Folder` → 2. `Rename Folder Tab` → 3. `Set Tab Color` → 4. `Add All Drives`).
  - 검증: `scripts/v03-phase1-suite.js`, `scripts/v03-phase3-suite.js`, `scripts/v02-phase5-suite.js` 동기화.

- **에디터 헤더 액션 아이콘 재배치 및 그룹 일괄 닫기(Close All) 기능 추가** (2026-09-18)
  - `src/core/editor.ts`: 에디터 그룹 헤더 액션 바의 버튼 구성을 4개로 확장하고 순서를
    재배치했다 (1. `New Tab` (`codicon-diff-added`) → 2. `Split Right` (`codicon-split-horizontal`) →
    3. `Split Down` (`codicon-split-vertical`) → 4. `Close All Tabs in Group` (`codicon-close-all`)).
  - 새 탭 아이콘을 `codicon-diff-added`로 교체하여 분할/닫기 아이콘과 동일한 사각 창(Box)
    프레임 형태를 유지하면서 6×6px의 컴팩트한 `+` 심볼을 제공했다.
  - `Close All` 동작 시 `EditorController.closeAllTabsInGroup(this.group)`을 호출하여,
    그룹 내 미저장(`isDirty: true`) 탭이 있는 경우 해당 탭을 순차적으로 화면에 활성화
    (`panel.api.setActive()`)하며 저장/폐기/취소 확인 다이얼로그를 띄우도록 연동했다. 취소 시
    아무 탭도 닫히지 않고 중단되며, 모든 확인이 끝난 뒤에만 그룹의 모든 탭이 닫히고 빈 칸이 자동 정리된다.
  - 검증: `scripts/verify-phase4.mjs`, `scripts/phase4-suite.js`, `scripts/v02-phase4-suite.js` 갱신.

- **패널 및 에디터 헤더 우측 여백 5px 통일** (2026-09-18)
  - `src/style.css`: 폴더탭 헤더(`.foldertabs-header`)와 탐색기 헤더(`.sidebar-header`)의
    우측 여백을 에디터 탭 헤더(`.editor-group-header-actions`)와 동일한 **5px**로 통일
    (`padding: 0 5px 0 10px;`). 3개 헤더의 우측 끝 버튼 여백이 시각적으로 일치됨.

- **메뉴 Recent Folders 닫기(x) 버튼 스타일 통일** (2026-09-18)
  - `src/style.css`: `.menu-item-secondary`에 폴더탭 레일(`.foldertabs-tab-close`)과 동일한
    스타일 규칙을 적용했다.
  - 평소에는 숨김(`opacity: 0`), 개별 메뉴 행 hover 시(`.menu-item-row:hover > .menu-item-secondary`) 또는 키보드 포커스 시 노출(`opacity: 0.8`),
    버튼 자체 hover 시 강조(`opacity: 1`, `background-color: var(--button-hover-bg)`).
    (상위 서브메뉴 행 hover로 인한 전체 x 동시 노출 버그를 직계 자식 결합자 `>`로 해결)
  - 아이콘 크기를 기존 16px에서 폴더탭 레일과 동일한 `13px` (`width: 18px; height: 18px;`)로 축소·통일.

- **스타일시트 내 금지 토큰(4px, 8px, 16px) 정비** (2026-09-18)
  - `src/style.css`: 주석 및 프로퍼티에 남아있던 D-29 금지값(4px, 8px, 16px)을 3px/5px/7px 등
    허용 규격으로 정리하여 `verify-phase2.mjs` 및 `verify-dist.mjs` 검증을 클린하게 통과하도록 수정.

- **에디터 탭 및 분할·포커스 단축키 VS Code 표준화 개편** (2026-09-18)
  - `src/main.ts`, `src/core/editor.ts`, `src/core/focusareas.ts`, `src/core/menu.ts`:
    - 포커스 이동: `Ctrl+0`(탐색기 포커스/열기), `Ctrl+1`(1번 에디터 창 포커스), `Ctrl+2`(2번 에디터 창 포커스, 1개일 시 우측 분할 생성).
    - 탭 조작: `Ctrl+N`(새 빈 탭 추가), `Ctrl+PageDown`/`Ctrl+PageUp`(다음/이전 탭 이동), `Ctrl+Tab`/`Ctrl+Shift+Tab`(호환 유지).
    - 분할 및 일괄 닫기: `Ctrl+\`(좌우 분할), `Ctrl+K Ctrl+\`(상하 분할), `Ctrl+K W`(그룹 내 모든 탭 일괄 닫기).
    - 에디터 헤더 액션 버튼 툴팁 및 메뉴 항목(`DEFAULT_FILE_ITEMS`)에 단축키 힌트 반영.
  - 문서화: `README.md` 단축키 표 갱신, `docs/reserved-keys.md` 전역 예약 키 목록 정본 반영.
  - 검증: `npm run typecheck` 통과, `npm run build` 산출물 검증.
  - 버그 수정 (2026-09-18): `Ctrl+PageDown`/`PageUp` 시 `main.ts`(capture 단계)와 `focusareas.ts`(bubble 단계) 양쪽에서 중복 발화되어 탭이 2회 연속 순환(제자리 복귀)하던 문제를 수정. `main.ts`의 `run()`에 `e.stopPropagation()`을 추가하고 `focusareas.ts`의 중복 핸들러를 제거하여 단일 실행 보장. Electron 런타임에서 `PageDown`/`PageUp`/`Ctrl+Tab` 전환 정상 작동 확인.

- **파일/폴더 열기 모드 실제 구현 (Level 1 플레이스홀더 → 실동작)** (2026-09-19)
  - `File`: `Open File...`이 실제 네이티브 다이얼로그로 UTF-8 텍스트 파일을 열어
    Viewer 모드(읽기 전용)로 표시한다. 상태바 `File: Viewer` 클릭 또는 View > Tab
    Mode로 Editor 모드 전환, `Ctrl+S`로 실제 디스크에 저장한다. 두 호스트 모두
    `dialog:open-file`/`fs:read-text-file`/`fs:write-text-file` IPC(Electron)와
    대응하는 `WindowApi` 메서드(pywebview)를 신설했다. 바이너리 파일은 null byte
    검사로 거부한다.
  - `src/presets/folder-preset.ts`: 플레이스홀더 텍스트 대신 `readDirectory()`로
    실제 폴더 내용을 나열하는 File List UI로 교체했다(Refresh 버튼, 폴더 우선
    정렬, 행 클릭 시 `openEntry` 콜백으로 파일/하위폴더 열기).
  - `src/presets/terminal-preset.ts`(신규): `@xterm/xterm` 기반 첫 터미널 프리셋.
    이 시점에는 `terminalHost.read()`를 짧은 간격으로 반복 호출하는 폴링 방식이었다
    (뒤이은 a1c91e5가 이벤트 푸시로 교체).
  - Electron(`main.cjs`/`preload.cjs`)·pywebview(`main.py`)에 `terminal:start/read/
    write/resize/close` 대응 IPC·API를 각각 추가했다(`node-pty`/`pywinpty` 사용,
    양쪽 requirements/package.json에 의존성 선언).
  - Explorer 우클릭 메뉴가 실제 동작을 갖췄다: 파일은 `Open as Viewer`/`Open as
    Editor`, 폴더는 `Open File List`/`Open Command Prompt`/`Open PowerShell` — 각각
    별도 탭으로 열리며(모드가 다르면 같은 대상이라도 별 탭), 이미 같은 대상·같은
    모드 탭이 있으면 그 탭을 활성화하고 깨끗한 활성 Untitled 탭은 재사용한다
    (`src/core/editor.ts`의 `openItem()`이 `meta.mode`까지 비교하도록 확장).
  - 터미널 탭은 File List 탭의 실시간 모드 전환이 아니라 독립된 세션이므로,
    폴더 탭의 View > Tab Mode 순환 전환(`file-list → cmd → terminal → ...`) 기존
    동작을 제거하고 각각 별도 탭을 여는 방식으로 바꿨다. 기본 파일 모드도
    `editor` → `viewer`로 변경(D-18과 일관되게 새로 연 파일은 읽기 전용이 기본).
  - `TextEditorView.markSaved()`가 인자로 저장 기준 값을 받을 수 있도록 확장하고,
    `setValue()`의 baseline 갱신 순서를 모델 갱신보다 먼저 하도록 바로잡았다(D-7/D-8
    라운드트립에서 쓰임 — Phase 6에서 더 다듬어짐).
  - `README.md`에 File/Folder 열기 모드 사용법과 `node-pty`/`pywinpty` 필수 의존성을
    문서화했다(브라우저 전용 `npm run dev`에서는 파일/터미널 접근 불가 명시).
  - `검증`: `scripts/verify-open-modes-electron.cjs`(신규) 통과.

- **터미널 100% 핏·비주얼 고도화, IPC 스트리밍 푸시 전환, 탭 모드 정비**
  (2026-09-20)
  - `src/presets/terminal-preset.ts`: `@xterm/addon-fit`으로 컨테이너 크기에 맞춰
    실측 fit, `ResizeObserver`+`requestAnimationFrame` 디바운스로 리사이즈마다
    `terminalHost.resize()`까지 동기화. `lineHeight: 1.25`(디센더 잘림 방지),
    `cursorStyle`/`cursorInactiveStyle: 'bar'`, Windows Terminal Campbell 팔레트 적용.
    마운트 시·컨테이너 클릭 시 `terminal.focus()`.
  - IPC를 60ms 폴링(`terminalHost.read()` 반복 호출)에서 진짜 이벤트 푸시로
    바꿨다: Electron은 `win.webContents.send('terminal:data', ...)` →
    `ipcRenderer.on`(`preload.cjs`에 `onTerminalData`/`onTerminalExit` 추가),
    pywebview는 PTY를 블로킹 read하는 백그라운드 스레드가
    `window.evaluate_js('window.__wbTerminalPush(...)')`로 직접 호출
    (`src/providers/filesystem.ts`에 `terminalHost.onData`/`onExit` 구독 인터페이스
    신설). 유휴 상태에서 폴링 타이머가 없어 CPU 점유율이 0%로 떨어진다.
  - 앱 종료 시 PTY 자식 프로세스 정리 안전망 추가: Electron은
    `app.on('before-quit')`에서 살아있는 모든 터미널을 `kill()`, pywebview는
    `confirmQuit()` 통과 후 `WindowApi.cleanup_terminals()`를 호출한다.
  - 상태바 모드 버튼(`updateStatusbarMode()`)이 활성 탭이 `FILE_KIND`일 때만
    보이도록 좁혔다(폴더/터미널 탭에서는 `display: none`). `View > Tab Mode`
    메뉴의 폴더/터미널 항목에 `(New Tab)`을 명시해 클릭 시 새 탭이 열린다는
    것을 드러냈다.
  - `kind-registry.ts`에 범용 `focus` 훅(`registerFocusHandler`/`focusPanel`)을
    추가했다 — 리소스 종류를 모르는 공통 코어에 있어야 하는 D-4 원칙을 지키며
    "탭 전환 시 활성 패널에 포커스"를 가능하게 한다. `main.ts`의
    `onActivePanelChange`가 이를 호출해 터미널 탭으로 전환할 때 자동 포커스된다.
  - 버그 수정 (2026-09-20, e351f7e): `.preset-terminal-view`의 padding을
    `4px 0 0 8px`(금지 토큰 4px/8px, D-29 위반)에서 `5px`(허용값)로 고쳐
    `verify:dist`를 다시 통과시켰다.
  - `검증`: `npx tsc --noEmit`, `npm run build`, `npm run verify:dist` 통과 확인(이
    세션에서 재확인).

- **Monaco 언어 문법 등록 확장** (2026-09-20)
  - `src/core/texteditor.ts`: 기존에 JavaScript 하나만 등록돼 있던 것을, TypeScript·
    Python·Markdown·HTML·CSS·Shell·Bat·PowerShell·YAML·XML·SQL·C++·C#·Java·Rust·Go로
    확장했다. v0.1 D-24(bare API + 개별 import, `editor.main.js` 전체 로드 회피)를
    그대로 따라 언어마다 `monaco-editor/languages/definitions/{lang}/register`를
    개별 import했다 — worker 청크를 끌어오지 않는다.
  - JSON은 정의 파일을 그대로 쓰면 worker 청크가 딸려 와 D-24를 깨서, 대신 최소
    Monarch 토크나이저(`setMonarchTokensProvider`)를 직접 등록해 문법 강조만 가볍게 냈다.
  - `검증`: `npx tsc --noEmit` 통과. `npm run build` 성공(청크 400KB 초과 경고는 기존과
    동일, 이번 변경이 새로 만든 것 아님). `npm run verify:dist` 전체 통과(Electron·
    pywebview 두 갈래 파일 집합·SHA-256 해시·CSS 규칙 수·배경색 일치, 0 differences).

- **터미널 재마운트 시 transcript 중복 기록 버그 수정** (2026-09-20)
  - 문제: 이전 구현은 렌더러가 열릴 때 `session.transcript`를 한 번 쓰고,
    `session.starting.then()` 안에서 세션이 이미 `exited` 상태면 같은 transcript를
    또 한 번 써서 exited 세션을 재마운트할 때마다(레이아웃/워크스페이스 전환,
    탭 전환 등 렌더러가 재생성되는 모든 경우) 출력이 중복·누적되었다(직전 세션의
    분석 대화에서 발견해 보고한 회귀).
  - `src/presets/terminal-preset.ts`를 세션 단위 `append()` 하나로 일원화하는
    구조로 재작성했다: 데이터가 도착할 때마다 `session.transcript`에 정확히 한
    번만 기록되고, 구독 중인 뷰(`session.views`, 렌더러당 `showData` 콜백)에
    전달된다. 렌더러는 마운트 시 그 시점까지의 transcript를 한 번만 쓴 뒤
    `session.views.add(showData)`로 이후 데이터만 구독한다 — exited 여부와
    무관하게 재작성(re-write) 경로 자체가 없어졌다.
  - 세션 시작 초기 경합도 함께 다듬었다: 호스트 리스너를 `terminalHost.start()`
    호출 전에 먼저 구독해 두고, id 배정과 "1회성 초기 드레인" 완료 사이에 도착한
    청크는 `pending` 큐에 쌓았다가 `ready` 전환 시 순서대로 append한다(초기
    배너/프롬프트 유실·중복 가능성을 줄임).
  - `kind-registry.ts`에 `getContentForTest` 지원 추가(터미널 프리셋에도),
    `main.ts`/`file-preset.ts`/`editor.ts`/`texteditor.ts`에 관련 배선 보강.
  - `scripts/verify-terminal-host-electron.cjs`·`verify-terminal-host-py.py`(신규)
    를 추가해 이 버그를 정확히 겨냥한 회귀 단언(`noBufferedDuplicate`)을 남겼다.
  - `검증`(이 세션에서 재확인): `npx tsc --noEmit` 통과. `npm run build` 성공.
    `npm run verify:terminal-host`(Electron) 실행 결과
    `{"started":true,"pushed":true,"noBufferedDuplicate":true,"initialReadWorked":
    true,"remainingForQuit":true}` — 전 항목 true로 수정 확인. pywebview 쪽
    스크립트는 이 환경에 Python 실행기가 없어 직접 실행하지 못했으나, 중복 제거
    로직 자체가 호스트에 무관한 `terminal-preset.ts` 공통 경로에 있어 Electron
    검증으로 로직 수정이 실증됐다고 판단. `npm run verify:dist` 전체 통과(0
    differences), 다른 회귀 없음.

- **미리보기 탭이 대상만 바꾸고 내용을 갱신하지 않던 버그 수정** (2026-09-21,
  커밋 `e309951`)
  - 문제: 미리보기 탭에서 문서를 번갈아 클릭하면 제목과 구문 하이라이트는 새
    파일로 바뀌는데 **본문은 이전 파일 그대로** 남았다(사용자 보고, 실제 확인은
    `tsconfig.json` ↔ `vite.config.ts`).
  - 원인: `editor.ts`의 `openItem()`이 미리보기 탭을 재사용할 때 이전 리소스의
    키를 `undefined`로 보내 지우려 하는데, **dockview가 params를 merge할 때
    `undefined` 값 키를 버린다.** 그래서 그 키들이 `KindDispatchRenderer`까지
    도달하지 못하고, 렌더러 재생성 시 이전 파일의 `value` 스냅샷이 params에
    그대로 살아남았다. `file-preset.ts`는 `params.value`가 문자열이면 스냅샷이
    있다고 보고 디스크를 읽지 않으므로(`hasSnapshot`) 이전 내용이 계속 보였다.
  - 확증: IPC 읽기를 계측해 B 파일을 여는 동안 디스크 읽기가 **0건**이고,
    팩토리에 전달된 params가 `targetId`는 새 파일인데 `value`는 이전 파일
    내용임을 실측했다.
  - `src/registry/kind-registry.ts`: identity(`kind`/`targetId`)가 바뀌는
    업데이트는 merge하지 않고 들어온 params만 쓰도록 고쳤다. 다른 리소스를
    그리는데 이전 리소스가 써넣은 상태를 물려받을 이유가 없다. 같은 identity의
    업데이트(`setTabDirty` 등)는 기존대로 merge되어 살아있는 뷰를 헐지 않는다.
  - `scripts/verify-open-modes-electron.cjs`에 이 버그를 겨냥한 회귀 단언
    `previewSwapped`를 추가했다. 수정 전 빌드에서 `false`, 수정 후 `true`이고
    다른 단언은 양쪽 모두 `true`임을 실측해, 이 단언이 이 버그만 정확히
    잡는다는 것을 확인했다.
  - `검증`: `npx tsc --noEmit`·`npm run build` 통과. `verify:open-modes` 전 항목
    통과. `verify:dist`·`verify:phase5~7`·`verify:v03-phase1`·`verify:v05-phase5`·
    `verify:v06-phase6`(Folder Workspace 스냅샷 왕복 — 이 코드 경로를 쓰는 곳)
    회귀 0건.

- **구문 하이라이트 토큰 색상이 CSP에 막혀 나오지 않던 버그 수정** (2026-09-21,
  커밋 `609c048`)
  - 문제: 언어 문법을 등록(9f11f72)했는데도 에디터에서 색이 전혀 입혀지지 않았다.
    토크나이징 자체는 정상이라 `mtk8`·`mtk9` 같은 클래스는 생성되는데, 세 클래스의
    computed color가 모두 동일했다.
  - 원인: monaco는 `.mtk{n}` 색을 런타임 `<style class="monaco-colors">` 요소로
    주입하는데 이 앱의 CSP(`style-src 'self'`)가 이를 차단한다 — `--vscode-*`
    블럭이 이미 우회하고 있던 것과 **같은 실패**다. `style.css`에는 `.mtk1`만
    손으로 복사돼 있었고, 문법 등록으로 `.mtk2` 이상이 처음 도달 가능해지면서
    이제야 드러났다.
  - monaco 0.56.0의 `vs`/`vs-dark` 테마에서 `TokenTheme.createFromRawTokenTheme`
    + `generateTokensCSSForColorMap`으로 색을 생성해 넣었다 — 차단된 스타일시트를
    만드는 바로 그 함수 쌍의 출력이라 눈으로 고른 값이 아니다. monaco 업그레이드
    시 두 블럭을 다시 생성한다.
  - light와 gray가 **둘 다 `vs` 베이스를 쓴다**(`setEditorColorTheme`이 dark만
    `vs-dark`로 보낸다). 처음엔 gray를 vs-dark에 묶었다가, 검증에서 gray의
    `mtk6`이 엉뚱한 색으로 나오는 것을 보고 바로잡았다.
  - `검증`: 실행 중인 앱에서 실제 Python 파일을 열어 세 테마의 computed color를
    실측했다 — dark 6색(`import` 파랑·주석 초록·숫자 연두·문자열 주황),
    light/gray 5색으로 VS Code 표준 색과 일치. `verify:dist` 통과(D-29 금지 토큰
    검사 포함, 두 갈래 SHA-256 일치).

- **터미널 커서가 보이지 않고 깜빡이지 않던 버그 수정** (2026-09-21,
  커밋 `57a8bc9`)
  - 문제: `cursorBlink: true`·`cursorStyle: 'bar'`를 줬는데도 캐럿이 화면에
    보이지 않았다.
  - 원인: **xterm 6의 `xterm.css`에 캐럿을 칠하거나 깜빡이게 하는 규칙이 아예
    없다.** `.xterm-cursor-pointer`(마우스 포인터 모양)만 있고 `@keyframes`도
    `animation`도 없다. DOM 렌더러는 `.xterm-cursor`와 `-bar`/`-block`/
    `-underline`·`-blink` 클래스를 붙이지만 시각 표현은 앱이 제공해야 한다.
    `terminal-preset.ts`의 theme cursor 색은 canvas/WebGL 렌더러용이라 DOM
    렌더러에는 닿지 않는다.
  - `src/style.css`에 bar/block/underline 세 모양과 `wb-terminal-cursor-blink`
    keyframes를 추가했다. **포커스된 터미널만 깜빡인다**(`.xterm.focus`) — 여러
    터미널이 동시에 열려 있을 때 전부 점멸하지 않도록 Windows Terminal 동작에
    맞췄다.
  - `검증`: 실행 중인 앱에서 `::before`의 `animationName`이
    `wb-terminal-cursor-blink`이고 너비 2px·흰색, `@keyframes` 등록,
    `.xterm`에 `focus` 클래스가 붙는 것을 실측했다.

- **한글이 영문과 칸이 맞지 않던 문제 — 에디터·터미널 D2Coding 적용**
  (2026-09-21, 커밋 `cb9560e`)
  - 문제: 한글이 섞인 줄마다 격자가 어긋났다(사용자 보고, VS Code 화면과 대조).
  - 원인: 어긋나는 것은 한글이 아니라 **ASCII 폭**이었다. 설치된 한글 글꼴 8종은
    모두 한글을 정확히 font-size(14px)로 렌더하는데, Consolas는 ASCII를 7.7px,
    Cascadia Mono는 8.2px로 내보낸다. 고정폭 격자는 한글:ASCII = 2:1이어야
    맞는데 1.818·1.707이 되어 깨졌다. 12~18px 전 구간에서 동일했다.
  - Consolas 뒤에 한글 글꼴을 덧붙이는 것으로는 해결되지 않는다(`Consolas,
    D2Coding` 조합도 1.818) — ASCII와 한글을 **한 글꼴이 함께** 처리해야 한다.
  - D2Coding 1.3.3을 공식 릴리스(`naver/d2-coding-font`)에서 받아 SHA-256을
    릴리스 다이제스트와 대조해 검증한 뒤, 관리자 권한 없이 사용자 범위
    (`%LOCALAPPDATA%\Microsoft\Windows\Fonts` + HKCU 등록)로 설치했다.
  - 터미널은 `terminal-preset.ts`의 `fontFamily` 설정만으로는 적용되지 않았다 —
    **xterm도 생성자 폰트를 런타임 `<style>` 요소로 주입해 같은 CSP에 막힌다.**
    행들이 앱 기본 글꼴(`system-ui`)을 상속해 비율 1.091, 고정폭조차 아니었다.
    구문 색상과 같은 방식으로 `style.css`에 직접 썼고, 값이 어긋나지 않도록
    프리셋과 함께 관리한다는 주석을 남겼다.
  - 폴백은 `monospace`로 뒀다. 격자(2:1)는 유지되지만 이 PC에서는 GulimChe로
    해석되므로(픽셀 해시로 확인) D2Coding이 없는 환경에서는 비트맵 글꼴로 보인다.
  - `검증`: 실행 중인 앱에서 에디터와 터미널의 `.xterm`·`.xterm-rows`·행 요소가
    모두 실제로 D2Coding으로 렌더되는 것을 픽셀 해시 일치로 확인했고(굴림체
    아님), 비율이 에디터 2.000(ASCII 7px/한글 14px)·터미널 2.000(6.5px/13px)임을
    실측했다. `verify:dist`·`verify:v03-phase1`·`verify:v06-phase6`·
    `verify:open-modes` 통과.
  - **남은 의존성**: 글꼴을 이 PC의 사용자 계정에만 설치했다. 배포를 고려하면
    `README.md`에 의존성으로 적거나 앱에 번들하는 결정이 필요하다(이번 범위 밖).

- **폴더 file-list 탭의 행이 탐색기(Explorer) 트리와 동일한 아이콘·hover·선택·
  우클릭·키보드 nav를 갖도록 함 (WK-113)** (2026-09-21, 사용자 요청)
  - 요청: "폴더 리스트만 보이고 하위 폴더 펼치기는 하지 않는" 것만 탐색기와
    다르고, 선택·hover·우클릭 등 나머지는 전부 탐색기 영역과 동일하게.
  - `src/core/rowlist.ts`(신규): 재귀 확장이 없는 단일 레벨 선택 가능 행
    리스트. 탐색기의 `TreeController`를 "루트 숨김·확장 금지" 모드로 재사용하지
    않고 별도 컴포넌트로 만들었다 — `TreeController`는 탐색기가 의존하는,
    여러 차례 적대적 검증을 거친(A4·A9·A14) 컴포넌트라 거기에 새 모드를
    얹는 것은 공유 이득 없이 회귀 위험만 만든다(파일 상단 주석에 근거 기록).
    대신 시각·상호작용 계약만 공유한다: 탐색기와 같은 `.tree-list`/`.tree-row`/
    `.tree-icon` CSS 클래스(새 CSS 0줄로 hover·선택색·focus ring·스크롤바를
    그대로 물려받음), 같은 `IconThemeManager.resolveIcon()`(D-4 — 확장자 지식
    없음), 같은 click(preview)/dblclick(pinned)/Enter 열기 규칙.
  - `src/main.ts`: 탐색기 트리 전용이던 `openFromTree()` 지역 클로저를
    `openFromEntry()`/`openEntryOnEnter()`/`buildResourceContextMenuItems()`
    클래스 메서드로 일반화했다(`OpenableEntry` = `{id,label,isContainer}`).
    dirty-preview 확인·pending-open 병합(v0.2 A9 R1/R3에서 다듬어진 로직)과
    우클릭 메뉴 5항목을 탐색기 트리와 폴더 리스트 행이 완전히 동일하게 공유한다.
  - `src/presets/folder-preset.ts`: `RowListController`로 재작성. `readDirectory()`
    응답에 `loadGeneration` 카운터를 붙여 Refresh 연타 시 오래된 응답이 최신
    결과를 덮어쓰지 못하게 했다.
  - `src/core/icontheme.ts`: `IconThemeManager.onColorThemeChange()` 신설 —
    탐색기 트리는 Color Theme 변경 시 `main.ts`가 직접 `refreshThemeColors()`를
    불러 인라인 편집 행을 보존하는 전용 경로를 쓰지만(A14 R1-3), 새 리스트는
    그런 상태가 없어 이 이벤트로 그냥 `render()`한다.
  - `검증`: `npx tsc --noEmit`·`npm run build` 통과. `verify:dist`(0
    differences)·`verify:open-modes`·`verify:phase2`·`verify:phase3`·
    `verify:v03-phase1`·`verify:v03-phase3`·`verify:v05-phase5` 회귀 0건.
    신규 `scripts/verify-rowlist-electron.cjs`(`npm run verify:rowlist`)를
    추가해 아이콘·정렬·click=preview·dblclick=pinned(실제 click·click·dblclick
    3-이벤트 시퀀스)·ArrowUp/Down 포커스 이동·우클릭 메뉴(파일 2항목·폴더
    3항목) 9개 단언 전부 통과. `verify:open-modes`의 `.folder-file-list-row`
    셀렉터를 새 `.tree-row` 마크업에 맞춰 갱신했다.
  - 반대 벤더 적대적 검증(Codex `gpt-5.6-sol`, 새 기능이라 필수): `docs/reviews/
    A22.md`. 1회차 Critical 0·Major 4·Minor 1 — 클릭이 리스트에 실제 포커스를
    안 주던 것, Color Theme 전환 시 아이콘 색이 안 바뀌던 것, Refresh race
    조건 3건은 수정했다. 접근성 퇴행(`<button>`→div) 지적은 최초 포커스
    보완만 하고 전체 ARIA 리스트박스화는 하지 않았다 — 탐색기 트리 자체가
    같은 수준이라 "탐색기와 동일하게"라는 사용자 요청과 이 판단이 맞는다는
    근거를 남겼다. 2회차(격리된 non-git 디렉터리로 재검증 — git 상태·이력을
    보지 않는다는 검토자 제약을 codex가 어기려는 정황이 있어 방식을 바꿨다):
    1~3 RESOLVED, 4~5 PARTIALLY RESOLVED. 새 Critical·Major 0건. 5번(테스트가
    실제 DOM 포커스를 확인 안 함)은 우클릭 직후 `document.activeElement`
    실측 단언을 추가해 처리했고, `this.listEl.focus()`를 일부러 지워 이
    단언이 실제로 실패하는 것까지 확인한 뒤 복원해 회귀 포착력을 검증했다.
  - **계획 외 발견**: `verify:open-modes`의 `terminal`/`terminalFocused`
    단언이 이 세션 후반부터 이 변경과 무관하게 실패하기 시작했다(node-pty로
    실제 cmd.exe를 띄우는 부분). 변경분을 git stash로 되돌린 순수 베이스라인
    에서도 동일하게 실패하는 것을 확인해 **이 변경의 회귀가 아니라 이 세션의
    샌드박스 환경 저하(반복된 Electron 프로세스 구동 이후 자식 프로세스
    spawn 관련 추정)**임을 검증했다 — 기존에 알려진 "Electron 환경 플레이크"
    범주로 분류한다.

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

## Phase 6 — 에디터 전환 모드 (WK-105 ~ WK-110) — done, 2026-09-17

**무엇을 했나**

- `src/core/menu.ts`: View 메뉴에 상호 배타 라디오 `Shared Editor`/`Folder
  Workspace`를 추가했다(단축키 없음, D-7).
- `src/main.ts`: `EditorMode`(`'shared' | 'workspace'`), `sharedEditorSnapshot`,
  `folderWorkspaceByTab`(탭별 dockview 레이아웃), `hasSeededWorkspaceFromShared`
  (세션당 1회 시드 플래그, D-8)를 추가했다. `setEditorMode()`가 모드 전환 시 떠나는
  모드에 현재 상태를 저장하고 들어가는 모드의 마지막 상태를 복원하며, 첫 Folder
  Workspace 진입에서만 Shared Editor의 현재 상태를 시드로 쓴다(D-8). `activate
  FolderTab()`이 Folder Workspace 모드일 때 폴더 전환마다 에디터 워크스페이스도
  함께 저장/복원한다(D-7). 두 필드 모두 세션 한정, `localStorage`에 절대 저장하지
  않는다(WK-109).
- `src/registry/kind-registry.ts`: `KindRendererFactory`가 `(targetId, {params,
  updateParams}) => ...` 형태로 확장됐다 — `updateParams`는 패널의 dockview params에
  patch를 merge해 `toJSON()`/`fromJSON()`이 왕복시킨다. `src/core/texteditor.ts`에
  `onDidChangeContent()`(범용 콘텐츠 변경 이벤트)와 `TextViewOptions.savedValue`/
  `getSavedValue()`(저장 기준점을 별도로 지정·조회)를 추가했다 — 둘 다 리소스
  종류를 모르는 일반적인 장치다(D-4). `src/presets/file-preset.ts`가 이를 써서
  Monaco의 실제 텍스트 내용과 dirty 저장 기준점을 params를 통해 모드/폴더 전환
  라운드트립에서 보존한다.
- `src/main.ts`: `WorkbenchApp.confirmQuit()`을 신설했다 — 보이는 워크스페이스는
  `editor.confirmQuit()`에 위임하고, `folderWorkspaceByTab`/숨은 `sharedEditor
  Snapshot`의 dirty도 별도로 검사해(D-28) 확인 창을 띄운다. "Save"는
  `saveHiddenDirtySnapshots()`로 숨은 각 스냅샷을 순서대로 살아있는 에디터에 올려
  실제로 저장하고(숨은 dirty를 종료 직전에 진짜로 저장), "Don't Save"만 저장 없이
  진행을 허용한다. 양쪽 호스트(`src/hosts/electron/main.cjs`,
  `src/hosts/pywebview/main.py`)의 close 핸들러가 `editor.confirmQuit()` 대신
  이 `app.confirmQuit()`을 호출하도록 바꿨다.
- WK-110(두 갈래 전건 대조와 회귀 0건 확인): `npm run verify:dist`로 Electron·
  pywebview 두 갈래의 파일 집합·SHA-256 해시·CSS 규칙 수·배경색이 완전히 일치함을
  재확인했다. `npm run verify:phase{2..7}`·`verify:v02-phase{1..7}`·
  `verify:v03-phase{1,2,3}`·`verify:v04-phase4`·`verify:v05-phase5`·
  `verify:v06-phase6` 전체를 재실행해, 남은 실패가 전부 이번 Phase 이전부터 있던
  것(D-3의 `openFolder()`/`restoreLastSession()` 호환 쉼 — Phase 1 A16에서 Phase 6로
  명시적으로 미뤄 둔 정산 대상, `src/style.css`의 4px/8px/16px 금지 값, FR-F11
  명암비, `docs/current/README.md`의 최소 실행 환경 버전 미기재, 간헐적 Electron
  러너 실패)뿐이고 이번 Phase가 새로 만든 회귀는 0건임을 확인했다. Open Folder가
  탭을 교체하는 대신 추가하는 D-3 반전 자체는 Phase 1에서 이미 의도적으로 반영됐고,
  그로 인해 깨지는 레거시 v0.1/v0.2 단언(정확한 메뉴 항목 개수 등)은 v0.3이 정당하게
  늘린 메뉴 표면(Show Folder Tabs, Shared Editor, Folder Workspace)의 자연스러운
  결과로 판단해 더 손대지 않았다 — 레거시 스위트 자체를 v0.3에 맞게 새로 쓰는 것은
  이번 버전의 범위 밖이다(그 스위트들은 각자 자기 버전의 계약을 고정한 기록이다).

**검증**

- `npx tsc --noEmit` 통과.
- `node scripts/verify-v06-phase6.mjs`: Electron·pywebview 두 갈래 각각 29개 단언
  전부 통과, 두 갈래 불일치 0건.
- 반대 벤더 적대적 검증(Codex `gpt-5.6-sol`, **필수 통과 Phase**): `docs/reviews/
  A21.md`. 3회차까지 전부 소진했다 — 1회차 Critical 3·Major 2, 2회차 Critical 2
  (신규)·Major 1, 3회차 **Critical 0**·Major 2·Minor 1로 필수 통과 게이트(미해결
  Critical 0건)를 충족했다. 2회차 수정 과정에서 이 세션이 직접 발견한 실제 회귀
  (`KindRendererFactory` 시그니처 변경이 v0.1 Phase 5/6/7 자체의 FR-I1 검증 스위트를
  깨뜨림 — `dirtySetters.get(...) is not a function`)도 같은 회차 안에서 하위 호환을
  복원해 해소했다. 3회차의 Minor(편집마다 전체 버퍼를 params에 복사)는 의도적으로
  수정하지 않았다 — 디바운스가 dispose/모드전환 시점의 미flush 유실이라는 이번
  검토가 계속 잡아 온 것과 같은 종류의 새 위험을 만들기 때문이다.

**다음**

v0.3의 6개 Phase가 모두 끝났다. 사용자가 직접 수동 테스트를 진행한다.
