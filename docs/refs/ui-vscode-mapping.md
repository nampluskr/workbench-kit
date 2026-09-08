# tab-explorer가 남긴 의도를 VS Code 용어로 옮겨 읽기

> 참조 메모 · 작성일: 2026-09-07 · 전제 정정: 2026-09-08
>
> 이 문서는 스키마 문서(`docs/`)가 아니라 `refs/`의 참조 자료다. VS Code 요소 자체의
> 설명은 [`vscode-ui-reference.md`](vscode-ui-reference.md)에 있다.
>
> **읽는 방향에 주의한다.** 앞선 `tab-explorer-templates`는 VS Code OSS의 구성을
> 모르는 상태에서 시행착오로 만들어졌고, 다 만들고 보니 VS Code와 같은 방식에
> 도달해 있었다. 그것을 알고 난 뒤 처음부터 VS Code를 기준으로 다시 세우는 것이
> 이 프로젝트다.
>
> 따라서 **기준은 VS Code이고, tab-explorer는 기준이 아니다.** 여기서 tab-explorer를
> 언급하는 목적은 단 하나 — 사용자가 **어떤 요소를 어디에 두고 어떻게 쓰려 했는지**
> 라는 의도를 읽어내는 것이다. 배치·간격·색·구현 방식을 물려받자는 뜻이 아니다.
> UI 레이아웃은 전면 재작성하며, 큰 틀은 tab-explorer가 아니라 VS Code 레이아웃에서
> 필수 요소와 구현 방식만 참조해 정한다.
>
> 아래의 골격 그림과 표는 그 의도의 기록이다. 확정 디자인이 아니다.

---

## 0. 화면의 큰 골격

VS Code는 화면을 몇 개의 "파트(Part)"로 나눈다. tab-explorer가 도달했던 배치는 그
구성과 겹치되 필요 없는 파트가 빠져 있었다. 아래는 그 배치를 옮겨 그린 것이며,
어떤 파트를 원했고 어떤 파트를 원하지 않았는지를 읽기 위한 것이다.

```
┌───────────────────────────────────────────────────────────┐
│ [메뉴바] File View Help              [타이틀바 창 버튼들]   │  ← Title Bar
├──┬──────────────┬────────────────────┬────────────────────┤
│  │ EXPLORER  ···│ tab tab tab    ⊟   │ tab             ⊟  │  ← Tab Bar
│활│              ├────────────────────┼────────────────────┤
│동│  파일 트리    │                    │                    │
│바│  (탐색기 뷰)  │   편집기 그룹 1     │    편집기 그룹 2    │  ← Editor Groups
│  │              │                    │                    │
├──┴──────────────┴────────────────────┴────────────────────┤
│ 경로…                            Markdown Viewer · Electron │  ← Status Bar
└───────────────────────────────────────────────────────────┘
   ↑Activity  ↑Side Bar (Explorer)
```

| tab-explorer에 있던 것 | VS Code 용어(영문) | 한글 통용어 | 이 프로젝트 문서 표현 |
| --- | --- | --- | --- |
| 맨 윗줄 `File View Help` | Menu Bar | 메뉴 바 | 메뉴 줄 |
| 맨 윗줄 전체 + 우측 창 버튼(전체화면·테마·최소화·최대화·닫기) | Title Bar | 제목 표시줄 | (창 상단) |
| 맨 왼쪽 좁은 세로 띠 | Activity Bar | 활동 표시줄 | 세로 띠 |
| `EXPLORER`가 든 세로 패널 | Primary Side Bar | 기본 사이드 바 | 탐색기 사이드바 |
| 가운데·오른쪽 문서가 열린 넓은 영역 | Editor Area | 편집기 영역 | 보기 영역 |
| 맨 아랫줄(경로 / 앱 이름) | Status Bar | 상태 표시줄 | 상태 표시줄 |

VS Code에는 하단 가로 영역 Panel과 오른쪽 Secondary Side Bar도 있으나 tab-explorer에는
둘 다 없었다. 사용자가 그 자리를 필요로 하지 않았다는 신호로 읽는다 (5절).

---

## 1. Activity Bar (맨 왼쪽 세로 띠)

VS Code에서 이 띠는 뷰 전환 버튼(탐색기·검색·소스제어·실행·확장)이 위에, 계정·설정이
아래에 놓인다.

tab-explorer는 그 전환 버튼을 거의 다 두지 않고, 이 띠를 두 개의 토글에만 썼다.

- 위쪽 아이콘: 사이드바 접기/펼치기 = VS Code의 Toggle Side Bar (`Ctrl+B`).
- 아래쪽 아이콘: 테마를 순환시키는 테마 버튼 (White → Gray → Dark) = VS Code의
  색 테마 전환(Color Theme).

읽어낼 의도는 "띠 자체는 필요하나 뷰 전환은 필요 없다"이다. 그 자리에 무엇을 놓을지는
이번에 VS Code 기준으로 다시 정한다.

---

## 2. Side Bar 안의 탐색기

| tab-explorer에 있던 것 | VS Code 용어 | 한글 | 설명·예시 |
| --- | --- | --- | --- |
| `EXPLORER` 글자 | Explorer (View) | 탐색기 뷰 | 사이드 바에 들어가는 하나의 "뷰". 여기선 Explorer 하나만 있음 |
| `EXPLORER` 오른쪽 아이콘들(새 파일·새로고침·모두 접기) | View Actions | 뷰 액션(툴바) | VS Code Explorer의 New File, Refresh, Collapse Folders에 해당 |
| `projects`·`_clones`·`markdown-viewer` … 목록 | File Tree | 파일 트리 | 폴더/파일을 계층으로 보여주는 트리 |
| 폴더 앞 `▾`/`▸` | Twistie (chevron) | 펼침 화살표 | 눌러서 폴더를 펼치고 접음 |
| 트리 맨 위 `projects` | Root Folder | 루트 폴더 | 사용자가 연 최상위 폴더 |
| 들여쓴 세로선 | Indent Guides | 들여쓰기 안내선 | 깊이를 표시하는 세로선 |

