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

### UT-EXP-004 — `File Tree` 하위 폴더의 들여쓰기와 세로 정렬선

| 구분 | 내용 |
| --- | --- |
| 사용자 요청 | `Explorer (View)`의 `File Tree`에서 하위 폴더를 펼칠 때 계층 들여쓰기를 적용한다. 세로 정렬선은 제거하지 않는다. |
| 원인 — 사용자 확인 | 문제의 세로선은 `Activity Bar`와 `Primary Side Bar`의 구분선이 아니라 `File Tree`의 세로 정렬선이다. 하위 폴더가 열릴 때 들여쓰기가 적용되지 않아, 세로 정렬선이 `Primary Side Bar` 좌측 경계에 붙은 추가 선처럼 보인다. |
| 재현 조건 — 사용자 확인 | `Explorer (View)`의 `File Tree`에서 폴더를 `v` 모양으로 아래로 연다. 하위 폴더 항목에 들여쓰기가 적용되지 않아 세로 정렬선이 좌측 경계에 나타난다. |
| 실제 화면 관찰 | 현재 두 호스트 화면에서 `Activity Bar`와 `Primary Side Bar` 사이의 기본 세로 경계선과 펼쳐진 `Root Folder`를 확인했다. 현재 화면에서는 `Root Folder`와 바로 아래 항목의 시작 위치 차이가 충분히 드러나지 않아, 세로 `Indent Guides`가 좌측 경계에 붙은 추가 선처럼 보인다. 구현에는 깊이별 들여쓰기 계산이 있으나, 이 시각적 결과를 판정하는 기존 자동 검사는 없다. |
| 현재 판정 | 사용자 화면에서 현상 확인. 들여쓰기의 실제 시각적 위치를 보완한 뒤 재검증 필요. |
| 사용자의 의도 | 확인 완료. `File Tree`의 폴더 계층을 들여쓰기로 명확히 구분하고, 세로 정렬선은 각 계층의 들여쓰기 위치에서 계층 구조를 보조하도록 유지한다. |
| 기대 결과 | 폴더를 펼치면 하위 폴더와 파일이 상위 폴더보다 오른쪽으로 들여쓰기된다. 세로 정렬선은 `Primary Side Bar`의 좌측 경계가 아니라 해당 `File Tree` 계층의 들여쓰기 위치에 나타난다. |
| 재검증 기준 | 두 호스트에서 두 단계 이상 중첩된 `File Tree` 폴더를 펼치고 접는다. 각 하위 항목이 상위 항목보다 들여쓰기되고, 세로 정렬선이 각 계층의 들여쓰기 위치에만 나타나는지 확인한다. |
| 재검증 결과 | 미실시. |

### UT-EXP-005 — `Explorer (View)` 아이콘의 Color Theme·File Icon Theme 적용

