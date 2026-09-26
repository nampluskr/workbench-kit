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
  - 특이사항: `npm test`는 이전부터 알려진 v0.1 Phase 4 단언 7건 실패로 중단된다. Claude CLI 2회차는 HTTP 429였으나 3회차 검토에서 Electron 보완 확인과 pywebview 조건부 Major 두 건을 받았다. pywebview 보완 후 실제 WebView2 팝업·탐색 차단과 가드 연결 실패 시 종료를 검증했다. 미해결 Critical은 없다.

## 2. 계획 외 개선

> 사용자 지시(2026-09-25): 이 절의 계획 외 진행분은 반대 벤더 검증을 받지 않는다.
> 사용자가 직접 테스트한다. 아래 각 항목의 "반대 벤더 검증은 아직 받지 않았다"는
> 특이사항은 이 지시에 따른 것이며, 뒤에 검증을 받아야 할 누락이 아니다.

- **rendered 탭에서 F4가 듣지 않던 문제** (2026-09-25, 사용자 보고)
  - 무엇을 했나: F3로 editor → rendered로 바꾸면 탭 내용 요소가 통째로 교체되면서 포커스가 `<body>`로 떨어져, F3/F4 처리기가 "파일 보기에 포커스 없음"으로 보고 키를 무시했다. `setActivePanelMode`가 모드 전환 뒤, 포커스가 그 탭 안·`<body>`·상태표시줄 모드 버튼에 있었던 경우에만 새 보기로 포커스를 넘기게 했다(`focusPanelContent`). 보기 자신의 focus가 없으면(파일 editor) 탭 내용 상자에 포커스를 준다. 파일 보기에는 focus 처리기를 새로 달지 않았다 — 탐색기에서 파일을 열 때 트리 포커스를 뺏지 않기 위해서다. 종류가 바뀔 때 이전 보기의 mode·focus·refresh 처리기가 남던 것도 `kind-registry.ts`에서 함께 해제한다.
  - 결과: rendered에서 F4 → editor, 곧바로 F3 → rendered, 다시 F4가 연달아 동작한다. 상태표시줄 버튼으로 바꾼 직후에도 F3/F4가 듣는다.
  - 검증: `verify-v04-phase4`(Electron·pywebview)에 수동 재포커스 없이 F3/F4/상태표시줄을 번갈아 누르는 단언 5개(`f4AfterF3`·`f3AfterF4`·`statusToEditor`·`f3AfterStatus`·`f4AfterStatus`)를 더했다. 수정을 뺀 빌드에서는 실패하고, 수정 빌드에서는 두 호스트 모두 통과. `typecheck`, `build`, `verify:open-modes`, `verify:text-open`, `verify-v04-phase2-electron` 통과.
  - 특이사항: `verify:dist`는 이 수정과 무관하게, 진행 중인 GitHub 스타일 CSS의 `4px`·`6px`·`8px`·`16px` 값(FR-M5·D-29 금지값) 4건으로 실패한다. 반대 벤더 검증은 아직 받지 않았다.

- **px 금지값 검사에 렌더링 마크다운 예외 추가** (2026-09-25, 사용자 요청)
  - 무엇을 했나: `scripts/verify-dist.mjs`의 `src/style.css` 금지값 스캔이 D-17 상태표시줄 예외처럼, 선택자가 전부 `.markdown-rendered`로 시작하는 규칙을 스캔에서 뺀다. 문자열만 지우지 않고 규칙 블록 전체를 제거해서, 같은 값이 다른(비마크다운) 규칙에 있으면 여전히 걸린다.
  - 결과: 위 F4 작업 특이사항에 적은 `verify:dist` 4건 실패가 사라졌다. GitHub 스타일 마크다운 CSS(제목·코드 블록·표·경고 상자 등 10개 규칙)의 `4px`·`6px`·`8px`·`16px`·`12px`가 통과한다.
  - 검증: `verify:dist` 통과. 마크다운 밖에 임시로 `8px` 규칙을 넣어 여전히 잡히는지 확인.
  - 특이사항: 반대 벤더 검증은 아직 받지 않았다.

