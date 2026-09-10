# User Test Notes — workbench-kit: Window and Editor

> 기록 시작일: 2026-09-10  
> 상태: 사용자 테스트 진행 중  
> 범위: 코드 수정 없이 `Title Bar`, `Status Bar`, `Editor Area`, `Focus Area`와 Selection 관련 사용자 요청·확인 결과를 기록한다.  
> 관련 문서: Shell·Activity Bar·Explorer·Layout·Language·Menu 기록은 [user-tests-shell.md](./user-tests-shell.md)를 참조한다.

## `Title Bar`와 `Status Bar` 정보 배치

### UT-CHR-001 — `Title Bar` 프로그램 정보의 좌측 정렬

| 구분 | 내용 |
| --- | --- |
| 사용자 요청 | `Title Bar`에 표시되는 프로그램 이름 `workbench-kit`을 햄버거 아이콘 바로 오른쪽으로 옮겨 좌측 정렬한다. 표시 형식은 `Workbench-Kit v0.1 (YYYY-MM-DD) - {Host Name}`이며, 날짜는 마지막 커밋일(마지막 코드 수정일자)이다. `{Host Name}`은 Electron 호스트에서는 `Electron`, pywebview 호스트에서는 `PyWebView`로 표시한다. |
| 실제 화면 관찰 | 현재 화면과 실런타임 검사에서 두 호스트의 `Title Bar` 햄버거 아이콘은 좌측, `workbench-kit`은 중앙, 창 버튼 3개는 우측에 있음을 확인했다. 햄버거 아이콘 옆에는 아직 지정한 프로그램·버전·날짜·호스트 정보 형식이 표시되지 않는다. |
| 현재 판정 | 요청한 위치와 표시 형식과 다름. |
| 사용자의 의도 | 확인 완료. 프로그램·버전·마지막 커밋일(마지막 코드 수정일자)·호스트 정보를 햄버거 아이콘 옆에서 한 줄로 확인한다. |
| 기대 결과 | `Title Bar`에서 햄버거 아이콘 바로 오른쪽에 프로그램 정보가 좌측 정렬로 표시된다. Electron은 `Workbench-Kit v0.1 (마지막 커밋일) - Electron`, pywebview는 `Workbench-Kit v0.1 (마지막 커밋일) - PyWebView` 형식을 쓴다. |
| 재검증 기준 | 두 호스트의 `Title Bar`에서 프로그램 정보가 햄버거 아이콘 바로 오른쪽에 좌측 정렬되는지, 표시한 날짜가 마지막 커밋일(마지막 코드 수정일자)인지, 버전·날짜·호스트 이름의 대소문자와 구분 기호가 지정 형식과 정확히 같은지 확인한다. |
| 재검증 결과 | 미실시. |

### UT-CHR-002 — `Color Theme`·`Zen Mode` Actions의 `Title Bar` 우측 배치

