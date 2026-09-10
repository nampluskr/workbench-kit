> 버전: v0.2 · 작성일: 2026-09-10

# PROGRESS — workbench-kit v0.2

> 에이전트가 진행하며 append한다. 사람이 미리 쓰지 않는다.
> 계획(`PLAN.md`·`backlog.json`)과 설계 결정(`DECISIONS.md`)은 여기 담지 않는다.

## 1. 계획한 것

`backlog.json`의 task를 닫을 때마다 **무엇을 했나 · 결과 · 검증**을 남긴다.
필수 통과 Phase(1 · 4 · 7)는 반대 벤더 적대적 검증 기록(`docs/reviews/A{n}.md`)이
없으면 닫지 않는다.

- **WK-049** (임시 자리 열기와 대체 규칙)
  - **무엇을 했나**: `EditorController`에 임시/확정 개념을 넣었다 — `EditorOpenMode`(`preview` | `pinned`), `openItem`의 `mode` 옵션(기본 `preview`), `getPreviewPanel(group)`, 패널 params의 `isPreview`. `openItem`이 v0.1의 "활성 탭을 제자리에서 교체" 규칙을 버리고, 그 칸의 임시 자리를 찾아 대체하거나 없으면 새로 만든다. `[+]`가 만드는 `Untitled`은 **확정** 탭으로 두어(FR-P10의 "칸당 임시 자리 최대 1개") 훑어보기가 사용자가 만든 자리를 덮지 않게 했다.
  - **결과**: 한 번 클릭이 임시 자리에 열리고, 다음 클릭이 같은 자리를 대체한다. 파일과 폴더가 같은 규칙을 쓴다(`FR-P1` ~ `FR-P3`). 다섯 번 연속 클릭 후에도 임시 탭이 1개다(`FR-P10`).
  - **검증**: `npm run verify:v02-phase1` — `V2P1-FR-P1`·`P2`·`P3`·`P10`. 판정은 화면에서 한다(NFR-3): 임시 여부를 params가 아니라 **렌더된 탭 제목의 computed `font-style`**로 읽는다.
- **WK-050** (확정 경로 — 더블클릭 두 갈래)
  - **무엇을 했나**: 트리의 `dblclick`이 파일이면 새 `emitConfirm`을, 폴더면 기존 `toggleExpand`를 부르도록 갈랐다(D-2). 탭 제목 더블클릭 확정은 `EditorController` 생성자에서 컨테이너에 **위임 리스너**로 걸었다 — dockview가 탭 요소를 다시 만들기 때문에 탭마다 붙인 리스너는 재배치 때 조용히 사라진다. 닫기 버튼 위의 더블클릭은 제외한다("치워라"는 "붙잡아라"가 아니다).
  - **결과**: 파일 더블클릭과 임시 탭 제목 더블클릭이 확정하고, 폴더 더블클릭은 확정하지 않고 펼친다. 그때 열려 있던 임시 자리는 임시인 채로 남는다(`FR-P4` ~ `FR-P6`).
  - **검증**: `V2P1-FR-P4`·`P5`·`P6-FILE`·`P6-FOLDER`. `FR-P5`는 펼침으로 행 수가 늘어난 것과 임시 표시가 유지된 것을 **함께** 본다.
  - **추가 — 끌기 확정(`FR-P13`)**: A9 3회차가 "임시 탭이 모인 칸에서 한쪽을 자동 확정"하던 1회차 수정을 D-1 위반(Critical)으로 지적했다. `FR-P10`(칸당 임시 1개)과 D-1(확정할 때만 남긴다)이 끌기에서 충돌하는 명세 문제라, 세 안(가: 끌기 = 확정 / 나: 대상 칸 임시 대체 / 다: 끌어놓기 거부)을 올려 **사람이 가를 결정**했다(2026-09-10). `DECISIONS.md` D-2 · `SPEC.md` `FR-P13` · `PLAN.md` Phase 1에 반영하고, `onDidMovePanel`에서 다른 칸으로 옮겨진 탭만 확정한다. 자동 확정 정리는 옮김 처리 뒤에 도는 안전망으로만 남겼다. 검증 `V2P1-FR-P13-DRAG`·`P13-REORDER`.
- **WK-051** (트리 키 — 오른쪽 화살표와 Enter)
  - **무엇을 했나**: 트리의 `Enter`를 `emitOpen`에서 `emitConfirm`으로 바꿨다. `→`는 손대지 않았다 — 폴더만 펼치고 파일에는 걸리지 않는 기존 구현이 `FR-T1`·`FR-T2`를 그대로 만족한다. `main.ts`가 `onOpen` → `preview`, `onConfirm` → `pinned`로 잇는다.
  - **결과**: `Enter`가 이미 임시로 열린 것을 가리키면 그것을 확정하고, 아직 안 열려 있으면 바로 확정된 자리로 연다(`FR-P7`). `→`로 펼친 뒤 `Enter`를 눌러도 펼침이 유지된다(`FR-T3`).
  - **검증**: `V2P1-FR-T1`·`T2`·`T3`·`P7-FRESH`·`P7-PREVIEW`. `FR-T2`는 행 수와 탭 수가 **둘 다** 그대로인 것을 본다.
- **WK-052** (확정 뒤 새 임시 자리)
  - **무엇을 했나**: `openItem`의 대체 대상을 "활성 탭"이 아니라 "그 칸의 임시 자리"로 좁힌 결과로 자연히 성립한다. 확정된 탭은 대체 후보가 아니다.
  - **결과**: 확정된 자리가 있는 상태에서 다른 것을 한 번 클릭하면 자리 수가 늘고 그중 정확히 1개가 임시다(`FR-P8`).
  - **검증**: `V2P1-FR-P8`.

- **WK-053** (임시와 확정의 시각 구분)
  - **무엇을 했나**: Phase 1의 이탤릭 표시를 세 색 테마에서 판정했다. 코드 변경은 없다.
  - **결과**: 세 테마 모두에서 임시·확정 제목의 기울기가 다르고 두 제목이 배경과 대비를 갖는다(`FR-P9`).
  - **검증**: `V2P2-FR-P9` — 테마를 View 메뉴로 바꾸며 제목 글자색과 실제로 칠해진 배경의 대비를 측정(최소 3.43:1).