- **폴더 탭 레일·탐색기 트리 우클릭 메뉴가 창 아래로 잘리던 문제** (2026-09-25, 사용자 보고)
  - 무엇을 했나: `ContextMenuController.show()`가 클릭 좌표에 메뉴를 그대로 배치해, 창 하단·우측 근처에서 열면 잘렸다. 메뉴를 DOM에 붙여 실측 크기를 안 다음, 뷰포트 아래·오른쪽을 넘으면 위/왼쪽으로 뒤집는다(0 아래로는 내려가지 않는다). 폴더 탭 레일과 탐색기 트리 모두 이 컨트롤러 하나를 공유하므로 한 곳만 고치면 됐다.
  - 결과: 창 가장자리 근처에서 우클릭해도 메뉴가 화면 안에 완전히 들어온다.
  - 검증: `scripts/verify-ui-contextmenu-clip-electron.cjs`(신규, package.json 미등록)로 창 우하단 모서리에서 메뉴를 열어 확인. 수정을 뺀 코드에서는 `bottomClipped`·`rightClipped`가 참으로 나와 실패를 재현했고, 수정한 코드에서는 둘 다 거짓. `typecheck`, `build` 통과.
  - 특이사항: 반대 벤더 검증은 아직 받지 않았다. 폴더 탭 색상 선택 팝업(`foldertabs-color-popup`)은 같은 증상이 보고되지 않아 손대지 않았다.

- **상태표시줄 마크다운 렌더링 표시(모드 버튼)에 D2Coding이 적용되지 않던 문제** (2026-09-25, 사용자 보고)
  - 무엇을 했나: `Workbench D2Coding` 글꼴 지정이 `.statusbar-path`·`.statusbar-app-item` 두 선택자에만 있어, `.statusbar-mode-btn`("File: Rendered" 등 모드 표시)을 비롯한 상태표시줄의 나머지 요소는 system-ui로 남아 있었다. 글꼴 지정을 개별 선택자에서 `.workbench-statusbar` 자체로 올려, 상태표시줄 안의 모든 글자가 상속받게 했다. 백슬래시 글리프 설명 주석도 이 범위 확대에 맞춰 고쳤다.
  - 결과: 모드 버튼·삭제 표시·중앙 상태 메시지 등 상태표시줄의 모든 글꼴이 D2Coding을 쓴다(한글은 이전처럼 시스템 폰트로 넘어간다).
  - 검증: 임시 Electron 스크립트로 `.workbench-statusbar`·`#statusbar-mode-btn`·`.statusbar-path`의 실측 `font-family`가 모두 `Workbench D2Coding`을 포함하는지 확인(스크립트는 확인 후 삭제). `typecheck`, `build`, `verify-v04-phase2-electron`, `verify-v04-phase4-electron` 통과.
  - 특이사항: 반대 벤더 검증은 아직 받지 않았다(위 지시 참조).

- **탐색기 트리 우클릭 메뉴의 Delete를 삭제 가능할 때만 활성화** (2026-09-25, 사용자 요청)
  - 무엇을 했나: `ContextMenuItem`에 `disabled?: boolean`을 추가하고, `ContextMenuController`(`src/core/contextmenu.ts`) 전반에 disabled 행 처리를 넣었다 — 초기/키보드 포커스가 건너뛰고, 클릭·Enter가 동작하지 않으며(행은 그대로 남고 메뉴는 닫히지 않는다), 하마버거 메뉴의 `.menu-item-row.disabled`와 같은 흐림 스타일(`opacity: 0.6`)을 `.context-menu-item-row.disabled`로 추가했다. `main.ts`의 `contextMenuItemsForTreeNode`가 `explorer:delete` 항목에 `disabled: !getDeleteEnabled()`를 준다.
  - 결과: Allow Delete in Explorer가 꺼져 있으면 트리 우클릭 메뉴의 Delete 행이 흐리게 표시되고 클릭·키보드 모두로 선택할 수 없다. 켜져 있으면 평소대로 동작한다. Delete 키 삭제(멀티 선택)는 이 변경과 무관하게 그대로다.
  - 검증: 실측 Electron 스크립트로 (1) 꺼진 상태에서 `contextMenuItemsForTreeNode`가 `disabled: true`를 주는지, (2) 실제로 띄운 메뉴의 해당 행에 `disabled` 클래스가 붙는지, (3) 그 행을 클릭해도 메뉴가 닫히지 않는지(동작 없음), (4) 켜면 `disabled: false`로 바뀌는지 확인. `verify-explorer-delete-electron`(Delete 켜고 실제 삭제하는 기존 흐름 전체) 통과 — 그 검사는 먼저 Allow Delete를 켜므로 이번 변경과 부딪히지 않는다. `typecheck`, `build`, `verify:dist` 통과.
  - 특이사항: 반대 벤더 검증은 아직 받지 않았다(위 지시 참조).