| 구분 | 내용 |
| --- | --- |
| 사용자 요청 | `_clones/tab-explorer-templates`와 같은 방식으로 `Color Theme` 전환과 `Zen Mode` 전환 아이콘을 `Activity Bar`에서 `Title Bar` 우측으로 옮긴다. |
| 참조 구현 확인 | `_clones/tab-explorer-templates`의 `Title Bar` 우측 `Window Controls`에는 왼쪽부터 `[Zen Mode] [Color Theme] [Minimize] [Maximize/Restore] [Close]` 순서로 Actions가 배치되어 있다. `Zen Mode` Action은 활성 상태를 시각적으로 표시하고, `Color Theme` Action은 현재 Theme에 맞춰 아이콘 표시를 갱신한다. |
| 현재 구현 점검 | 현재 workbench-kit의 `Zen Mode` Action은 `Activity Bar` 상단에, `Color Theme` Action은 `Activity Bar` 하단에 있다. `Title Bar` 우측에는 `[Minimize] [Maximize/Restore] [Close]`만 배치되어 있다. |
| 현재 판정 | 두 전환 Actions의 위치가 참조 프로젝트 및 사용자 요청과 다르다. |
| 사용자의 의도 | 확인 완료. 전역 화면 상태를 바꾸는 `Color Theme`과 `Zen Mode` Actions를 창 제어 영역 가까이에 모으고, `Activity Bar`에서는 제거한다. |
| 기대 결과 | 두 호스트의 `Title Bar` 우측에 `[Zen Mode] [Color Theme] [Minimize] [Maximize/Restore] [Close]` 순서로 아이콘이 표시된다. `Activity Bar`에는 `Zen Mode`와 `Color Theme` Actions가 중복 표시되지 않는다. `Zen Mode` 아이콘은 현재 활성 여부를, `Color Theme` 아이콘은 현재 Theme 상태를 시각적으로 반영한다. 각 `Tooltip`과 접근성 이름은 제품 UI 언어 원칙에 따라 영어로 표시한다. 기존 `F11`과 Theme 전환 명령도 같은 상태를 변경한다. |
| 재검증 기준 | Electron과 pywebview에서 `Title Bar` 우측 아이콘 순서와 `Activity Bar`의 중복 제거를 확인한다. 아이콘과 `Tooltip`을 이용해 `Zen Mode`와 모든 `Color Theme`을 각각 전환하고 상태 표시가 즉시 갱신되는지 확인한다. `Minimize`, `Maximize/Restore`, `Close`의 위치와 동작이 유지되는지 확인하고, `F11` 및 메뉴 명령으로 바꾼 상태도 같은 아이콘에 반영되는지 확인한다. |
| 재검증 결과 | 미실시. |

### UT-STS-001 — `Status Bar` 우측 정보 제한

| 구분 | 내용 |
| --- | --- |
| 사용자 요청 | `Status Bar` 우측에는 `Presets` 정보만 남긴다. |
| 실제 화면 관찰 | 실런타임 검사에서 `Status Bar` 우측 기본 정보가 Electron에서는 `workbench-kit v0.1.0 · Electron`, pywebview에서는 `workbench-kit v0.1.0 · pywebview`임을 확인했다. 그 옆에는 `Presets: file, folder`도 표시된다. |
| 현재 판정 | `Presets` 외에 프로그램·버전·호스트 정보가 함께 있으므로 요청과 다르다. |
| 사용자의 의도 | 확인 완료. 프로그램 버전·호스트 정보는 `Title Bar`로 옮기고, `Status Bar` 우측은 `Presets` 정보만 표시해 간결하게 유지한다. |
| 기대 결과 | Electron과 pywebview 모두 `Status Bar` 우측에 `Presets` 정보만 표시된다. 프로그램 이름·버전·날짜·호스트 이름 등 다른 제품 제공 정보는 `Status Bar` 우측에 표시되지 않는다. |
| 재검증 기준 | 두 호스트에서 `Status Bar` 우측 영역을 확인해 `Presets` 정보만 있는지, 프로그램·버전·날짜·호스트 정보와 그 밖의 항목이 없는지 확인한다. |
| 재검증 결과 | 미실시. |

## `Editor Area` 파일 선택

### UT-EDT-001 — `File Tree` 파일·폴더 선택의 VS Code `Preview Tab` 동작