- **WK-054** (영역 순환 — F6과 Ctrl+Tab의 구분)
  - **무엇을 했나**: `src/core/focusareas.ts` 신설. 현재 영역을 따로 기억하지 않고 `document.activeElement`에서 읽는다 — CSS가 그리는 포커스 표시(`:focus`·`:focus-within`)와 컨트롤러가 믿는 영역이 어긋날 수 없다. `F6`·`Shift+F6`은 보이는 트리와 칸을 **화면 읽기 순서**(위→아래, 왼쪽→오른쪽)로 순환하고, 키가 **탭 안 보기 안에서 눌렸으면 손대지 않는다**(v0.1 `FR-I6`, D-10 사람 결정). `Ctrl+Tab`·`Ctrl+Shift+Tab`은 `EditorController.cycleActivePanel()`로 활성 칸 안에서만 돈다. 칸으로의 포커스 이동은 `focusGroup()`이 칸을 활성으로 두고 내용 영역(`tabindex=-1`)에 포커스를 준다. 숨겨진 탐색기(접힘·Zen)는 영역에서 뺀다.
  - **결과**: `FR-F1` · `FR-F2` · `FR-F4`. `Tab`은 예약하지 않아 버튼 이동과 에디터 들여쓰기가 v0.1 그대로다.
  - **검증**: `V2P2-FR-F1`(정방향·역방향 순서) · `F1-ORDER`(만든 순서와 화면 순서가 다른 배치에서 화면 순서) · `F1-TAB`(에디터 안 `Tab`) · `F1-F6-VIEW`(에디터 안 `F6`은 영역 불변·기본 동작 막지 않음) · `F2` · `F4`. v0.1 `P5-FR-R1A`(FR-I6의 `F6` 예시) 통과.
- **WK-055** (영역 전환이 상태를 바꾸지 않는다)
  - **무엇을 했나**: 영역 이동은 포커스만 옮기고 선택·활성 탭을 건드리지 않게 했다. 탐색기 빈 곳 누르기는 `FocusAreaController`가 받아 `TreeController.ensureCursor()` 후 트리에 포커스를 준다 — 선택이 있으면 그대로 두고, 없으면 처음 보이는 행을 고른다. 아무것도 열지 않는다.
  - **결과**: `FR-F3` · `FR-F5`.
  - **검증**: `V2P2-FR-F3`(F6 한 바퀴 전후 트리 선택·각 칸 활성 탭 동일) · `F5`(선택 유지 경우와 Escape로 선택을 비운 경우 둘 다).
- **WK-056** (선택 배경과 포커스 표시의 분리)
  - **무엇을 했나**: 트리 커서의 테두리를 `.tree-list:focus` 아래에서만 그리게 바꿨다(선택 배경은 그대로). 칸은 `.dv-groupview:focus-within`일 때만 활성 탭에 테두리를 그려, 포커스를 가진 요소가 하나뿐이므로 테두리도 최대 하나다. 칸 내용을 누르면 포커스가 칸 밖에 남아 있을 경우 그 칸으로 끌어온다(위임 `pointerdown`) — 에디터·버튼처럼 스스로 포커스를 가져간 곳은 그대로 둔다. 테두리 색은 강조색이 아니라 **글자색 토큰**을 쓴다: 강조색은 회색 테마 배경과 1.9:1밖에 안 된다. 새 색 토큰은 만들지 않았다(v0.1 테마 토큰 검사).
  - **결과**: `FR-F6` · `FR-F10` · `FR-F11`.
  - **검증**: `V2P2-FR-F6`(포커스를 칸으로 옮기면 선택 배경 동일·테두리만 사라짐) · `F10`(모든 칸의 활성 탭 배경 유지, 테두리 정확히 1개, 칸을 옮기면 따라감) · `F11`(세 테마에서 테두리 대비 5.05~16.48:1, 선택 배경이 사이드바와 구분, hover≠선택).
- **WK-057** (트리 커서와 활성 자리의 독립)
  - **무엇을 했나**: 기존 코드가 이미 만족하는 것을 확인했다 — 활성 탭 변경 핸들러는 트리를 건드리지 않고, 방향키는 `emitSelect`만 하며 `scrollItemIntoView`로 스크롤한다.
  - **결과**: `FR-F7` · `FR-F8` · `FR-F9`.
  - **검증**: `V2P2-FR-F7` · `F8` · `F9`(행 40개로 넘치는 트리에서 `End` 뒤 커서 행이 보이는 영역과 겹치고 스크롤됨).
- **WK-058** (상단 바 우측 다섯 배치와 상태 표시)
  - **무엇을 했나**: `layout.ts` 상단 바 오른쪽에 Zen · 색 테마 버튼을 창 제어 앞에 두었다. 아이콘은 클릭이 아니라 **상태에서** 그린다 — `ThemeManager.onThemeChange`와 새 `ViewStateManager.onZenChange`(진입 · 해제 모두 알림)를 구독하므로 `F11` · `Escape` · View 메뉴가 별도 경로 없이 같은 아이콘을 갱신한다. Zen은 `screen-full` / `screen-normal`, 테마는 흰색 · 회색 · 검정마다 다른 codicon.
  - **결과**: `FR-C1` · `FR-C2` · `FR-C3` · `FR-C11`.
  - **검증**: `V2P3-FR-C1`(다섯 요소가 보이고 x좌표 순서) · `C2` · `C3`(아이콘이 실제로 그리는 글리프 = 계산된 `::before` content로 판정) · `C11`(키 · 메뉴로 바꿔도 같은 글리프).
- **WK-059** (세로 띠 정리와 위아래 방향 맞춤)
  - **무엇을 했나**: 세로 띠 기본 항목을 상단 바 토글 · 탐색기 토글(위), 하단 바 토글(아래)만 남기고 분할 · Zen · 테마를 뺐다. `main.ts`의 사라진 항목 바인딩도 지웠다.
  - **결과**: `FR-C4` · `FR-C5` · `FR-C6`. 칸 머리와 메뉴의 분할 경로는 그대로다.
  - **검증**: `V2P3-FR-C4` · `C5`(세로 띠 분할 0개 + 칸 머리 · 메뉴 분할이 실제로 칸을 늘림) · `C6`(보이는 항목의 y좌표로 맨 위 · 맨 아래 판정, 각 토글이 자기 영역만 감추고 되돌림).