- **상태표시줄에 Filter/File/Delete 세 항목과 구분선 추가** (2026-09-25, 사용자 요청; 같은 날 File | Filter | Delete로 순서 정정)
  - 무엇을 했나: `Filter: On/Off` 표시(`main.ts`에 새로 추가, `.statusbar-filter-indicator`)를 만들어 상태표시줄 우측에 기존 `File: Editor/Viewer/Rendered` 모드 버튼과 `Delete: On/Off` 표시 사이에 넣었다 — DOM 순서를 File 모드 버튼(원래부터 첫 자리) → 구분선 → Filter → 구분선 → (Delete가 들어있는) app-items 슬롯으로 `insertBefore`로 재배열했다(핵심부 `layout.ts`는 건드리지 않았다 — 순서 재배열은 리소스 종류를 아는 app 레이어인 `main.ts`의 몫). 처음에는 Filter | File | Delete로 넣었다가 사용자 요청으로 File | Filter | Delete로 다시 바꿨다. 클릭하면 Activity Bar의 File Filter 아이콘과 같은 필터 패널을 상태표시줄 위치에 연다(`fileFilterPanel.toggle(filterStatusEl)`). File/Filter 사이 구분선은 File 모드 버튼이 파일/마크다운 탭이 아닐 때 스스로 숨는 것과 함께 숨긴다(`statusbarModeDivider` 하나만) — 그렇지 않으면 "│ Filter: On │ Delete: On"처럼 빈 자리에 구분선만 남는다. Filter/Delete 사이 구분선은 둘 다 항상 보이므로 무조건 표시한다. 라벨은 지난 확인대로 기존 표기(Editor/Viewer/Rendered) 그대로 두었다.
  - 결과: 파일/마크다운 탭이 열려 있을 때 `File: Editor/Viewer/Rendered │ Filter: On/Off │ Delete: On/Off` 순서로 보인다. 다른 탭(폴더·터미널 등)에서는 `Filter: On/Off │ Delete: On/Off`만 보이고(File과 그 앞 구분선만 숨는다) Filter/Delete 사이 구분선은 그대로 남는다.
  - 검증: 실측 Electron 스크립트로 파일 탭이 없을 때/있을 때 각각 DOM 순서(`File → 구분선 → Filter → 구분선 → Delete`)와 두 구분선의 `display` 값(File 쪽만 `none`↔`block`, Filter/Delete 쪽은 항상 `block`)을 확인, Filter 클릭으로 `.file-filter-panel`이 열리고 다시 클릭하면 닫히는지 확인. `verify:file-filter`, `verify-v04-phase2-electron`, `verify-v04-phase4-electron`(둘 다 File 모드 버튼·상태표시줄에 의존 — phase4는 첫 실행에서 GPU 프로세스 비정상 종료로 타임아웃돼 재실행 후 통과, 이 변경과 무관) 통과. `typecheck`, `build`, `verify:dist` 통과.
  - 특이사항: 반대 벤더 검증은 아직 받지 않았다(위 지시 참조).