| 구분 | 내용 |
| --- | --- |
| 사용자 요청 | `File Tree`에서 파일과 폴더를 한 번 클릭했을 때 모두 VS Code 방식의 `Preview Tab`으로 연다. 파일과 폴더 모두 `Preview Tab` 제목을 더블클릭하거나 `File Tree`에서 선택한 상태로 `Enter`를 누르면 `Pinned Tab`으로 확정한다. 단, `File Tree`의 폴더 항목을 마우스로 더블클릭하면 `Pinned Tab`으로 확정하지 않고 해당 폴더를 여는 동작을 수행한다. |
| 현재 기준과의 차이 | 현재 `docs/vscode-comparison.md`는 `Preview Tab`·`Pinned Tab`을 사용하지 않고 파일 선택이 활성 `Tab` 내용을 바꾸는 방식이라고 기록한다. 이번 요청은 이 의도적 차이를 VS Code 방식으로 변경하는 요구다. |
| 파일 한 번 클릭 | `File Tree`에서 파일을 한 번 클릭하면 `Editor Area`의 `Editor Tab Bar`에 `Preview Tab`으로 연다. `Preview Tab` 제목은 이탤릭으로 표시한다. 이미 열린 `Preview Tab`이 있으면 VS Code와 같이 해당 `Preview Tab`을 새로 선택한 파일로 대체한다. |
| 파일 더블클릭 | `File Tree`에서 파일을 더블클릭하면 해당 파일 선택을 확정해 `Pinned Tab`으로 연다. `Tab` 제목의 이탤릭 표시를 해제한다. |
| 폴더 한 번 클릭 | `File Tree`에서 폴더를 한 번 클릭하면 파일과 같은 규칙으로 이탤릭 `Preview Tab`에 연다. 기존 `Preview Tab`이 있으면 새로 선택한 폴더로 대체한다. |
| 폴더 더블클릭 | `File Tree`의 폴더 항목을 더블클릭하면 `Pinned Tab`으로 전환하지 않는다. 해당 폴더를 열어 하위 항목을 표시하는 폴더 열기 동작을 수행한다. |
| `File Tree`에서 `Enter` | 파일 또는 폴더를 `File Tree`에서 선택한 상태로 `Enter`를 누르면 해당 `Preview Tab`을 `Pinned Tab`으로 확정하고, `Tab` 제목의 이탤릭 표시를 해제한다. |
| `Preview Tab` 제목 더블클릭 | 이탤릭으로 표시된 파일 또는 폴더의 `Preview Tab` 제목을 더블클릭하면 선택을 확정해 `Pinned Tab`으로 바꾸고, `Tab` 제목의 이탤릭 표시를 해제한다. 이 규칙은 `File Tree`의 폴더 항목 마우스 더블클릭과 구분한다. |
| 실제 화면 관찰 | 두 호스트의 실런타임 검사에서 현재 파일 선택은 활성 `Tab` 내용을 바꾸며, 다른 파일을 선택해도 `Tab` 수가 1개로 유지됨을 확인했다. 파일과 폴더는 같은 열기 규칙을 쓰며, 이탤릭 `Preview Tab`과 더블클릭 확정 `Pinned Tab` 구분은 없다. |
| 현재 판정 | 요청한 VS Code `Preview Tab`·`Pinned Tab` 동작을 지원하지 않는다. |
| 사용자의 의도 | 확인 완료. 파일과 폴더 모두 단일 선택에서는 임시 탐색용 `Preview Tab` 규칙을 사용하고, `Preview Tab` 제목 더블클릭 또는 `File Tree`의 `Enter` 입력으로 `Pinned Tab`을 확정한다. 파일 항목의 마우스 더블클릭은 `Pinned Tab`으로 전환하지만, 폴더 항목의 마우스 더블클릭은 폴더를 여는 동작으로 사용한다. |
| 기대 결과 | Electron과 pywebview에서 파일과 폴더를 한 번 클릭하면 같은 이탤릭 `Preview Tab`을 공유하고 새 단일 선택으로 대체된다. 파일 또는 폴더를 선택한 뒤 `Enter`를 누르거나 해당 `Preview Tab` 제목을 더블클릭하면 `Pinned Tab`이 된다. 파일 항목을 마우스로 더블클릭해도 `Pinned Tab`이 되지만, 폴더 항목을 마우스로 더블클릭하면 탭을 고정하지 않고 폴더가 열린다. |
| 재검증 기준 | 두 호스트에서 파일 A와 폴더 A를 차례로 한 번 클릭해 동일한 이탤릭 `Preview Tab`이 선택 대상에 따라 대체되는지 확인한다. 파일 B를 마우스로 더블클릭해 이탤릭이 해제된 `Pinned Tab`을 확인한다. 폴더 B를 `File Tree`에서 마우스로 더블클릭해 `Pinned Tab` 전환 없이 하위 항목이 열리는지 확인한다. 파일 C와 폴더 C를 각각 한 번 클릭한 뒤 `Enter`를 눌러 `Pinned Tab`으로 전환되는지 확인한다. 마지막으로 파일과 폴더를 각각 `Preview Tab`으로 연 뒤 해당 `Tab` 제목을 더블클릭해 `Pinned Tab`으로 전환되는지 확인한다. |
| 재검증 결과 | 미실시. |