- **WK-060** (상단 바 프로그램 정보 한 줄)
  - **무엇을 했나**: 가운데 창 제목을 햄버거 바로 오른쪽의 좌측 정렬 한 줄로 바꿨다. 버전과 **마지막 커밋일**은 `vite.config.ts`의 `define`으로 빌드 때 넣는다(두 갈래가 같은 산출물을 읽으므로 갈래별 설정 없음 — NFR-2). 갈래 이름은 실행 중에 판별해 `Electron` / `PyWebView`로 쓴다. 빈 가로 구간은 `titlebar-spacer`가 창 끌기 영역을 이어받는다(v0.1 FR-N2).
  - **결과**: `FR-C7` · `FR-C8` · `FR-C9`.
  - **검증**: `V2P3-FR-C7`(형식 정규식 · 햄버거 오른쪽 · 창 중앙 왼쪽) · `C8`(러너가 `git log -1 --format=%cs`와 `package.json`에서 **빌드와 독립적으로** 읽은 기대값과 일치) · `C9`(대소문자까지).
- **WK-061** (하단 바 오른쪽을 앱에게 넘긴다)
  - **무엇을 했나**: 하단 바의 앱 정보 자리(`statusbar-app-info`)를 없앴다. 프리셋 정보(앱 항목)는 그대로다.
  - **결과**: `FR-C10`.
  - **검증**: `V2P3-FR-C10`(하단 바 오른쪽 텍스트에 프로그램명 · 버전 · 갈래 0건, `Presets` 있음).
- **v0.1 회귀 처리 (Phase 3)**: 대체 목록(0.1절, 이번 Phase 전에 네 행 보완)에 따라 v0.1 단언을 v0.2 동작으로 고쳤다 — `P4-FR-D3-ACTBAR` · `P4-FR-J8-PATH2`(세로 띠 분할 경로가 **없음**을 확인, 남은 메뉴 경로의 칸 수 조정), `P5-FR-N10-SLOTS`(껍데기 자리 둘), `P7-FR-N1`(프로그램 정보가 왼쪽), `P7-FR-N9`(하단 바에 앱 정보 없음 · 상단 바 정보가 실제 `package.json` 버전과 갈래), `P7-FR-M1-ACTBAR`(상단 바 테마 버튼), `P7-FR-M4`(추적 아이콘을 남아 있는 세로 띠 아이콘으로). ID는 유지해 v0.1 매트릭스가 그대로 해석된다.
  - **검증**: `npm.cmd test` — v0.1 Phase 1~7 · v0.2 Phase 1·2·3 두 갈래 전건 0 failures.

- **WK-062** (File 메뉴 구조)
  - **무엇을 했나**: `menu.ts`를 다시 세웠다. `DEFAULT_FILE_ITEMS`가 `Open Folder...` · 구분선 · `Recent Folders`(하위 메뉴) · 구분선 · `Split Right` · `Split Down` · `Close Active Tab` · `Close Editor Group` · `Close All Tabs` · 구분선 · `Exit` 여덟 항목이다. 하위 메뉴는 `setSubmenuProvider(id, fn)`로 **열 때마다** 목록을 읽어 그린다 — `Recent Folders`는 저장된 경로를 매번 새로 읽으므로 목록이 낡지 않는다. 각 경로 행 오른쪽에 `codicon-close` 지우기 버튼(`secondaryAction`)이 있고, 비면 `(Empty)` 한 행(지우기 없음 · 비활성)이다. `main.ts`가 `file:split-right/down` → `editor.splitActiveGroup`, 세 닫기 → 각각 `closeActiveTab` · `closeAllTabsInGroup` · `closeAllTabs`를 잇는다.
  - **결과**: `FR-M1` · `FR-M6` · `FR-M7`. v0.1 `FR-N6`(다섯 항목) · `FR-N6c`(폴더 닫기) · `FR-I9`(앱 항목 다섯 위) 대체.
  - **검증**: `V2P4-FR-M1`(렌더된 여덟 항목의 라벨 · 순서 · 전부 보임 · 그 밖 0개) · `V2P4-FR-M6`(구분선 위치) · `V2P4-FR-M7-LIST`/`-REMOVE`/`-KEYBOARD`/`-EMPTY`(목록 · 지우기 후 재열기 · `F10`→화살표→`Delete` · `(Empty)`).
- **WK-063** (View 메뉴 구조)
  - **무엇을 했나**: `DEFAULT_VIEW_ITEMS`가 `Color Theme`(하위) · 구분선 · `Icon Theme`(하위) · 구분선 · `Zen Mode` · `Show Sidebar` · `Show Title Bar` · `Show Status Bar` · 구분선 · `Preset Info` 일곱이다. `Color Theme`는 `White` · `Gray` · `Dark`, `Icon Theme`는 `VS Code Built-in` · `VS Code Icons`(`Simple` 없음). 현재 값에 `codicon-check`. 순환 · 아이콘 테마 토글은 셋/둘 중 하나를 고르는 방식이 됐지만 상단 바 테마 아이콘의 흰색→회색→검정 순환은 그대로다. `우클릭 메뉴 사용` 스위치는 View에서 빠졌다(앱이 `setContextMenuEnabled`로 켠다). `Preset Info`가 뷰 제목줄에서 여기로 왔다(D-6).
  - **결과**: `FR-M2` · `FR-M6` · `FR-M8` · `FR-M9` · `FR-M12`. v0.1 `FR-N7` · `FR-G6`(스위치) · `FR-Q1a`(토글) · `FR-D3`/`FR-J8`(메뉴 경로가 View→File) 대체.
  - **검증**: `V2P4-FR-M2` · `V2P4-FR-M8`(고르면 화면이 그 테마로 칠해지고 그 행만 표시) · `V2P4-FR-M9`(트리 아이콘이 실제로 다시 그려지고 `Simple` 0건) · `V2P4-FR-M12`(눌러서 상태바에 프리셋 정보).