- **폴더 file-list 탭 하단 구분선이 그려지지 않던 문제** (2026-09-25, 사용자 요청·근본 원인은 발견)
  - 무엇을 했나: `.folder-file-list-footer`(용량/선택 표시 줄)와 `.folder-file-list-header`(주소창 줄)가 둘 다 `var(--vscode-panel-border)`로 테두리를 그리는데, 이 토큰이 `:root`의 `--vscode-*` 매핑 표에 한 번도 정의되지 않았다. 정의되지 않은 커스텀 속성을 `var()`로 쓰면 그 선언 전체가 무효가 되어, `border-top`/`border-bottom` 선언 자체가 통째로 사라진 상태였다(사용자가 본 "구분선이 없다"의 실제 원인 — 여백 문제가 아니었다). `:root`에 `--vscode-panel-border: var(--border-color);` 한 줄을 다른 `--vscode-*` 항목들 옆에 추가했다. 기존 `border-top: 1px solid var(--vscode-panel-border); padding: 0 10px;` 등 레이아웃 선언은 손대지 않았다(지시: "여백은 그대로 유지").
  - 결과: 하단 구분선이 `Name|Ext|Size|Date` 헤더 밑줄과 정확히 같은 위치·길이(좌우 여백 없이 패널 전체 폭)로 그려진다. 같은 토큰을 쓰던 주소창 줄 밑선도 덤으로 같이 복구됐다.
  - 검증: Electron에서 `.folder-file-list-footer`·`.rowlist-header`의 실측 `border` 값과 `getBoundingClientRect()`로 위치·길이가 같은지 확인(수정 전 `0px none` → 수정 후 `1px solid`, 위치·폭 일치는 수정 전후 모두 일치 확인). `typecheck`, `build`, `verify:dist`, `verify-rowlist-electron` 통과.
  - 특이사항: 반대 벤더 검증은 아직 받지 않았다(위 지시 참조). 사용자가 요청한 범위(폴더 file-list 하단)를 벗어나 주소창 줄까지 같이 고쳐진 것은, 같은 정의 누락이 원인이라 분리할 수 없었기 때문이다.

- **"Allow Delete in Explorer"를 View 메뉴에서 File 메뉴로 이동** (2026-09-25, 사용자 요청)
  - 무엇을 했나: `src/core/menu.ts`의 `DEFAULT_VIEW_ITEMS`에서 이 행(과 앞의 구분선)을 빼고, `DEFAULT_FILE_ITEMS`의 Close 그룹(`Close Active Tab`·`Close All Tabs in Group`·`Close All Tabs`) 바로 아래, `Exit` 바로 위에 구분선으로 감싸 넣었다. id도 소속 메뉴 규칙에 맞춰 `view:delete-enabled` → `file:delete-enabled`로 바꾸고, `main.ts`의 `setAction`·`setCheckedProvider`와 `scripts/verify-explorer-delete-electron.cjs`의 `triggerItem` 호출, `README.md`의 두 안내 문구를 같은 이름으로 맞췄다. `MenuController.triggerItem`은 그룹과 무관하게 id로만 찾으므로 메뉴를 옮겨도 동작에는 영향이 없다.
  - 결과: File 메뉴에 Close 그룹 다음 순서로 `Allow Delete in Explorer`가 나오고, 그다음이 `Exit`이다. View 메뉴에서는 빠졌다. 상태표시줄의 `Delete: On/Off` 표시·클릭 토글은 그대로 같은 `setDeleteEnabled()`를 공유한다.
  - 검증: 빌드된 페이지에서 `menu.openMenu()`(File이 기본 카테고리)로 열어 각 행의 `data-item-id` 순서를 실측 — `close-all-tabs → delete-enabled → exit` 확인. `verify-explorer-delete-electron`(Delete 토글·삭제 흐름 전체) 통과 — 처음 시도에서 빌드가 갱신되지 않은 채로 실행해 실패했던 것을 재빌드 후 재확인. `typecheck` 통과.
  - 특이사항: 반대 벤더 검증은 아직 받지 않았다(위 지시 참조).