| 구분 | 내용 |
| --- | --- |
| 사용자 요청 | `Explorer (View)`의 아이콘 색상이 현재 `Color Theme`에 맞게 변경되도록 한다. `Light Color Theme`과 `Dark Color Theme` 사이를 전환했을 때 각 배경에서 아이콘이 명확하게 보여야 한다. 또한 `File Tree`의 폴더·파일 아이콘은 `_clones/tab-explorer-templates`의 VS Code 아이콘과 동일하게 적용하며, `Built-in`과 `vscode-icons` 두 `File Icon Theme`을 사용한다. |
| 현재 상태 — 사용자 확인 | `Light Color Theme`과 `Dark Color Theme` 사이에서 변경해도 `Explorer (View)`의 아이콘 색상이 바뀌지 않는다. 현재 `File Tree`의 폴더·파일 아이콘도 `_clones/tab-explorer-templates`에 표시되는 VS Code 아이콘과 다르다. |
| 참조 기준 점검 | `_clones/tab-explorer-templates`는 `Built-in`에서 VS Code Seti 글꼴 glyph를 사용하고, `vscode-icons`에서 파일 종류별 SVG를 사용한다. 파일명·복합 확장자·확장자·language ID 순으로 아이콘을 해석하고, 열린 폴더와 닫힌 폴더를 서로 다른 아이콘으로 표시한다. 이 프로젝트의 적용 결과는 해당 참조 프로젝트의 실제 자산과 매핑 결과를 기준으로 대조한다. |
| 구현 상태 점검 | 현재 구현에는 Dark·Light·Gray Theme별 전경색 변수와 File Icon Theme의 Color Theme 전달 경로가 있고, `seti`와 `vscode-icons` Resolver도 존재한다. `View Actions`는 상위 전경색을 상속하고 File Icon Resolver도 Color Theme별 색상을 계산하도록 구성되어 있다. 그러나 사용자가 실제 창에서 확인한 결과는 Theme 전환 후 아이콘 색상이 반영되지 않으며, 폴더·파일 아이콘의 실제 모양도 참조 프로젝트와 일치하지 않는다. |
| 적용 원칙 | `Color Theme`과 `File Icon Theme`은 독립적으로 동작한다. `Color Theme`은 아이콘의 가시성과 전경색을 결정하고, `File Icon Theme`은 `Built-in` 또는 `vscode-icons`의 자산과 파일 종류별 매핑을 결정한다. |
| 현재 판정 | Theme별 색상 정의와 두 File Icon Resolver 경로는 존재하지만, 실제 색상과 폴더·파일 아이콘 표시 결과가 사용자 요청 및 참조 프로젝트와 일치하지 않는다. |
| 사용자의 의도 | `Explorer (View)`의 `View Actions`, `Twistie (chevron)`, 폴더·파일 아이콘이 현재 `Color Theme`의 배경과 충분한 대비를 이루도록 한다. `File Tree`의 폴더·파일 아이콘은 `_clones/tab-explorer-templates`에서 확인한 `Built-in` 또는 `vscode-icons`의 자산과 매핑을 그대로 사용한다. |
| 기대 결과 | `Light Color Theme`에서는 어두운 전경색, `Dark Color Theme`에서는 밝은 전경색이 적용되어 `Explorer (View)`의 모든 아이콘을 명확히 식별할 수 있다. `Built-in`을 선택하면 참조 프로젝트와 같은 Seti glyph가, `vscode-icons`를 선택하면 같은 파일 종류별 SVG가 표시된다. 열린·닫힌 폴더 상태와 파일명·확장자별 아이콘도 참조 프로젝트와 일치한다. Theme를 전환하면 앱을 다시 열지 않아도 즉시 갱신되며 Electron과 pywebview에서 같은 결과가 나온다. |
| 재검증 기준 | 두 호스트에서 `Light Color Theme`과 `Dark Color Theme`, `Built-in`과 `vscode-icons`를 조합해 확인한다. 각 조합에서 `View Actions`, 펼침·접힘 `Twistie (chevron)`, 열린·닫힌 폴더 아이콘, 대표 파일명과 단일·복합 확장자의 파일 아이콘을 `_clones/tab-explorer-templates` 화면과 대조한다. `Built-in`의 Seti glyph와 `vscode-icons`의 SVG 자산·매핑이 참조와 일치하는지, Theme 전환 직후 색상과 아이콘이 즉시 갱신되는지 확인한다. |
| 재검증 결과 | 미실시. |

### UT-EXP-006 — `Explorer (View)` Scrollbar의 Color Theme 적용