- **WK-064** (단축키 표시와 실제 동작의 일치)
  - **무엇을 했나**: 단축키 칸을 `shortcut`이 있는 행에만 만든다(빈 칸 0개). 다섯: `Open Folder.../Ctrl+O` · `Close Active Tab/Ctrl+W` · `Exit/Alt+F4` · `Zen Mode/F11` · `Show Sidebar/Ctrl+B`. `main.ts`에 `Ctrl+B`(→ `toggleSidebar`)와 `Alt+F4`(→ `handleExitRequest`, 메뉴와 같은 닫기 확인 경로) 전역 키를 더했다. `Alt` 없는 `F4`는 예약하지 않는다.
  - **결과**: `FR-M4` · `FR-M5`. `docs/reserved-keys.md` 1절에 `Ctrl+B` · `Alt+F4` 행 추가.
  - **검증**: `V2P4-FR-M4`(다섯 행에만 표기 · 라벨 오른쪽 · 행 오른쪽 끝 정렬 · 나머지 0건) · `V2P4-FR-M5-CTRLO`/`-CTRLW`/`-ALTF4`/`-F11`/`-CTRLB`(키와 메뉴 행이 같은 결과, `Alt+F4`는 실제 호스트 닫기 게이트가 저장 안 한 탭을 묻고 취소가 앱을 살려 둔다).
- **WK-065** (하위 메뉴 표시와 Help)
  - **무엇을 했나**: File · View · Help의 하위 메뉴 표시와 세 하위 메뉴 행 표시를 `codicon-chevron-right` `<i>`로 바꿨다(텍스트 `▶` 삭제). Help는 `About` 하나이고 누르면 `AboutDialogController`가 정보 창을 연다.
  - **결과**: `FR-M11` · `FR-M3`. v0.1 `FR-N8` 대체.
  - **검증**: `V2P4-FR-M11`(세 chevron이 같은 실측 글리프로 보이고 메뉴 텍스트에 `▶` · `>` 0건) · `V2P4-FR-M3`(항목 하나 · 눌러서 정보 창이 화면에).
- **WK-066** (세 닫기 명령)
  - **무엇을 했나**: `EditorController.closeAllTabs()`를 더했다(열린 모든 탭, 각 저장 확인, 첫 취소에서 멈춤, 마지막 칸은 빈 칸으로). `Close Editor Group`은 기존 `closeAllTabsInGroup`, `Close Active Tab`은 `closeActiveTab`. 세 자리(세로 띠 · 칸 머리 · 우클릭) 모두 칸 닫기 항목 0개.
  - **결과**: `FR-M10`. v0.1 `FR-D8` · `FR-J6`("세 자리 모두 0개")를 "메뉴에 1개, 나머지 0개"로 대체(D-5). v0.1 `FR-J2` ~ `FR-J4`의 View 자리가 File로.
  - **검증**: `V2P4-FR-M10-TAB`/`-GROUP`/`-ALL`(자리 3개 · 칸 2개에서 각각 실행해 자리 · 칸 수 변화가 정의와 같다) · `V2P4-FR-M10-ELSEWHERE`(세로 띠 · 칸 머리에 close 0건, 우클릭엔 앱 항목만).