### UT-EDT-002 — `Editor Tab Bar`의 `[+]` 배치

| 구분 | 내용 |
| --- | --- |
| 사용자 요청 | `Editor Tab Bar`의 탭 추가 아이콘 `[+]`을 마지막 `Tab` 제목 바로 오른쪽에 붙인다. 탭이 하나도 없으면 `Editor Tab Bar` 맨 왼쪽에 `[+]`만 표시한다. 현재 우측 끝에 있는 탭 추가 아이콘을 이 위치로 옮긴다. 배치는 JupyterLab 방식과 같게 한다. |
| 현재 상태 — 사용자 확인 | 탭 추가 아이콘 `[+]`이 `Editor Tab Bar` 우측 끝에 있다. |
| 실제 화면 관찰 | 현재 화면과 두 호스트의 실런타임 검사에서 `[+]`이 `Split Right`, `Split Down` 다음인 `Editor Actions` 우측 끝에 있음을 확인했다. `[+]`을 클릭하면 `Untitled` `Tab`이 생성되지만, `[+]` 위치는 마지막 `Tab` 옆이 아니라 계속 우측 끝이다. |
| 현재 판정 | 요청한 JupyterLab 방식의 배치를 지원하지 않는다. |
| 사용자의 의도 | 확인 완료. 탭 추가 동작을 우측 여백에 분리하지 않고 현재 열린 탭들의 연속된 흐름에 붙여, 새 `Tab`이 생성될 위치를 명확히 한다. |
| 기대 결과 | `Editor Tab Bar`에 `Tab`이 하나 이상 있으면 `[+]`은 항상 마지막 `Tab` 제목 바로 오른쪽에 표시된다. `Tab`이 0개이면 `[+]`만 맨 왼쪽에 표시된다. `[+]` 뒤의 남은 `Editor Tab Bar` 공간에는 탭 추가 아이콘이 다시 나타나지 않는다. |
| 재검증 기준 | Electron과 pywebview에서 `Tab`이 0개·1개·2개 이상인 상태를 각각 만든다. 0개에서는 `[+]`만 왼쪽에 있는지, 1개 이상에서는 `[+]`이 마지막 `Tab` 바로 오른쪽에 있는지, 우측 끝에는 중복 `[+]`이 없는지 확인한다. `Tab`을 추가·닫을 때마다 `[+]` 위치가 마지막 `Tab`을 따라 즉시 바뀌는지 확인한다. |
| 재검증 결과 | 미실시. |

### UT-EDT-003 — `Split Editor` 격자와 `Tab` 관리