| 구분 | 내용 |
| --- | --- |
| 사용자 요청 | `Explorer (View)`의 `Scrollbar`에도 현재 `Color Theme`의 색상을 적용한다. |
| 현재 상태 — 사용자 확인 | `Explorer (View)`의 `Scrollbar` 색상이 `Light Color Theme`과 `Dark Color Theme`에 맞게 변경되지 않는다. |
| 구현 상태 점검 | 현재 스타일에는 `Explorer (View)` `Scrollbar`의 Track과 Thumb에 대한 Theme별 명시적 스타일이 없다. 따라서 `Explorer (View)`의 Theme 색상 체계와 별개인 기본 Scrollbar 표시가 나타날 수 있다. |
| 현재 판정 | `Explorer (View)` `Scrollbar`에 제품의 `Color Theme`이 적용되지 않아 요청과 다르다. |
| 사용자의 의도 | `File Tree`를 스크롤할 때 보이는 `Scrollbar`가 `Explorer (View)` 배경과 자연스럽게 어울리면서도 조작 위치를 식별할 수 있어야 한다. |
| 기대 결과 | `Light Color Theme`과 `Dark Color Theme` 각각에 맞는 `Scrollbar` Track과 Thumb 색상이 적용된다. Thumb의 기본·hover·active 상태가 Theme 안에서 구분되며, Theme를 전환하면 색상이 즉시 갱신된다. Electron과 pywebview에서 같은 결과가 나온다. |
| 재검증 기준 | 두 호스트에서 `File Tree` 항목을 충분히 늘려 세로 `Scrollbar`를 표시한다. `Light Color Theme`과 `Dark Color Theme`을 각각 적용해 Track과 Thumb의 기본·hover·active 색상을 확인하고, Theme 전환 직후 색상이 갱신되는지 확인한다. 가로 `Scrollbar`가 나타나는 조건에서도 같은 기준을 적용한다. |
| 재검증 결과 | 미실시. |

## 공통 레이아웃 치수

### UT-LYT-001 — 주요 VS Code UI 영역 30px 고정

| 구분 | 내용 |
| --- | --- |
| 사용자 요청 | `Title Bar`, `Status Bar`, `Activity Bar`, `Explorer (View)`의 제목·`View Toolbar / View Actions`, `Editor Tab Bar`를 모두 30px로 고정한다. |
| 적용 대상 | `Title Bar`(높이), `Status Bar`(높이), `Activity Bar`(너비), `Explorer (View)`의 제목·`View Toolbar / View Actions` 영역(높이), `Editor Tab Bar`(높이). |
| 실제 화면 관찰 | 현재 산출물의 적용값은 `Title Bar` 높이 30px, `Status Bar` 높이 22px, `Activity Bar` 너비 50px, `Explorer (View)` 제목·`View Toolbar / View Actions` 높이 35px, `Editor Tab Bar` 높이 35px다. 화면 캡처에서도 영역별 크기 차이가 보인다. |
| 현재 판정 | `Title Bar`만 30px다. 나머지 네 영역은 요청한 30px와 다르다. |
| 사용자의 의도 | 확인 완료. 창 최대화·복원, 테마 변경, 시스템 디스플레이 배율 변경에도 지정한 치수를 CSS 픽셀 기준으로 고정한다. |
| 기대 결과 | `Title Bar`, `Status Bar`, `Explorer (View)` 제목·`View Toolbar / View Actions`, `Editor Tab Bar`의 높이가 각각 정확히 30 CSS px이다. 세로 영역인 `Activity Bar`의 너비도 정확히 30 CSS px이다. 창 최대화·복원, 테마 변경, 시스템 디스플레이 배율 변경 후에도 값이 변하지 않는다. 두 호스트에서 같은 치수로 보인다. |
| 재검증 기준 | 두 호스트에서 창을 최대화·복원하고, 모든 테마와 시스템 디스플레이 배율 변경 상태를 각각 확인한다. 각 상태에서 개발자 도구 또는 화면 측정 도구로 `Title Bar`, `Status Bar`, `Explorer (View)` 제목·`View Toolbar / View Actions`, `Editor Tab Bar`의 높이와 `Activity Bar`의 너비를 측정해 모든 값이 30 CSS px인지 확인한다. |
| 재검증 결과 | 미실시. |