- **툴팁 등 보조 텍스트 계층을 11px/10px에서 12px로 통일** (2026-09-25, 사용자 요청 — "툴팁의 글꼴 크기를 확인해 주세요" 확인 후 변경 요청)
  - 무엇을 했나: `src/style.css`에서 `font-size: 11px`(12곳)·`font-size: 10px`(1곳) 선언 14개를 전부 `12px`로 바꿨다 — 툴팁(`.workbench-tooltip`)·트리 찾기 바/입력창·행 정렬 화살표·메뉴 체크·단축키 표시·File Filter 섹션 제목·About 대화상자 부제/메타/라이선스/저작권 문구 등. `12px`는 D-29(v0.1 DECISIONS)의 금지값 목록에 있고, 지금까지는 `.workbench-statusbar` 한 곳만 D-17로 예외를 받아 왔다(`verify-dist.mjs`/`verify-phase2.mjs`가 그 한 선언만 문자열로 지우고 스캔). D-29의 취지가 "tab-explorer-templates 프로젝트의 값을 베끼지 않는다"이지 "12px를 아예 쓰지 않는다"가 아니라는 점(주석과 `docs/history/v0.1/DECISIONS.md`의 D-29 원문으로 확인)에 근거해, 두 검사 스크립트의 예외를 `font-size: 12px;`가 나오는 모든 자리로 넓혔다(같은 규칙 안의 다른 금지값 4/6/8/16px는 여전히 걸린다). 넓히면서 `style.css`의 D-17 주석에 "12px"를 실제 선언 형태(`font-size: 12px;`, 세미콜론 포함) 밖에서 맨 단어로 쓰지 말라는 메모도 남겼다 — 처음 쓴 설명 문장 자체가 검사에 걸려 한 번 더 고쳤다.
  - 결과: 툴팁을 포함해 위 보조 텍스트 전체가 12px로 보인다. 실측: 툴팁의 계산된 `font-size`가 `12px`.
  - 검증: 빌드된 페이지에서 실제 툴팁을 띄워 `getComputedStyle().fontSize`가 `12px`인지 확인. `typecheck`, `build`, `verify:dist`, `verify:phase2`(둘 다 이번에 나온 "12px" 잔존 실패를 잡아 고쳤다), `verify:file-filter` 통과. `verify-rowlist-electron`은 이 변경과 무관한 기존 플레이키 항목(`nameCappedAt500`·`headerFollowsScroll`) 2건만 실패 — 이번 세션에 이미 두 차례 무관함을 확인한 것과 같은 패턴.
  - 특이사항: 반대 벤더 검증은 아직 받지 않았다(위 지시 참조). `verify:phase2`는 이 작업 전부터 `.markdown-rendered` 규칙의 4/6/8/16px로 실패하고 있었는데(앞서 `verify:dist`에만 넣었던 예외가 이 스크립트엔 없었다) 같은 김에 같이 넓혔다 — 이번 요청 범위 밖이지만 같은 예외 메커니즘을 만지는 자리라 분리하지 않았다.