| 구분 | 내용 |
| --- | --- |
| 사용자 요청 | `Editor Area`의 `Split Editor`와 `Editor Group`을 VS Code와 같은 방식으로 사용한다. 오른쪽·아래쪽 분할로 2차원 격자가 만들어진 상태에서 `Editor Group` 사이 구분선을 보이고, 선택한 `Tab`을 다른 `Editor Group`으로 이동하며, 같은 `Editor Group` 안에서 `Tab` 순서를 바꿀 수 있어야 한다. 오른쪽 또는 아래쪽에 새 `Editor Group`을 만들 때는 빈 그룹이 아니라 이탤릭 제목의 `Untitled` `Preview Tab`이 추가된 상태로 생성한다. |
| 현재 상태 — 사용자 확인 | `Split Editor`는 오른쪽·아래쪽에 생성되지만 새 `Editor Group`은 `Tab`이 없는 상태로 만들어진다. 이 빈 그룹을 닫으려면 먼저 `Tab`을 추가한 뒤 그 `Tab`을 닫아야 한다. 또한 `Editor Group` 사이 구분선이 보이지 않고, 선택한 `Tab` 이동도 정상 동작하지 않는다. |
| 현재 기준과의 차이 | 현재 문서는 Dockview가 2차원 `Editor Group` 격자, 그룹 사이 `Tab` 이동, `Tab` 순서 변경, 경계 드래그를 관리한다고 정의한다. 이번 사용자 테스트에서는 이 정의와 실제 사용 결과가 일치하지 않는 것으로 기록한다. |
| Dockview 사용 원칙 | Dockview가 제공하는 그리드 관리와 `Tab` 관리 기능을 임의로 제한하지 않고 그대로 사용한다. `Editor Group`의 2차원 배치, 구분선, 크기 조절, 그룹 간 `Tab` 이동, 그룹 안 `Tab` 순서 변경을 별도 제한 규칙으로 막지 않는다. |
| 실제 화면 관찰 | 두 호스트의 실런타임 검사에서는 오른쪽·아래쪽 분할, 2차원 `Editor Group` 격자, 그룹 사이 크기 조절용 `Sash`, 같은 그룹 내 `Tab` 순서 변경, 다른 그룹으로의 `Tab` 이동이 모두 동작했다. 그러나 사용자가 실제 창에서 확인한 결과는 `Editor Group` 구분선이 눈에 보이지 않고 선택한 `Tab` 이동도 원활하지 않았다. |
| 현재 판정 | Dockview의 내부 기능 경로는 두 호스트에서 존재하고 자동 조작은 통과한다. 다만 새 `Editor Group`이 빈 상태로 생성되는 동작, 실제 사용 화면의 구분선 가시성, 포인터 기반 `Tab` 이동 사용성은 요청을 충족하지 못하므로 보완 및 사람의 재검증이 필요하다. |
| 사용자의 의도 | 확인 완료. `Editor Area`를 단순히 빈 분할만 생성하는 화면으로 두지 않고, 새 `Editor Group`을 만든 직후부터 `Untitled` `Preview Tab`을 포함한 정상적인 작업 영역으로 사용한다. 새 그룹을 제거하기 위해 사용자가 별도로 `Tab`을 만든 뒤 닫아야 하는 불필요한 절차를 없앤다. 격자 안의 `Editor Group`과 `Tab`은 VS Code처럼 자유롭게 관리한다. |
| 기대 결과 | 오른쪽·아래쪽 `Split Editor`를 실행하면 새 `Editor Group`이 이탤릭 제목의 `Untitled` `Preview Tab`을 포함한 상태로 생성된다. 사용자는 별도로 `Tab`을 추가하지 않고 이 `Preview Tab`을 닫아 해당 `Editor Group`까지 닫을 수 있다. 분할을 반복하면 `Editor Area`에 2차원 격자가 생기고 인접 그룹의 경계가 분명히 보인다. `Tab`은 같은 그룹 안에서 순서를 바꾸거나 다른 그룹으로 이동할 수 있다. Electron과 pywebview에서 같은 결과가 나온다. |
| 재검증 기준 | 두 호스트에서 `Tab`이 열린 상태로 오른쪽 분할과 아래쪽 분할을 각각 실행한다. 생성된 각 `Editor Group`에 처음부터 제목이 `Untitled`이고 이탤릭으로 표시된 `Preview Tab`이 있는지 확인한다. 별도로 `Tab`을 추가하지 않고 이 `Preview Tab`을 닫았을 때 해당 그룹도 함께 닫히는지 확인한다. 다시 2차원 격자를 만들고 각 그룹의 경계선과 크기 조절을 확인한다. 선택한 `Tab`을 같은 그룹 안에서 드래그해 순서를 바꾸고, 다른 그룹으로 드래그해 이동한 뒤 제목·보기·활성 상태가 유지되는지 확인한다. |
| 재검증 결과 | 미실시. |

## `Focus Area` 전환과 Selection 표시

> 참조 기준: `_clones/tab-explorer-templates`의 `TreeModel`, `TabManager`, 실제 렌더링 코드와 Selection Focus 자동 검증. 선택 상태와 키보드 Focus를 서로 독립적으로 유지하는 방식을 workbench-kit에 적용한다.

### UT-FCS-001 — `Explorer (View)`와 `Editor Group` 사이의 `Focus Area` 전환