---

## 3. 편집기 영역 (가운데 + 오른쪽)

이 프로젝트에서 가장 중요한 부분이다. 화면이 좌우 두 칸으로 갈려 있고, VS Code에서
이 한 칸을 Editor Group(편집기 그룹)이라 부른다.

| tab-explorer에 있던 것 | VS Code 용어 | 한글 | 설명·예시 |
| --- | --- | --- | --- |
| 가운데 칸 / 오른쪽 칸 | Editor Group | 편집기 그룹 | 왼쪽엔 `AGENTS.md`·`CLAUDE.md`, 오른쪽엔 `INIT.md`가 열림 |
| 좌우로 가르는 동작·결과 | Split Editor | 편집기 분할 | VS Code `Ctrl+\`. 문서 표현으로는 "좌우 가르기" |
| `AGENTS.md`, `CLAUDE.md ✕` 낱개 | Tab | 탭 | 열린 문서 하나 = 탭 하나 |
| 탭이 늘어선 가로 줄 | Editor Tab Bar | 탭 바 | 그룹 맨 위 탭 줄 |
| 진하게 강조된 `CLAUDE.md` | Active Tab | 활성 탭 | 지금 보는 탭 |
| 탭 오른쪽 `✕` | Tab Close Button | 닫기 버튼 | |
| 각 그룹 오른쪽 위 아이콘 | Editor Actions (Split Editor) | 편집기 액션 | 그 그룹을 또 나눔 |
| 탭 아래 렌더된 본문 | Editor (여기선 읽기 전용 보기) | 편집기 본문 | 이 자리에 무엇을 그릴지가 갈아끼우는 부분 |

**용어 주의 — VS Code의 "Panel"과 헷갈리기 쉬움.** VS Code에서 터미널은 화면 아래
가로 영역인 Panel에 뜬다. 그러나 workbench-kit의 폴더 탐색기는 "탭 영역(= Editor
Group)에 터미널을 연다". 즉 이 프로젝트는 하단 Panel을 쓰지 않고 터미널도 하나의
탭으로 편집기 그룹 안에 넣는다. 이는 INTENT의 "탭은 파일 경로가 아니다"와 직접
연결된다.

---

## 4. 상태 표시줄 (맨 아래)

tab-explorer가 이 줄에 둔 것은 두 가지뿐이었다.

- 왼쪽: 지금 파일의 경로 (`D:\projects\_clones\markdown-viewer\CLAUDE.md`).
- 오른쪽: `Markdown Viewer v0.1 (2026-09-07) · Electron`.

VS Code의 Status Bar와 같은 자리다. 언어 모드·줄/열·인코딩 같은 항목은 쓰이지
않았고, 이 자리를 최소한으로 두려는 의도로 읽는다. 실제로 무엇을 놓을지는 이번에
정한다.

---

## 5. VS Code엔 있지만 tab-explorer엔 없었던 것 (제1원칙의 증거)

아래는 없이도 실제로 쓰였다. 사용자가 그것들을 필요로 하지 않았다는 관찰이며,
"기능 최소·인터페이스 단순"이라는 제1원칙을 뒷받침하는 증거로 쓴다. 이 목록 자체가
결정은 아니다 — 확정은 `DECISIONS.md`와 [`vscode-reuse-plan.md`](vscode-reuse-plan.md)에 있다.

- Activity Bar의 뷰 전환 버튼(검색 / 소스 제어 / 실행·디버그 / 확장) — 없었음. 탐색기 하나만.
- 하단 Panel(통합 터미널 / 문제 / 출력 / 디버그 콘솔) — 없었음. 터미널은 3절대로 탭으로.
- Command Palette(`Ctrl+Shift+P`) — 없었음.
- Breadcrumbs(탭 아래 경로 이동줄) — 없었음.
- Minimap(편집기 오른쪽 축소 지도) — 없었음.
- Secondary Side Bar(오른쪽 보조 사이드 바) — 없었음.
- 설정/계정(Activity Bar 하단 아이콘) — 없었음. 자리엔 테마 버튼만.

---

## 6. 정리 — "VS Code OSS를 참조한다"의 실제 대상

| 구분 | 요소 |
| --- | --- |
| 참조 O | Title Bar / Menu Bar · Activity Bar(축소형) · Primary Side Bar + Explorer 트리 · Editor Group과 Split Editor · Tab / Tab Bar · Status Bar · Color Theme |
| 참조 X (범위 밖) | Panel · Command Palette · Breadcrumbs · Minimap · Secondary Side Bar · SCM / 검색 / 디버그 / 확장 뷰 |

이 표는 BRIEF 완료 조건이 요구하는 "VS Code 동작과 채택 동작을 사람이 대조할 수
있는 기준 문서"의 재료다. 정식 기준 문서로 승격할 때 뼈대가 될 수 있다.

다만 그 기준 문서는 **VS Code를 왼쪽 열에 놓고 쓴다.** tab-explorer가 어땠는지는
거기 들어가지 않는다. 이 참조 메모의 역할은 "사용자가 무엇을 원했는지"를 넘겨주는
데서 끝난다.