- **exe 패키징(Electron·pywebview 두 갈래)과 README 전면 재작성** (2026-09-25, 사용자 요청)
  - 무엇을 했나: 지금까지 이 프로젝트엔 패키징 도구가 전혀 없었다(둘 다 `npm run build` 뒤 `start:electron`/`start:pywebview`로 소스에서 바로 실행). `electron-builder`를 devDependencies에 추가하고 `package.json`의 `build` 필드(appId·nsis 인스톨러·`asarUnpack: node-pty`)와 `main` 필드, `npm run package:electron` 스크립트를 만들었다. `node-pty`는 순수 NAPI 바이너리가 아니라 `@electron/rebuild`의 기본 네이티브 재빌드가 이 환경(Python은 있어도 `git`·winpty 서브모듈이 없어 실패)에서 막혀, `npmRebuild: false`로 끄고 `node-pty`가 이미 갖고 있는 `win32-x64` 프리빌드를 그대로 썼다 — 실제로 패키지된 exe에서 CDP로 터미널을 열어 PowerShell 프롬프트가 뜨는 것까지 확인했으므로 Electron 44의 ABI와 실제로 맞았다. pywebview 쪽은 `workbench-kit.spec`(PyInstaller, one-folder)을 새로 만들고 `npm run package:pywebview` 스크립트를 추가했다. `winpty`·`webview`·`clr_loader`가 네이티브 바이너리를 패키지 데이터로 갖고 있어 `collect_all()`로 명시적으로 모았다. `src/hosts/pywebview/main.py`의 `dist/` 경로 계산이 `__file__` 기준 4단계 상위 폴더였는데, PyInstaller로 얼린 실행 파일에서는 그 경로가 무의미해서 `sys.frozen`일 때만 `sys._MEIPASS`를 쓰도록 분기 하나를 추가했다(소스 실행 경로는 그대로). 두 도구 다 기본 출력 폴더 이름이 `dist`라 vite가 만든 프런트엔드 `dist/`와 부딪힐 뻔해서, Electron은 `dist-exe/`로, PyInstaller는 `--distpath dist-py --workpath build-py`로 분리했다. `.gitignore`에 세 폴더를 추가했다. 마지막으로 `README.md`를 통째로 다시 썼다 — INTENT.md의 2026-09-25 개정("복사해 쓰는 껍데기"에서 "그 자체로 쓰는 stand-alone 앱"으로)에 맞춰 독자를 개발자에서 실사용자로 바꾸고, `npm test`·문서 거버넌스 표(`INTENT`/`BRIEF`/`DECISIONS`/`PLAN`/`backlog.json`/`refs/`)·로드맵("다음") 절을 뺐다. 실행 방법에 exe 빌드를 새 1번 항목으로 넣고, 소스에서 바로 실행하는 기존 방법은 "개발 중 확인용"으로 내렸다.
  - 결과: `npm run package:electron` → `dist-exe/Workbench Kit Setup <버전>.exe`(설치형)와 `dist-exe/win-unpacked/Workbench Kit.exe`(포터블) 둘 다 생성. `npm run package:pywebview` → `dist-py/workbench-kit/workbench-kit.exe`(폴더째 옮겨야 함) 생성. 둘 다 실제로 실행해서 창이 뜨고, 탐색기·에디터·터미널이 동작하는 것을 확인했다.
  - 검증: 두 exe 모두 깨끗한 상태에서 처음부터 다시 빌드해 성공을 재현했다(`dist-exe`/`dist-py`/`build-py` 삭제 후 재실행). Electron 쪽은 `--remote-debugging-port`로 CDP에 붙어 `window.__workbenchApp`을 직접 조작 — 터미널 탭을 열어 `node-pty`가 실제 PowerShell을 스폰하고 프롬프트(`PS D:\projects\workbench-kit>`)까지 나오는 것을 raw transcript로 확인했다. pywebview 쪽은 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=...`로 WebView2의 CDP를 열어 같은 방식으로 확인 — 첫 시도에서 "Terminal working directory is not a folder" 오류가 났는데, 원인은 패키징이 아니라 CDP로 보낸 테스트 코드 자체의 백슬래시 이스케이프 실수였다(경로 문자열이 실제로는 다른 값이 되고 있었다); 이스케이프를 고치고 슬래시 경로로도 재확인해 실제로는 문제없음을 확인했다. `main.py`의 `sys.frozen` 분기는 소스 실행 경로(비-frozen)에서 `npm run build` 뒤 `verify-v04-phase4-py.py`를 다시 돌려 회귀 없음을 확인했다. `typecheck` 통과.
  - 특이사항: 반대 벤더 검증은 아직 받지 않았다(위 지시 참조). exe에 서명 인증서가 없어 Windows SmartScreen 경고가 뜰 수 있다는 점을 README에 적었다 — 실제 배포 채널(서명·자동 업데이트)은 이번 범위 밖이다. `package.json`의 `"version": "0.3.0"`은 이번 작업 전부터 낡아 있었다(실제로는 v0.4 작업 중) — 버전 번호는 사람이 정하므로 이 시점엔 손대지 않았다(바로 다음 항목에서 사람 지시로 올렸다).

- **`package.json` 버전을 0.4.0으로 반영** (2026-09-25, 사용자 요청)
  - 무엇을 했나: `docs/current/`의 BRIEF·DECISIONS·PLAN·PROGRESS는 이미 전부 "버전: v0.4"였지만, 실행 파일 버전의 유일한 근거인 `package.json`의 `"version"`만 v0.3 마감 때의 `0.3.0`에 머물러 있었다. `0.4.0`으로 바꾸고 `npm install --package-lock-only`로 `package-lock.json`도 맞췄다. `src/main.ts`의 `appInfoBase()`가 이 값을 유일한 출처로 제목줄·About 화면에 그대로 쓰고(D-15 계열 정책 — 에이전트가 스스로 버전을 올리지 않는다는 주석이 그 자리에 있다), electron-builder의 exe 파일명도 같은 값을 읽으므로 각각 따로 손댈 자리가 없었다.
  - 결과: 제목줄이 `Workbench-Kit v0.4 (2026-09-25)`로 보인다. Electron 인스톨러 파일명이 `Workbench Kit Setup 0.4.0.exe`로 바뀐다(pywebview 쪽은 exe 파일명에 버전을 넣지 않으므로 영향 없음).
  - 검증: 빌드된 페이지에서 제목줄 텍스트를 실측해 `v0.4`를 확인. Electron exe를 다시 빌드해 파일명이 `0.4.0`으로 바뀐 것을 확인. `typecheck`, `build` 통과.
  - 특이사항: 반대 벤더 검증은 아직 받지 않았다(위 지시 참조).