| 구분 | 내용 |
| --- | --- |
| 사용자 요청 | `_clones/tab-explorer-templates`에서 확인한 방식으로 `Explorer (View)`와 `Editor Group` 사이의 선택 영역 전환을 적용한다. |
| 참조 구현 확인 | `Explorer (View)`의 빈 영역을 클릭하면 기존 `File Tree` 항목을 새로 선택하거나 열지 않고 `File Tree`로 Focus가 이동한다. 파일·폴더 행 클릭은 이 빈 영역 클릭과 별도의 항목 선택 동작이다. `Editor Group`의 `Tab` 또는 Editor 콘텐츠를 클릭하면 해당 그룹이 Active Editor Group이 되고 Focus가 이동한다. |
| 키보드 전환 | `Tab`은 화면에 보이는 `File Tree`와 각 `Editor Group`을 순서대로 순환하고 마지막 영역 다음에는 처음 영역으로 돌아간다. `Shift+Tab`은 반대 방향으로 순환한다. `Ctrl+Tab`과 `Ctrl+Shift+Tab`은 Active Editor Group 안에서만 `Tab`을 전환하며 `Focus Area` 순환과 구분한다. |
| 상태 유지 원칙 | `Focus Area`만 전환할 때 `File Tree`의 Selection, 각 `Editor Group`의 Active Tab, 열린 `Tab` 목록은 바뀌지 않는다. Selection은 유지하고 현재 Focus가 있는 영역만 `Focus Ring`으로 구분한다. |
| 특수 상태 | `Explorer (View)`가 숨겨진 상태와 `Zen Mode`에서는 숨겨진 영역을 순환 대상에서 제외한다. `Split Editor` 상태에서는 현재 보이는 모든 `Editor Group`을 순환 대상에 포함한다. |
| 기대 결과 | 마우스와 키보드로 `Explorer (View)`와 여러 `Editor Group` 사이를 전환할 수 있으며, 영역 전환만으로 선택 파일·폴더나 Active Tab이 임의로 바뀌지 않는다. Electron과 pywebview에서 같은 결과가 나온다. |
| 재검증 기준 | 두 호스트에서 `File Tree` 항목 하나와 각 `Editor Group`의 Active Tab을 서로 다르게 선택한다. `Explorer (View)` 빈 영역, 각 `Editor Group`의 `Tab`과 콘텐츠를 차례로 클릭해 Focus 이동과 Selection 유지를 확인한다. 이어서 `Tab`과 `Shift+Tab`으로 모든 표시 영역을 양방향 순환하고, `Ctrl+Tab`으로 Active Editor Group 내부의 탭만 바뀌는지 확인한다. `Explorer (View)` 숨김과 `Zen Mode`에서도 숨겨진 영역을 건너뛰는지 확인한다. |
| 재검증 결과 | 미실시. |

### UT-FCS-002 — `Explorer (View)`의 선택 항목 표시