## 표시 언어와 UI 용어

### UT-LNG-001 — 제품 제공 UI 텍스트의 영어 통일

| 구분 | 내용 |
| --- | --- |
| 사용자 요청 | `Menu Bar`와 모든 메뉴 항목, 화면의 UI 라벨·버튼·상태 메시지, 마우스를 올렸을 때 나타나는 `Tooltip`, 그 밖의 제품 제공 용어를 한국어가 아닌 영어로 표시한다. 실제 파일·폴더명과 사용자 데이터는 원문을 유지한다. |
| 적용 대상 | `Menu Bar`, 드롭다운 메뉴, `Context Menu`, `View Actions`, 버튼, 다이얼로그, 상태 메시지, 빈 상태 안내, `Tooltip` 등 제품이 표시하는 모든 텍스트 UI. |
| 실제 화면 관찰 | 실런타임 검사에서 `File` 메뉴의 `폴더 열기`, `최근 폴더`, `탭 닫기`, `폴더 닫기`, `끝내기`, `View` 메뉴의 한국어 항목 10개, `Help > 정보`가 두 호스트에 표시됨을 확인했다. `Title Bar` 프로그램명, `Explorer (View)` 제목, `View Actions` 등 일부 UI는 영어다. `Tooltip` 전체는 점검하지 않았다. `File Tree`의 실제 파일·폴더명은 사용자 데이터이므로 이 언어 점검 대상에서 제외한다. |
| 현재 판정 | 제품 제공 UI에 한국어가 있으므로 요청과 다르다. 전체 `Tooltip` 언어는 추가 점검이 필요하다. |
| 사용자의 의도 | 확인 완료. 제품이 제공하는 모든 UI 용어의 표시 언어를 영어로 일관되게 유지한다. 실제 파일·폴더명과 사용자 데이터는 제품 UI가 아니므로 원문을 보존한다. |
| 기대 결과 | 사용자에게 보이는 제품 제공 텍스트 UI에서 한국어가 나타나지 않는다. 메뉴와 `Tooltip`을 포함한 같은 기능의 명칭은 두 호스트에서 같은 영어 표현을 쓴다. 실제 파일·폴더명과 사용자 데이터는 바꾸지 않는다. |
| 재검증 기준 | Electron과 pywebview에서 모든 `Menu Bar` 메뉴·드롭다운·`Context Menu`·`View Actions`·다이얼로그·상태 메시지·빈 상태 안내를 열고, 각 버튼과 아이콘 위에 마우스를 올려 `Tooltip`을 확인한다. 제품 제공 텍스트 중 한국어가 0개인지, 두 호스트의 영어 표현이 같은지 확인한다. 실제 파일·폴더명과 사용자 데이터가 변경되지 않았는지도 확인한다. |
| 재검증 결과 | 미실시. |

#### 확인된 메뉴 표기

| 현재 표기 | 목표 표기 | 위치 |
| --- | --- | --- |
| `정보` | `About` | `Menu Bar` > `Help` |

## `Menu Bar` 표시

### UT-MNU-001 — `File`·`View`·`Help`의 VS Code 하위 메뉴 표시

