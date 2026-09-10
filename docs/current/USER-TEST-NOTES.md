# User Test Notes — workbench-kit

> 기록 시작일: 2026-09-10  
> 상태: 사용자 테스트 진행 중  
> 범위: 코드 수정 없이 사용자 지적·요청, 확인 질문, 두 호스트의 실제 화면 관찰 결과를 기록한다.

## 테스트 환경과 확인 기준

| 항목 | 기록 |
| --- | --- |
| 비교 대상 | Electron 호스트, pywebview 호스트 |
| 공통 산출물 | 두 호스트 모두 현재 `dist/` 산출물을 읽어 실행 중 |
| 화면 관찰 시점 | 2026-09-10, 사용자가 두 호스트 창을 동시에 연 상태. 현재 화면 캡처로 `Explorer (View)`, `Editor Area`, `Title Bar`를 다시 대조했다. |
| 실런타임 점검 | Electron·pywebview에서 `verify:dist`, `verify:phase4`, `verify:phase7`을 실행했다. 두 호스트가 같은 `dist/`를 렌더링하며 기존 검증 항목에서 차이가 0개임을 확인했다. |
| 기록 원칙 | 사용자 요청, 실제 화면 관찰, 사용자 의도·기대 결과, 재검증 결과를 서로 섞지 않는다. 확인 전 항목은 추정하지 않는다. |
| UI 용어 | UI 요소는 `docs/refs/vscode-ui-reference.md`에서 정의한 VS Code 공통 용어로 통일한다. |

## `Activity Bar` Actions

### UT-ACT-001 — `Activity Bar` Actions의 제거와 상·하단 배치

| 구분 | 내용 |
| --- | --- |
| 사용자 요청 | `Activity Bar`에서 `Split Editor Right`와 `Split Editor Down` 아이콘을 제거한다. `Toggle Title Bar` 아이콘은 `Activity Bar` 맨 위로 옮기고, `Toggle Status Bar` 아이콘은 맨 아래로 옮긴다. |
| 현재 구현 점검 | 현재 `Activity Bar` 상단에는 `[Toggle Primary Side Bar] [Toggle Title Bar] [Toggle Status Bar] [Split Editor Right] [Split Editor Down] [Zen Mode]`가 있고, 하단에는 `[Color Theme]`이 있다. `Zen Mode`와 `Color Theme`은 UT-CHR-002에 따라 `Title Bar` 우측으로 이동하는 대상으로 이미 기록되어 있다. |
| 제거 대상 | `Split Editor Right`와 `Split Editor Down` Actions를 `Activity Bar`에서 제거한다. `Split Editor` 기능 자체와 `Editor Tab Bar` 또는 메뉴에서 제공하는 진입 경로는 제거하지 않는다. |
| 상단 배치 | `Toggle Title Bar`를 `Activity Bar`의 첫 번째 Action으로 배치한다. `Toggle Primary Side Bar`를 포함해 상단에 남는 다른 Actions보다 위에 표시한다. |
| 하단 배치 | `Toggle Status Bar`를 `Activity Bar`의 마지막 Action으로 배치한다. 하단에 남는 다른 Actions가 있더라도 그 아래, 즉 맨 아래에 표시한다. |
| 사용자의 의도 | 전역 레이아웃 표시를 제어하는 `Title Bar`와 `Status Bar` Actions를 각각 화면의 위·아래 방향과 대응되는 위치에 두고, Editor 분할 Actions는 `Activity Bar`에서 제거해 역할을 단순화한다. |
| 기대 결과 | `Activity Bar` 맨 위에는 `Toggle Title Bar`, 맨 아래에는 `Toggle Status Bar`가 표시된다. `Split Editor Right`, `Split Editor Down`, `Zen Mode`, `Color Theme` 아이콘은 `Activity Bar`에 표시되지 않는다. `Toggle Primary Side Bar`를 비롯해 유지되는 다른 Actions는 두 끝점 사이에 배치된다. 각 Action의 아이콘과 `Tooltip`은 기존 제품 UI 언어 및 VS Code 아이콘 원칙을 따른다. |
| 재검증 기준 | 두 호스트에서 `Activity Bar`의 맨 위와 맨 아래 Action을 확인한다. `Split Editor Right`와 `Split Editor Down` 아이콘이 없고, UT-CHR-002에 따라 `Zen Mode`와 `Color Theme`도 중복 표시되지 않는지 확인한다. `Toggle Title Bar`와 `Toggle Status Bar`를 각각 클릭해 해당 영역만 숨김·표시되는지 확인하고, `Split Editor` 기능은 `Editor Tab Bar` 또는 메뉴의 기존 진입 경로에서 계속 동작하는지 확인한다. |
| 재검증 결과 | 미실시. |

## `Primary Side Bar`의 `Explorer (View)`

### UT-EXP-001 — `Explorer (View)` 제목