- **WK-067** (분할로 생기는 칸의 임시 자리)
  - **무엇을 했나**: 사용자 분할 경로(`EditorHeaderActionsRenderer`의 두 버튼 · `splitActiveGroup` = File 메뉴 · `Ctrl+\`)를 새 `splitGroupForUser`로 모았다 — `addPanel` 한 번으로 새 칸과 그 안의 `Untitled` 임시 탭을 함께 만들어, 빈 칸이 잠깐도 존재하지 않는다. 낮은 수준 `splitGroup`(빈 칸)은 `openBeside`의 내부용으로 남겼다. `openItem`에 `isBlankSpot` 갈래를 더해, 대상 없는 `Untitled` 임시 자리는 확정 열기(`pinned`)도 그 자리를 재사용한다 — 그래서 분할 뒤 첫 열기가 빈 탭을 옆에 만들지 않는다.
  - **결과**: `FR-P11` · `FR-P12`. 분할 직후 새 칸의 자리 수 1 · 제목 `Untitled` · 임시 표시. 그 자리만 닫으면 칸도 닫힌다(마지막 탭 규칙).
  - **검증**: `V2P4-FR-P11-RIGHT`/`-DOWN`(칸 머리 버튼 · File 메뉴로 나눈 새 칸의 위치 · 자리 수 1 · `Untitled` · 기울기가 확정과 다름) · `V2P4-FR-P12`(그 자리만 닫으면 칸 수 1 줄고 마지막에 빈 칸 1개).
- **v0.1 회귀 처리 (Phase 4)**: 대체 목록(0.1절)대로 v0.1 단언을 v0.2 동작으로 고쳤다 — `phase4-suite.js`의 메뉴 분할 경로를 View→File(`file:split-down`), `view:close-active-tabs`→`file:close-editor-group`(`FR-J2` · `FR-J4`), `FR-D8-MENU`/`FR-J3-VIEWMENU`를 "칸 닫기 명령이 메뉴에 정확히 1개(File)"로. `phase5-suite.js` `FR-I9`는 앱 표면(`addFileMenuItem`)으로 앱 항목을 넣고 확인. `phase6-suite.js` `FR-N6A-PICKER`는 `Recent Folders` 하위 메뉴에서 읽음. `phase7-suite.js` `FR-N6`(여덟 항목) · `FR-N7`(일곱 항목) · `FR-N8`(`About`) · `FR-M1`(`Color Theme` 하위 메뉴) · `FR-Q1A`(`Icon Theme` 하위 메뉴) · `FR-N6C`(File에 `Close Folder` 0개). `verify-phase3.mjs`(`file:close-folder` 미배선) · `verify-phase4.mjs`(`Close Editor Group`) · `verify-dist.mjs`(`view:icon-theme`). ID는 유지.
  - **검증**: `npm.cmd test` — v0.1 Phase 1~7 · v0.2 Phase 1~4 두 갈래 전건 0 failures.

- **A12 반대 벤더 검토 반영** (Phase 4, **필수 통과** — 3회로 한도, 3회차 미해결 Critical 0건)
  - **Critical 2건 수정**: (1) 예약 키(`Ctrl+O/W/\/B` · `Alt+F4` · `F10` · `F11` · `Escape` · 우클릭 메뉴 키)를 버블에서 **캡처 단계**로 옮겨, 포커스가 탭 안 보기에 있고 그 보기가 `keydown`에서 `stopPropagation()`을 불러도 껍데기가 먼저 받는다(`reserved-keys.md` §1). (2) `confirmCloseAll`이 대량 닫기에서 저장 안 한 패널을 **모두 먼저** 확인하고 취소 시 아무것도 안 바꾸고 중단한다 — `isDirty`는 건드리지 않는다(중간에 지우면 뒤 패널 취소 때 앞 패널이 거짓 저장됨으로 남았다).
  - **Major 8건 · Minor 1건 반영**: 수정자 붙은 `F11` · 메뉴 · 우클릭 메뉴 키를 앱에 넘김(`metaKey` 포함). 대량 닫기 취소 시 원상태 유지. 표기된 단축키가 열린 햄버거 메뉴를 닫음. `Delete`는 지우기 버튼이 있는 행(`Recent Folders`)에서만 예약. 하위 메뉴 화면 밖 넘침을 오른쪽 → 왼쪽 뒤집기 → 뷰포트 클램프로 처리. Git 없는 사본 날짜 폴백(A11에서 이어짐).
  - **검증**: `V2P4-CAPTURE-KEYS` · `V2P4-FR-M10-CANCEL` · `V2P4-FR-M9`(Delete 범위). `npm.cmd test` 전건 0 failures. 기록 `docs/reviews/A12.md`.
  - **최소 창 폭 · 세로 넘침**: A11 R1-4와 같이 이번 범위 밖으로 기록(어느 요구에도 없음).

- **WK-068** (탐색기 제목 고정)
  - **무엇을 했나**: `main.ts`의 `onRootChange`가 제목을 루트 폴더명으로 바꾸던 것을 없앴다. 제목은 처음부터 `EXPLORER` 고정이고, 열린 폴더명은 트리의 루트 행에 보인다.
  - **결과**: `FR-X1`. v0.1 구현이 UT-EXP-001과 어긋난 것을 고쳤다(v0.1 SPEC엔 제목 요구 없음).
  - **검증**: `V2P5-FR-X1`(폴더 열기 전후 모두 `EXPLORER`, 루트 폴더명 0건).
- **WK-069** (뷰 제목줄 액션 넷)
  - **무엇을 했나**: `layout.ts` 뷰 제목줄에 `New File` · `New Folder` 버튼을 더하고 순서를 `[앱 액션] New File · New Folder · Refresh · Collapse All`로 맞췄다. `sidebar.ts`(`ExplorerTitlebarController`)를 새 시그니처로 다시 썼다 — 네 버튼 + 트리. `main.ts`의 `Preset Info` 뷰 액션 배선을 지웠다(`Preset Info`는 Phase 4에서 `View` 메뉴로 갔다).
  - **결과**: `FR-X2` · `FR-X3`. v0.1 `FR-A20`(둘) · `FR-A24`(앱 없으면 둘) · `FR-I10` 일부(왼쪽 앱 액션)를 대체.
  - **검증**: `V2P5-FR-X2`(넷이 보이고 x좌표 순서) · `V2P5-FR-X3`(제목줄에 프리셋 정보 부르는 요소 0개). `P5-FR-I10`(앱이 표면으로 액션을 넣으면 넷의 왼쪽).
- **WK-070** (만들기 인라인 입력 장치)
  - **무엇을 했나**: `New File` → `type: 'leaf'`, `New Folder` → `type: 'container'`로 `tree.promptNewItem`을 부른다. 부모는 `tree.resolveNewItemParentId()`가 **generic `isContainer`만 보고** 정한다(포커스가 컨테이너면 그 안, 리프면 그 부모, 아니면 루트). `onCommit`이 앱이 등록한 `setNewItemHandler`로 이름 · 타입 · 부모를 넘긴다 — 껍데기는 만들지 않는다. `main.ts`의 예시 핸들러는 상태바 메시지만 낸다. 앱 표면에 `setSidebarNewItemHandler`를 더했다.
  - **결과**: `FR-X4`. v0.1 `FR-A23`(앱이 꽂은 액션 → 껍데기 액션)을 대체. v0.1 D-30의 "껍데기는 파일을 만들지 않는다"는 그대로.
  - **검증**: `V2P5-FR-X4`(입력 행 1개 · `Enter` → 앱 호출 1건 · 이름 그대로 · 타입 generic · 껍데기 생성 행 0 · `Escape` → 앱 호출 0). `P7-FR-A23-*`도 껍데기 버튼 기준으로 갱신.
- **WK-071** (탐색기 폭 조절)
  - **무엇을 했나**: `layout.ts`에 `#sidebar-resize-handle`을 탐색기와 편집 영역 사이에 뒀다. `main.ts` `setupSidebarResize()`가 `pointerdown`→`pointermove`(+ `pointercancel` · 창 `blur` 정리 · `setPointerCapture`)로 `--sidebar-width`를 갱신한다(clamp: 최소 폭 — `EXPLORER` + 껍데기 액션 넷 + 앱 액션 여유가 잘리지 않는 값, 최대 창 폭의 60%). **저장하지 않는다**(D-8) — 다시 열면 CSS 기본값 240px. Zen · 탐색기 숨김 때는 손잡이가 안 보인다. 키보드 경로: 손잡이 `tabindex="0"` + 화살표 · `Home` · `End`(`reserved-keys.md` 3b · 5절, NFR-8).
  - **결과**: `FR-X5` · `FR-X6` · `FR-X7`.
  - **검증**: `V2P5-FR-X5`(`pointermove`마다 재서 중간 폭 3개 이상 · 편집 영역이 정확히 그만큼 줄어듦) · `V2P5-FR-X5-KEYBOARD`(손잡이 포커스 · 화살표 · `Home`) · `V2P5-FR-X6`(앱 액션 여럿을 더 등록해도 제목 전체 · 껍데기 액션 넷이 탐색기 안 · 더 안 줄어듦) · `V2P5-FR-X7`(모든 드래그 전후 `localStorage` 스냅샷 동일 + 변수 제거 = 초기값). Electron 러너가 폭을 실제로 바꾼 뒤 창을 다시 만들어 240px 복귀를 확인한다(SPEC divergence X-5).
- **WK-072** (트리 들여쓰기와 세로 정렬선)
  - **무엇을 했나**: **핵심 발견 — 이 앱의 CSP(`style-src 'self'`)가 인라인 `style=` 속성을 통째로 막는다**(dockview CSS와 같은 사고). v0.1 트리는 들여쓰기를 `style="padding-left"`, 정렬선을 `style="left"`로 넣고 있어 **화면에 전혀 반영되지 않았다** — 사용자가 본 "어긋남"의 정체다. 깊이마다 `<span class="tree-indent-unit">`을 조상 수만큼 앞에 두는 **구조적 들여쓰기**로 바꿨다. 각 unit이 자기 계층의 세로선을 `::before`로 그린다. `.tree-row`의 기본 왼쪽 여백은 스타일시트로 옮겼다. 세 렌더 경로(`render` · `renderTreeListOnly` · 입력 행) 모두 고쳤다.
  - **결과**: `FR-X8` · `FR-X9`. 설계 변경이 아니라 CSP에 막혀 안 보이던 v0.1 구현을 화면에 나오게 고친 것.
  - **검증**: `V2P5-FR-X8`(깊이마다 내용 시작 x가 부모보다 14px씩 큼) · `V2P5-FR-X9`(각 세로선이 `::before`로 실제로 그려지고 해당 깊이의 들여쓰기 x에 있으며 왼쪽 경계에 붙은 것 0개). `verify-phase3.mjs` D-9 검사를 `.tree-indent-unit` 기준으로.
  - **주의 — Phase 6**: 같은 CSP 문제로 트리 아이콘 색의 `style="color:…"`도 안 먹는다. `FR-X10` · `FR-X14`(색 테마가 아이콘까지)가 Phase 6에서 이걸 CSS 클래스 · data 속성 방식으로 풀어야 한다.
- **v0.1 회귀 처리 (Phase 5)**: `verify-phase3.mjs` 4.6절을 네 액션 · 새 생성자 시그니처로, D-9 정렬선 검사를 `.tree-indent-unit`으로. `phase5-suite.js` `P5-FR-I10`을 "앱이 표면으로 액션을 넣고 넷의 왼쪽" + 프리셋 정보 0개로. `phase7-suite.js` `FR-A20`(네 액션 순서) · `FR-A23`(껍데기 New File · New Folder 버튼 · `setSidebarNewItemHandler`). ID 유지.
  - **검증**: `npm.cmd test` — v0.1 Phase 1~7 · v0.2 Phase 1~5 두 갈래 전건 0 failures.

- **A13 반대 벤더 검토 반영** (Phase 5, 필수 통과 아님 — 3회로 한도, 3회차 미해결 Critical 0건)
  - **Critical 1건 수정**: 최소 폭 170px에서 `EXPLORER` 제목이 잘렸다(`FR-X6`). 최소 폭을 260px · 기본 폭을 280px로, 제목에서 생략 부호를 없애 넘치면 눈에 보이게 했다.
  - **Major 8건 · Minor 1건 반영**: 폭 조절 키보드 경로(손잡이 `tabindex` + 화살표 · `Home` · `End`, `reserved-keys.md` 3b · 5절). 끊긴 드래그 정리(`pointercancel` · `blur` · `setPointerCapture`). 대량 앱 액션이 최소 폭을 못 무너뜨리게(앱 액션 묶음만 잘림, 껍데기 넷 · 제목은 안 줄어듦) + **잘려 안 보이는 앱 액션 버튼은 탭 순서 밖**(`ResizeObserver`로 `tabindex="-1"` · `aria-hidden`). `FR-X4` 테스트가 디스크를 직접 대조하고 New Folder도 `Enter`로 확정. `FR-X5`가 `pointermove`마다 재고, `FR-X7`이 `localStorage` 스냅샷 + **Electron 러너의 새 창 재시작** 확인.
  - **검증**: `V2P5-FR-X4` ~ `X9` · `V2P5-FR-X5-KEYBOARD`. `npm.cmd test` 전건 0 failures. 기록 `docs/reviews/A13.md`.
  - **최소 창 폭 자체 · 세로 넘침**: A11 R1-4와 같이 이번 범위 밖으로 기록.

- **A10 반대 벤더 검토 반영** (Phase 2, 필수 통과 아님 — Critical 0 · Major 3 · Minor 1)
  - **제품 결함 2건 수정**: (1) `F6`이 dockview 삽입 순서로 칸을 돌던 것을 화면 읽기 순서로 바꿨다(`V2P2-FR-F1-ORDER`). (2) 저장 안 한 탭의 닫기 버튼을 실제로 누르면 칸 포커스 끌어오기가 확인 창의 포커스를 도로 빼앗던 것을, 버튼·입력칸 누르기와 확인 창·메뉴가 포커스를 가져간 경우를 제외하도록 고쳤다(`V2P2-DIALOG-FOCUS`).
  - **검사 허점 3건 보강**: `FR-F11`은 hover를 토큰 문자열이 아니라 실제로 칠해진 색으로 측정하고 커서 테두리 대비도 본다. `FR-F5`는 `.tree-list`에 직접 보내던 클릭을 화면의 실제 빈 곳 좌표로 바꿨다. 에디터 안 `Tab`은 영역 불변에 더해 껍데기가 `Tab`을 막지 않는지를 본다 — monaco의 실제 들여쓰기는 합성 이벤트로 판정할 수 없어 사용자 재검증 몫으로 기록했다.
  - **실행 환경**: 검토자가 샌드박스에서 스스로 돌린 검사가 멈춰 창을 남겼고, 이전 실행 잔여분까지 합쳐 36개 테스트 프로세스가 포커스 검사를 방해했다(v0.1 Phase 6 `Ctrl+Z` 검사가 Electron에서만 실패). workbench-kit 테스트 프로세스만 골라 정리한 뒤 단독 재실행에서 통과했다.
  - **검증**: `npm.cmd test` — v0.1 Phase 1~7 · v0.2 Phase 1 전건 통과, v0.2 Phase 2 두 갈래 0 failures. 기록 `docs/reviews/A10.md`.

## 2. 계획 외 개선

`backlog`에 없는 작업이다. 여기 적지 않으면 어디에도 남지 않는다. 이 구간이 다음
버전 `BRIEF`의 재료가 된다 — 요청 · 조치 · 결과 · 검증.

- **`SPEC.md` 0.1절 대체 목록 보완 (Phase 3 착수 전 확인)**
  - **요청**: Phase 2에서 v0.1 요구 문언을 확인하지 않아 한 번 되돌린 뒤, Phase 3 구현 전에 v0.1 `SPEC.md`에서 세로 띠 · 상단 바 · 하단 바를 언급하는 요구를 전부 대조했다.
  - **발견**: 이미 사람이 결정한 D-3(분할은 세로 띠에서 빼고 메뉴에 둔다, 테마 · Zen은 상단 바로) · D-4(하단 바 오른쪽 앱 정보를 없앤다)가 깨는 v0.1 요구 넷이 대체 목록에서 **빠져 있었다** — `FR-D3`(분할 세 경로), `FR-J8`(빈 칸 재시작 세 경로), `FR-M1`(테마 두 경로), `FR-N10`(하단 바 세 자리 유지). SPEC을 쓸 때 `FR-N1` · `FR-N9` · `FR-N11`만 대조하고 경로 수를 명시한 요구를 놓쳤다.
  - **조치**: 새 결정이 아니라 승인된 결정의 귀결이라 대체 목록에 **일부 대체**로 네 행을 더했다. 없어지는 것은 세로 띠 경로와 앱 정보 자리뿐이고, 나머지 경로(탭 줄 · 메뉴 · 트리)는 v0.1 판정을 그대로 받는다.

- **`SPEC.md` 0.1절 대체 목록 보완 — 메뉴 재구성 (Phase 4 착수 전 확인)**
  - **요청**: Phase 4 구현 전에 v0.1 `SPEC.md`에서 메뉴 · 칸 닫기 · 테마 · 아이콘 테마 · 우클릭을 언급하는 요구를 전부 대조했다.
  - **발견**: 사람이 이미 쓴 v0.2 `FR-M1` ~ `FR-M12`(SPEC 1.4)가 대체하는 v0.1 요구 여섯이 0.1절 목록에서 **빠져 있었다** — `FR-N6c`(File 폴더 닫기), `FR-G6` 일부(View의 우클릭 스위치), `FR-J2`~`FR-J4` 일부(View "활성 칸 탭 모두 닫기" → File `Close Editor Group`), `FR-Q1a` 일부(아이콘 테마 토글 → 고르기), `FR-I9` 일부(껍데기 File 항목 다섯 → 여덟), 그리고 `FR-D3`/`FR-J8`/`FR-M1`의 메뉴 경로가 View에서 File로 옮겨 가는 것.
  - **조치**: 새 결정이 아니라 사람이 쓴 `FR-M*` 요구의 귀결이라 0.1절에 **일부 대체**로 여섯 행을 더하고 세 행을 고쳤다. Phase 3의 표 보완과 같은 판정이다.

- **`SPEC.md` 0.1절 대체 목록 보완 — 뷰 제목줄 (Phase 5 착수 전 확인)**
  - **요청**: Phase 5 구현 전에 v0.1 `SPEC.md`에서 뷰 제목줄 · 인라인 입력 · 탐색기 폭을 언급하는 요구를 대조했다.
  - **발견**: 사람이 이미 쓴 v0.2 `FR-X2` · `FR-X4`가 대체하는 v0.1 요구 셋이 빠져 있었다 — `FR-A23`(앱이 꽂은 새 파일/폴더 → 껍데기 액션), `FR-A24`(앱 없으면 제목줄 아이콘 정확히 2개 → 넷), `FR-I10` 일부(앱 액션이 껍데기 액션 **둘** 왼쪽 → **넷** 왼쪽).
  - **조치**: 사람이 쓴 `FR-X*`의 귀결이라 0.1절에 일부 대체로 세 행을 더했다. Phase 3·4의 표 보완과 같은 판정.

- **인라인 `style=` 속성이 CSP에 막힌다 — 트리 들여쓰기가 화면에 안 나오고 있었다 (Phase 5)**
  - **요청**: `FR-X8`/`FR-X9`는 "설계 변경이 아니라 v0.1 구현이 화면에서 어긋난 것을 고친다"고 명시돼 있었다. 무엇이 어긋났는지 구현하며 찾았다.
  - **발견**: 이 앱의 `index.html` CSP가 `style-src 'self'`(no `'unsafe-inline'`)라 **인라인 `style=` 속성이 전부 무시된다**. v0.1 트리는 들여쓰기를 `style="padding-left: Npx"`, 세로 정렬선을 `style="left: Npx"`로 넣고 있어 화면에는 들여쓰기도 정렬선도 없었다. v0.1 검사는 MockElement(CSP 없음)나 HTML 문자열만 봐서 못 잡았다. dockview CSS와 정확히 같은 사고다(`.claude/rules/dockview-css.md`).
  - **조치**: 조상 깊이 수만큼 `<span class="tree-indent-unit">`을 앞에 두는 구조적 들여쓰기로 바꾸고, 각 unit이 `::before`로 세로선을 그리게 했다. 기본 여백은 스타일시트로. 인라인 `style=`에 기하 정보를 싣는 코드를 트리에서 없앴다.
  - **남은 것**: 트리 아이콘 색 `style="color:…"`도 같은 이유로 안 먹는다 — `FR-X10`/`FR-X14`(Phase 6)가 다뤄야 한다. `PROGRESS`에 기록했고 Phase 6 착수 전 확인 대상.

- **분할이 `Untitled` 임시 자리를 갖는 새 칸을 만든다 (Phase 4 — v0.1 구현 가정 변경)**
  - **요청**: `FR-P11`은 "칸을 나누면 새 칸이 **비어 있지 않고** `Untitled` 임시 자리를 갖고 생긴다"를 요구한다. v0.1 구현은 `noPanelsOverlay: 'emptyGroup'`로 빈 칸을 만들었고, v0.1 스위트 여러 곳이 "분할 = 빈 칸"을 전제로 자리 수를 셌다.
  - **판단**: v0.1 `SPEC.md`는 분할이 빈 칸을 만든다고 **요구한 적이 없다** — `FR-D1`·`FR-D2`는 "칸 수가 1 늘고" 위치만, `FR-D7`은 "8회에 9칸"만 판정한다. 빈 칸은 구현 선택이었고, 자리 수를 세던 v0.1 단언은 SPEC 계약을 넘어 구현 세부를 검사하고 있었다.
  - **조치**: 사용자 분할 경로만 `splitGroupForUser`로 분리해 `Untitled` 임시 탭을 함께 만들고, `openBeside`의 내부 분할은 빈 칸 그대로 뒀다. `openItem`의 `isBlankSpot` 갈래로 임시 · 확정 열기 둘 다 그 자리를 흡수하게 해, v0.1 스위트의 "분할 뒤 그 칸에 열기" 흐름이 자리 수를 그대로 유지한다. 전건 통과로 회귀 없음을 확인했다.

- **영역 순환 키를 `Tab`에서 `F6`으로 변경 (Phase 2 착수 전 명세 충돌)**
  - **요청**: Phase 2 착수 전 확인에서 `FR-F1`(`Tab`·`Shift+Tab`으로 트리와 칸 순환)이 v0.1의 두 요구와 충돌하는 것을 발견했다 — v0.1 `NFR-7`(세로 띠·탭 줄 버튼에 브라우저 기본 `Tab`으로 닿는다, `docs/reserved-keys.md` 5절)과 v0.1 `FR-I6`(탭 안 보기의 키는 앱 몫, 에디터 들여쓰기). 둘 다 `SPEC.md` 0.1절 대체 목록에 없어 그대로 구현하면 회귀다. 두 안(`F6` / `Tab` 조건부)을 올려 **사람이 `F6`을 결정**했다(2026-09-10).
  - **조치**: `SPEC.md` `FR-F1`·`FR-F4`의 키를 `F6`으로 개정하고 에디터 안 `Tab`이 영역을 바꾸지 않는다는 판정을 더했다. `DECISIONS.md` D-10에 "영역 순환 키 — `F6`" 결정과 배제한 대안 둘을 기록했다. `PLAN.md` Phase 2 완료 조건, `backlog.json` `WK-054`(CLI), `docs/reserved-keys.md` 1절(`F6`·`Shift+F6`·`Ctrl+Tab`·`Ctrl+Shift+Tab` 추가, `Tab`은 예약하지 않는다고 명시)을 맞췄다.
  - **함께 고친 것**: `docs/reserved-keys.md` 3절의 `Enter` 행이 v0.1 뜻("선택한 항목 열기")으로 남아 있었다. Phase 1에서 `Enter`가 확정으로 바뀌었는데 예약 키 문서가 따라오지 않은 것이라 v0.2 `FR-P7` 뜻으로 고쳤다(`NFR-8`은 이 문서가 실제 동작과 맞기를 요구한다).
  - **정정 — `F6`도 v0.1과 충돌했다**: `F6`을 제안할 때 v0.1 회귀가 없다고 봤으나, 구현 후 v0.1 Phase 5 검사 `P5-FR-R1A-F6`이 두 갈래에서 실패했다. v0.1 `FR-I6`이 판정 방법에서 `F6`을 **앱 몫 키의 예시로 명시**하고 있었고, 제안 때 그 예시 목록을 확인하지 않았다. 두 안(`F6` 조건부 / `F6` 전역 예약 + v0.1 대체)을 다시 올려 **사람이 조건부를 결정**했다(2026-09-10). 포커스가 탭 안 보기 안에 있으면 `F6`을 앱에 넘기고, 트리 · 탭 줄 · 칸 자체에서만 순환한다. `SPEC.md` `FR-F1` · `DECISIONS.md` D-10 · `docs/reserved-keys.md`(1절 → 새 1b절)에 반영했다. 대가는 에디터 안에서 `F6`으로 빠져나올 수 없다는 것이다.

- **v0.1 회귀 처리** (`NFR-2`)
  - **무엇을 했나**: 열기 규칙이 바뀌면서 v0.1 스위트가 깨진 것을 **의도된 변경과 회귀로 갈랐다.** `SPEC.md` 0.1절의 대체 목록에 있는 것(`v0.1 FR-A6`·`FR-B1`·`FR-B3`)은 단언을 v0.2 규칙으로 다시 쓰거나(전자 둘) 매니페스트에서 제거했고(`P4-FR-B3`·`P4-FR-B3-DUP`), `docs/phase7-fr-matrix.md`의 `FR-B3` 행은 후속 판정(`V2P1-FR-P8`)을 가리키게 바꿨다. 나머지 실패는 전부 **스위트 설정**이 옛 규칙(`addNewTab` 뒤 `openItem`이 빈 탭에 흡수됨)에 기대고 있던 것이라, 24곳을 `openItem(..., { mode: 'pinned' })` 한 번으로 합쳤다 — 단언의 뜻은 그대로다.
  - **그 밖에 두 곳**: `verify-dist.mjs`의 환경 버전 검사가 `PLAN.md`만 보고 있었는데 v0.2는 그 값을 `SPEC.md` 3절에 둔다. 요구가 아니라 기록 위치가 바뀐 것이라 두 문서를 함께 보도록 넓혔다. `verify-phase7.mjs`의 133건 매트릭스 검사는 **v0.1 SPEC 스냅샷**(`docs/history/v0.1/SPEC.md`)을 읽도록 고정했다 — 그 매트릭스는 v0.1의 마감 게이트이고 양쪽이 history에 얼어 있다. v0.2 매트릭스는 자기 Phase 7(`WK-082`)이 만든다.
  - **검증**: `npm.cmd test` — typecheck · verify-dist · verify-phase2~7 · verify-v02-phase1 전건 0 failures, 두 갈래 divergence 0건.