| 구분 | 내용 |
| --- | --- |
| 사용자 요청 | `Menu Bar`의 `File`, `View`, `Help` 우측 하위 메뉴 표시를 현재의 텍스트 삼각형에서 VS Code와 같은 `Twistie (chevron)` 아이콘으로 바꾼다. ASCII 문자 `>`를 쓰지 않는다. |
| 현재 상태 — 사용자 확인 | `File`, `View`, `Help` 우측에 삼각형 하위 메뉴 표시가 있다. |
| 실제 화면 관찰 | 실런타임 검사에서 두 호스트의 `Menu Bar`에 `File`, `View`, `Help`가 같은 순서로 표시되고 하위 메뉴가 열리는 것을 확인했다. 현재 하위 메뉴 표시는 텍스트 삼각형 `▶`다. `File Tree`의 폴더 펼침 표시는 ASCII 문자가 아닌 별도의 `Twistie (chevron)` 아이콘이다. |
| 현재 판정 | 현재 텍스트 삼각형은 요청한 VS Code `Menu Bar` 표시와 다르다. |
| 사용자의 의도 | 확인 완료. `Menu Bar`의 하위 메뉴 진입 표시는 텍스트 문자가 아니라 VS Code 메뉴에 사용되는 `Twistie (chevron)` 아이콘을 그대로 따른다. |
| 기대 결과 | Electron과 pywebview 모두 `File`, `View`, `Help` 우측에 동일한 `Twistie (chevron)` 아이콘이 표시된다. 현재의 텍스트 삼각형 `▶`과 ASCII `>`는 표시되지 않는다. |
| 재검증 기준 | 두 호스트에서 `Menu Bar`를 열고 `File`, `View`, `Help` 항목 각각의 우측 표시를 VS Code `Menu Bar` 화면과 대조한다. 세 항목에 동일한 `Twistie (chevron)` 아이콘이 사용되고 텍스트 삼각형 `▶`이나 ASCII `>`가 남아 있지 않은지 확인한다. |
| 재검증 결과 | 미실시. |

### UT-MNU-002 — `File`·`View` 메뉴 항목과 순서