| 구분 | 내용 |
| --- | --- |
| 사용자 요청 | `Explorer (View)` 제목의 루트 폴더 이름을 `EXPLORER`로 바꾼다. |
| 실제 화면 관찰 | 현재 두 호스트 창에서 `Explorer (View)` 제목에 `WORKBENCH-KIT`이 표시되고, `File Tree` 최상단에는 열린 `Root Folder` `workbench-kit`이 보인다. |
| 현재 판정 | 요청과 다름. |
| 사용자의 의도 | 확인 완료. 열린 `Root Folder`는 `File Tree` 최상단에서 이미 보이므로, `Explorer (View)` 제목에 같은 루트 폴더명을 별도로 중복 표시할 필요가 없다. |
| 기대 결과 | `Explorer (View)` 제목에는 고정 제목 `EXPLORER`만 표시한다. 열린 `Root Folder`명은 `File Tree` 최상단에서 확인한다. |
| 재검증 기준 | 두 호스트의 `Explorer (View)` 제목이 정확히 `EXPLORER`로 보이고, 제목에는 `Root Folder`명이 중복 표시되지 않는지 확인한다. |
| 재검증 결과 | 미실시. |

### UT-EXP-002 — `Explorer (View)`의 `View Toolbar / View Actions`

| 구분 | 내용 |
| --- | --- |
| 사용자 요청 | `Explorer (View)`의 `View Toolbar / View Actions`를 VS Code 방식으로 바꾼다. 최종 순서는 `[New File] [New Folder] [Refresh] [Collapse All]`이며, VS Code 아이콘을 그대로 사용한다. |
| 현재 상태 — 사용자 확인 | 현재 순서는 `[Preset Info] [Collapse All] [Refresh]`이다. |
| 실제 화면 관찰 | 현재 두 호스트 창과 실런타임 검사에서 `Explorer (View)` `View Toolbar / View Actions`에 `[Preset Info] [Collapse All] [Refresh]` 3개가 있음을 확인했다. `Collapse All`과 `Refresh`는 실제 클릭 결과도 두 호스트에서 통과했다. |
| 현재 판정 | 요청한 명령 구성과 다름. |
| 사용자의 의도 | 확인 완료. 현재의 `Preset Info`를 제거하고, `Explorer (View)`에서 파일과 폴더를 만들 수 있는 `View Actions`를 추가한다. `Refresh`와 `Collapse All`은 유지하되 VS Code 순서로 배치한다. |
| 기대 결과 | 두 호스트의 `Explorer (View)` `View Toolbar / View Actions`에 `[New File] [New Folder] [Refresh] [Collapse All]` 4개가 왼쪽에서 오른쪽 순서로 표시된다. `New File` 또는 `New Folder`를 누르면 이름을 입력하고, 현재 선택된 `File Tree` 폴더 아래에 각각 파일 또는 폴더를 생성한다. |
| 재검증 기준 | 두 호스트에 4개 `View Actions`가 위 순서와 VS Code 아이콘으로 표시되고, `Preset Info`는 표시되지 않는지 확인한다. 현재 선택된 `File Tree` 폴더를 기준으로 파일과 폴더를 각각 하나씩 생성해 이름과 위치를 확인한 뒤, `Refresh`와 `Collapse All`도 한 번씩 실행해 결과를 확인한다. |
| 재검증 결과 | 미실시. |

### UT-EXP-003 — `Primary Side Bar` 너비 조절

| 구분 | 내용 |
| --- | --- |
| 사용자 요청 | `Primary Side Bar`의 너비를 사용자가 조절할 수 있게 한다. 초기 너비는 현재 폭으로 한다. 최소 너비는 `Explorer (View)` 제목 `EXPLORER`와 `View Toolbar / View Actions`의 4개 아이콘을 모두 표시할 수 있는 폭으로 하고, 우측 최대 확장 폭은 VS Code와 같은 수준으로 한다. 앱을 다시 열면 사용자가 조절한 폭은 유지하지 않고 초기 너비를 적용한다. |
| 실제 화면 관찰 | 현재 화면에서 `Primary Side Bar`와 `Editor Area`를 구분하는 세로 경계선은 보인다. 현재 구현은 `Primary Side Bar` 너비를 240px로 고정하며, 이 경계에 너비 조절용 드래그 장치가 없다. |
| 현재 판정 | 요청한 너비 조절을 지원하지 않는다. |
| 사용자의 의도 | 확인 완료. `Explorer (View)` 제목과 4개 `View Actions`가 잘리지 않는 범위까지는 `Primary Side Bar`를 줄일 수 있어야 하며, 필요하면 VS Code와 같은 수준까지 넓혀 사용할 수 있어야 한다. 조절한 폭을 설정으로 보존할 필요는 없고, 앱을 다시 열면 항상 현재 화면의 초기 폭으로 시작해야 한다. |
| 기대 결과 | `Primary Side Bar`와 `Editor Area` 사이 경계선을 드래그해 폭을 조절할 수 있다. 최소 폭에서는 `EXPLORER`와 `[New File] [New Folder] [Refresh] [Collapse All]`이 모두 보이고, 최대 폭은 VS Code와 같은 사용성 수준까지 확장된다. 앱을 다시 열면 `Primary Side Bar` 폭은 현재의 초기값으로 되돌아온다. |
| 재검증 기준 | 두 호스트에서 경계선을 좌우로 드래그했을 때 `Primary Side Bar` 폭이 연속적으로 바뀌는지 확인한다. 최소 폭에서 `Explorer (View)` 제목과 4개 `View Actions`가 잘리지 않는지, 최대 폭에서 VS Code와 동등한 수준까지 확장되는지 확인한다. 폭을 바꾼 뒤 앱을 닫고 다시 열어 현재 초기 폭으로 복원되는지 확인한다. |
| 재검증 결과 | 미실시. |