| 구분 | 내용 |
| --- | --- |
| 사용자 요청 | `_clones/tab-explorer-templates`에서 확인한 방식으로 `File Tree`의 선택 파일·폴더를 표시한다. |
| 참조 구현 확인 | `File Tree`의 Selection은 단일 `Tree Cursor`로 관리되며 Active Tab과 독립적이다. 선택된 행은 Selection 배경을 계속 유지하고, `File Tree`에 Focus가 있을 때만 선택 행 안쪽에 1px `Focus Ring`을 추가한다. Focus가 다른 영역으로 이동하면 `Focus Ring`만 없어지고 Selection 배경은 남는다. |
| 빈 영역 클릭 | `Explorer (View)`의 빈 영역을 클릭하면 기존 선택 행을 유지한 채 `File Tree`로 Focus를 옮기고 해당 선택 행에 `Focus Ring`을 표시한다. 선택된 항목이 아직 없으면 처음 보이는 행을 `Tree Cursor`로 선택한다. 새 `Preview Tab`을 열거나 Active Tab을 변경하지 않는다. |
| 독립 상태 원칙 | Active Tab을 변경해도 `Tree Cursor`가 해당 파일·폴더로 자동 이동하지 않는다. 방향키로 `Tree Cursor`를 이동할 때도 항목을 여는 입력 전에는 Active Tab이 바뀌지 않는다. 선택 행이 Viewport 밖으로 이동하면 해당 행이 다시 보이도록 Scroll 위치를 맞춘다. |
| 시각 표시 | 선택 행 배경은 Editor 콘텐츠 배경과 같은 계열을 사용한다. hover 표시는 Selection과 구분하며, `Focus Ring`은 현재 `Focus Area`를 판별할 수 있는 대비를 갖는다. 이 규칙은 모든 `Color Theme`에 동일하게 적용한다. |
| 기대 결과 | 사용자는 `File Tree`에서 어떤 항목이 선택되어 있는지 항상 확인할 수 있고, 동시에 Explorer와 Editor 중 어느 영역에 Focus가 있는지도 `Focus Ring` 유무로 구분할 수 있다. |
| 재검증 기준 | 두 호스트의 각 `Color Theme`에서 파일과 폴더를 각각 선택한다. Explorer에 Focus가 있을 때 Selection 배경과 1px `Focus Ring`이 함께 보이는지, Editor로 Focus를 옮겼을 때 Selection 배경은 유지되고 `Focus Ring`만 사라지는지 확인한다. Explorer 빈 영역 클릭으로 기존 Selection과 탭 상태를 유지한 채 `Focus Ring`이 복원되는지 확인한다. Active Tab 전환과 방향키 이동이 서로의 Selection을 강제로 동기화하지 않는지도 확인한다. |
| 재검증 결과 | 미실시. |

### UT-FCS-003 — `Editor Group`의 Active Tab 표시

| 구분 | 내용 |
| --- | --- |
| 사용자 요청 | `_clones/tab-explorer-templates`에서 확인한 방식으로 각 `Editor Group`의 선택된 `Tab`과 현재 Focus가 있는 그룹을 표시한다. |
| 참조 구현 확인 | 각 `Editor Group`은 Active Tab을 하나씩 독립적으로 유지한다. 모든 그룹의 Active Tab은 활성 배경과 전경색으로 표시하며, 현재 Focus가 있는 Active Editor Group의 Active Tab에만 안쪽 1px `Focus Ring`을 추가한다. 다른 그룹으로 Focus가 이동해도 각 그룹의 Active Tab 표시는 유지되고 `Focus Ring`만 현재 그룹으로 이동한다. |
| Tab 상태 표시 | Active Tab의 배경은 해당 Editor 콘텐츠 배경과 같은 계열로 연결하고 제목은 활성 전경색으로 표시한다. Inactive Tab은 흐린 전경색으로 구분한다. `Preview Tab` 제목은 이탤릭, `Pinned Tab` 제목은 일반 글꼴로 표시하며 Selection 및 Focus 표시와 함께 유지한다. |
| 전환 동작 | `Tab` 또는 Editor 콘텐츠를 클릭하면 해당 그룹이 Active Editor Group이 되고 Focus가 이동한다. 다른 `Tab`을 클릭하면 그 탭이 해당 그룹의 Active Tab이 된다. `Focus Area` 전환만으로 Active Tab은 변경하지 않는다. |
| 기대 결과 | 여러 `Editor Group`이 있는 상태에서 각 그룹의 Active Tab과 현재 Focus가 있는 Active Editor Group을 동시에 구분할 수 있다. `Preview Tab`과 `Pinned Tab` 상태도 이 표시 체계 안에서 명확하게 유지된다. |
| 재검증 기준 | 두 호스트의 각 `Color Theme`에서 둘 이상의 `Editor Group`을 만들고 그룹마다 서로 다른 Active Tab을 선택한다. 모든 그룹의 Active Tab 배경이 유지되는지, 현재 Focus가 있는 그룹의 Active Tab에만 1px `Focus Ring`이 보이는지 확인한다. 마우스 및 `Tab`·`Shift+Tab`으로 Focus를 옮겨 `Focus Ring`만 이동하고 Active Tab은 유지되는지 확인한다. 각 그룹에서 Preview·Pinned·Inactive Tab의 글꼴과 전경색도 구분되는지 확인한다. |
| 재검증 결과 | 미실시. |

## 확인 대기 질문

현재 확인 대기 질문 없음.