| 구분 | 내용 |
| --- | --- |
| 사용자 요청 | `Menu Bar`의 `File`과 `View` 항목을 아래 목표 구조와 순서로 변경한다. 사용자가 전달한 숫자는 순서를 설명하기 위한 것이므로 실제 메뉴의 라벨에는 표시하지 않는다. `Help` 메뉴는 기존 확정 내용을 유지한다. |
| 참조 구현 확인 | `_clones/tab-explorer-templates`의 `File` 메뉴는 Open Folder, Recent Folders, Split Editor, Move Tab, Close Tab, Close All Tabs, Exit 구조이고, `View` 메뉴는 Color Theme, Icon Theme, Zen Mode, Show Sidebar, Show Status Bar 구조다. 이번 목표 구조는 이 표현 방식을 기준으로 workbench-kit에 필요한 항목을 재구성한 사용자 확정안이다. |
| 현재 구현 점검 | 현재 workbench-kit의 `File` 메뉴는 `[폴더 열기] [최근 폴더] [탭 닫기] [폴더 닫기] [끝내기]`이고, `View` 메뉴는 한국어 라벨의 영역 Toggle, Zen Mode, Theme 전환, Split Editor, Active Group Tab 닫기, Context Menu Toggle로 구성되어 있다. 목표 구조·순서·영어 표시와 다르다. |
| `Recent Folders` | `Recent Folders` 아래에 최근 경로 목록을 표시한다. 목록이 없으면 `(Empty)`를 표시하고, 우측에는 경로 삭제 Action을 제공한다. |
| `Color Theme` | `White`, `Gray`, `Dark`를 이 순서로 표시한다. |
| `Icon Theme` | `VS Code Built-in`, `VS Code Icons`를 이 순서와 표기로 표시한다. `Simple`은 표시하지 않는다. 아이콘 자산과 매핑 기준은 UT-EXP-005를 따른다. |
| 닫기 Actions | `Close Active Tab`은 현재 Active Tab 하나를 닫으며 기존 `Close Tab` 동작과 같다. `Close Editor Group`은 Active Tab이 속한 `Editor Group` 전체를 닫는다. `Close All Tabs`는 열린 모든 Tab을 닫는다. `Close Split`이라는 표현은 사용하지 않는다. |
| Keyboard Shortcut 표시 | VS Code 방식으로 `Keyboard Shortcut`이 정의된 메뉴 항목의 우측에 단축키를 정렬해 표시한다. 확정된 표기는 `Open Folder... — Ctrl+O`, `Close Active Tab — Ctrl+W`, `Exit — Alt+F4`, `Zen Mode — F11`, `Show Sidebar — Ctrl+B`다. 그 밖의 항목에는 임의의 단축키나 빈 단축키 텍스트를 표시하지 않는다. 메뉴 표기와 실제 키 입력 동작은 일치해야 한다. |
| 구분선 | `File`에는 `Open Folder...` 다음, `Recent Folders` 영역 다음, `Close All Tabs` 다음에 구분선을 표시한다. `View`에는 `Color Theme` 영역 다음, `Icon Theme` 영역 다음, `Show Status Bar` 다음에 구분선을 표시한다. |
| 기존 항목 이동 | `Preset Info`는 UT-EXP-002에 따라 `Explorer (View)`의 `View Actions`에서 제거하고 `View` 메뉴에 표시한다. `Split Right`와 `Split Down`은 UT-ACT-001에 따라 `Activity Bar`에서 제거하되 `File` 메뉴에서 제공한다. |
| `Help` 유지 | `Help`는 `About` 단일 항목을 사용한다. `About`을 선택하면 현재와 같은 방식으로 별도의 정보 창을 연다. 제품 UI 영어 표시 원칙에 따라 `정보`라는 한국어 라벨은 표시하지 않는다. |
| 현재 판정 | 현재 메뉴는 목표 항목, 순서, 그룹, 영어 표기를 충족하지 않는다. |
| 기대 결과 | Electron과 pywebview에서 `File`과 `View` 메뉴가 아래 목표 구조와 같은 순서로 표시된다. 메뉴 라벨 앞에는 순서 번호를 표시하지 않는다. `Keyboard Shortcut`이 정의된 항목은 단축키가 우측 정렬로 표시되고, 정의되지 않은 항목에는 단축키가 표시되지 않는다. 현재 선택된 Color Theme, Icon Theme, 표시 상태를 나타내는 기존 상태 표시는 해당 메뉴 항목과 함께 정상 동작한다. |
| 재검증 기준 | 두 호스트에서 `File`과 `View` 메뉴를 열어 아래 구조와 위에서 아래 순서를 대조한다. 각 Action을 실행하고 표시된 `Keyboard Shortcut`도 직접 입력해 같은 결과가 나오는지 확인한다. 단축키가 정의된 모든 항목의 우측 표기와 실제 동작이 일치하는지, 정의되지 않은 항목에 임의 표기가 없는지 확인한다. 최근 경로 표시·삭제, Theme 선택 상태, UI 영역 표시 상태가 메뉴를 다시 열었을 때 갱신되는지 확인한다. 메뉴 항목에 숫자 접두사가 없는지와 `Help > About`이 유지되는지도 확인한다. |
| 재검증 결과 | 미실시. |

#### 목표 메뉴 구조

`File`

- `Open Folder...` — `Ctrl+O`
- 구분선
- `Recent Folders`
  - 목록이 없으면 `(Empty)`
  - 우측 경로 삭제 Action
- 구분선
- `Split Right`
- `Split Down`
- `Close Active Tab` — `Ctrl+W`
- `Close Editor Group`
- `Close All Tabs`
- 구분선
- `Exit` — `Alt+F4`

`View`

- `Color Theme`
  - `White`
  - `Gray`
  - `Dark`
- 구분선
- `Icon Theme`
  - `VS Code Built-in`
  - `VS Code Icons`
- 구분선
- `Zen Mode` — `F11`
- `Show Sidebar` — `Ctrl+B`
- `Show Title Bar`
- `Show Status Bar`
- 구분선
- `Preset Info`

`Help`

- `About`
  - 현재와 같은 별도의 정보 창 열기

## 분할 문서

`Title Bar`, `Status Bar`, `Editor Area`, `Focus Area`와 Selection 관련 기록은 [user-tests-editor.md](./user-tests-editor.md)에서 이어진다.
