# workbench-kit

## 파일과 폴더 탭 (v0.3)

두 데스크톱 호스트 모두 `File > Open File...`로 UTF-8 텍스트 파일을 열면 Viewer 모드가
적용된다. 파일 탭에서 `F3`/`F4`를 누르면 Viewer/Editor 모드로 전환할 수 있고, 상태바의
`File: Viewer`를 클릭해도 모드를 바꿀 수 있다. `View > Tab Mode`는 앞으로 열 파일 탭의
기본 모드를 정한다. 수정한 탭을 닫을 때 확인창에서 `Save`를 선택하면 변경 내용을 디스크에
저장한다. Editor에서 Viewer로 돌아가도 현재 내용과 저장하지 않은 변경 사항은 유지된다.

`File > Open Folder...`는 폴더를 Roots에 추가한다. 탐색기 트리에서 파일을 클릭하거나
`Enter`를 누르면 활성 에디터 칸에서 열린다. 파일에 포커스를 두고 `F3`/`F4`를 누르면
우클릭 메뉴의 `Open as Viewer`/`Open as Editor`와 같이 각각 보기/편집 모드로 연다.
트리 안에서 찾기는 `Ctrl+F`다. 트리에서 모드를 지정해 열면 모드마다 별도의 탭을 쓰며,
이미 열린 탭이 있으면 그 탭을 활성화한다. 수정되지 않은 빈 `Untitled` 탭은 재사용한다.
트리에서 파일이나 폴더를 우클릭하면 `Copy Path`, `Copy Relative Path`로 절대·상대 경로를 클립보드에 복사할 수 있다.
폴더 탭의 우클릭 메뉴에서 File List, Command Prompt, PowerShell을 열 수 있다. 셸 탭은
각각 독립된 터미널 세션이다.

터미널은 Electron에서 `node-pty`, pywebview에서 `pywinpty`가 필요하며 두 패키지 모두
의존성에 선언되어 있다. 브라우저에서 실행하는 `npm run dev`에는 실제 파일·터미널 접근
기능이 없다.

관련 검증 명령은 `npm run verify:open-modes`, `npm run verify:terminal-host`,
`python scripts/verify-terminal-host-py.py`다. 마지막 명령은 설정된 WinPython 환경에서
실행한다.

여러 데스크톱 앱이 공유하는 **공통 껍데기 한 벌**을 미리 만든다. 창, 메뉴, 탐색기
트리, 좌우로 가른 칸, 탭 줄, 상태 표시줄, 설정 저장, 실행 환경 연결이 그것이다. 새
앱을 만들 때 이 껍데기를 다시 짜지 않고 그대로 물려받아, 달라지는 소수만 갈아끼워
완성하는 것이 목적이다.

앱 자체는 가벼워야 한다. VS Code처럼 기능이 끝없이 불어난 도구는 무겁고 그중 대부분은
정작 쓰이지 않는다. 이 껍데기 위에 올리는 앱은 그 도메인에 꼭 필요한 기능만 담아 작고
단순하게 둔다. 이것이 제1원칙이다.

공통 UI의 생김새와 동작은 **VS Code가 오랫동안 실제 제품에서 다듬어 온 구성**을
기준으로 삼는다. UI를 새로 발명하지 않기 위해서다. 다만 VS Code를 복제하지는 않고,
이 목적에 맞는 것만 골라 따른다.

같은 공통 UI를 두 갈래가 공유한다 — 파이썬이 필요한 앱은 **pywebview**로, 필요 없는
앱은 **Electron**으로 낸다.

> **v0.2 마감.** Phase 1~7 전부 완료 — 임시/확정 탭, 선택·포커스 표시, 창 껍데기 배치,
> 메뉴·칸 수명, 탐색기 구조, 테마·아이콘·치수, 표시 언어까지. 아이콘 테마는
> `VS Code Built-in` · `VS Code Icons` · `Simple` 셋, monaco 에디터 색은 VS Code의
> `--vscode-*` 토큰을 따른다.

---

## 실행 방법

### 0. 공통 준비

```bash
git clone https://github.com/nampluskr/workbench-kit.git
cd workbench-kit
npm install
npm run build   # dist/ 산출물 생성 — 두 갈래 모두 dist/index.html을 읽으므로 필수
```

Node.js **22 이상**이 필요하다(`package.json`의 `engines`).

### 1. Electron으로 실행 (Python 불필요)

```bash
npm run start:electron
```

### 2. pywebview로 실행 (Python 필요)

```bash
pip install -r requirements.txt   # pywebview>=6.2.1
npm run start:pywebview
```

Windows에는 WebView2 런타임이 필요하지만 Windows 10/11에는 보통 이미 설치되어
있다. 없으면 실행 시 에러 메시지로 안내된다. Python은 3.x 아무 버전이나 된다
(표준 라이브러리 위주).

### 3. UI만 빠르게 미리보기

```bash
npm run dev
```

브라우저에서 열린다. 다만 이 방식은 Electron/pywebview의 실제 호스트 브리지
(파일 열기 대화상자, 창 최소화/최대화 등)가 없어서 **폴더 열기 같은 실제
파일시스템 기능은 동작하지 않고 레이아웃·테마·메뉴 등 화면 자체만** 확인하는
용도다. 실제 동작까지 보려면 1·2번 방식을 쓴다.

### 참고

- 코드를 고친 뒤 Electron/pywebview로 다시 확인하려면 `npm run build`를 먼저
  다시 실행해야 `dist/`가 갱신된다(`npm run dev`는 즉시 반영되므로 별개다).
- 전체 검증 스위트(`npm test`)까지 돌리려면 두 갈래 모두 설치돼 있어야 한다
  (Electron은 devDependencies에 포함, pywebview는 위 `pip install` 필요).

---

## 단축키

껍데기가 먼저 가져가는 키와, 같은 기능을 VS Code에서 부르는 키를 나란히 둔 표다.
**정본은 [`docs/reserved-keys.md`](docs/reserved-keys.md)**이고 이 표는 읽기 쉬운
요약이다 — 둘이 어긋나면 그쪽이 맞다.

여기 없는 키는 전부 탭 안의 보기(앱) 몫이다. 껍데기는 손대지 않는다(`FR-I6`).

### 1. 파일과 창

| 기능 | workbench-kit | VS Code | 비고 |
| --- | --- | --- | --- |
| 파일 열기 | `Ctrl+O` | `Ctrl+O` | 같음 — 파일 열기 대화상자를 띄우고 활성 탭(수준 1 에디터/뷰어)으로 연다 |
| 폴더 열기 / 추가 | `Ctrl+K Ctrl+O` | `Ctrl+K Ctrl+O` | 같음 — 선택한 폴더를 새 Roots 항목으로 추가 및 에디터 탭으로 연다 |
| 새 탭 열기 | `Ctrl+N` | `Ctrl+N` | 같음 — 현재 칸에 빈 탭(`Untitled`)을 추가한다 |
| 활성 탭 닫기 | `Ctrl+W` | `Ctrl+W` | 같음 |
| 활성 그룹 모든 탭 닫기 | `Ctrl+K W` | `Ctrl+K W` | 같음 — 현재 칸의 탭들을 일괄 닫는다 (미저장 순차 확인) |
| 끝내기 | `Alt+F4` | `Alt+F4` | 같음 (OS 수준) |

### 2. 화면과 레이아웃

| 기능 | workbench-kit | VS Code | 비고 |
| --- | --- | --- | --- |
| 좌우 분할 | `Ctrl+\` | `Ctrl+\` | 같음 |
| 상하 분할 | `Ctrl+K Ctrl+\` | `Ctrl+K Ctrl+\` | 같음 |
| 폴더탭·탐색기 보이기/감추기 | `Ctrl+B` | `Ctrl+B` | 다름 — 현재 보이는 왼쪽 탐색 영역을 함께 감추고 직전 조합으로 복원한다 |
| Zen 모드 | `F11` | `Ctrl+K Z` (`F11`은 전체화면) | **의도적 다름** — 창 크기는 그대로 두고 크롬만 감춘다 (D-12) |
| Zen 모드 나가기 | `F11` 또는 `Escape` | `Escape Escape` | 다름 — 한 번으로 나온다 |

### 3. 포커스와 탭 이동

| 기능 | workbench-kit | VS Code | 비고 |
| --- | --- | --- | --- |
| 탐색기로 포커스 | `Ctrl+0` | `Ctrl+0` (사이드바 포커스) | 같음 — 사이드바가 숨겨져 있으면 열고 트리에 포커스한다 |
| 1번 에디터 창으로 포커스 | `Ctrl+1` | `Ctrl+1` | 같음 — 첫 번째 분할 칸으로 이동한다 |
| 2번 에디터 창으로 포커스 | `Ctrl+2` | `Ctrl+2` | 같음 — 두 번째 분할 칸으로 이동한다 (1개뿐이면 우측 분할 생성) |
| 다음 탭으로 이동 | `Ctrl+PageDown` | `Ctrl+PageDown` | 같음 — 활성 칸 안에서 오른쪽 탭으로 이동한다 |
| 이전 탭으로 이동 | `Ctrl+PageUp` | `Ctrl+PageUp` | 같음 — 활성 칸 안에서 왼쪽 탭으로 이동한다 |
| 다음 / 이전 탭 (호환) | `Ctrl+Tab` / `Ctrl+Shift+Tab` | `Ctrl+Tab` / `Ctrl+Shift+Tab` | 유사 — 팝업 없이 곧바로 옆 탭으로 이동한다 |
| 다음 / 이전 영역으로 포커스 | `F6` / `Shift+F6` | `F6` / `Shift+F6` | 같음. 단 탭 안 보기에 포커스가 있으면 껍데기가 가로채지 않는다 |
| 버튼 사이 이동 | `Tab` / `Shift+Tab` | `Tab` / `Shift+Tab` | 같음 — 예약하지 않고 브라우저 기본에 맡긴다 |

### 4. 메뉴

| 기능 | workbench-kit | VS Code | 비고 |
| --- | --- | --- | --- |
| 메뉴 열기/닫기 | `F10` | `F10` (또는 `Alt`) | 같음 — 메뉴가 햄버거 하나뿐이라 `F10`이 여닫기를 겸한다 |
| 항목 이동 | `ArrowUp` / `ArrowDown` | 같음 | 같음 |
| 하위 메뉴 열기 / 닫기 | `ArrowRight` / `ArrowLeft` | 같음 | 같음 |
| 실행 | `Enter` | `Enter` | 같음 |
| 최근 폴더 목록에서 지우기 | `Delete` (`Recent Folders` 안에서) | `Delete` (Open Recent 목록에서) | 같음 |
| 메뉴 닫기 | `Escape` | `Escape` | 같음 |

우클릭 메뉴는 `ArrowUp`/`ArrowDown` · `Enter` · `Escape`만 받는다.

### 5. 탐색기 트리

| 기능 | workbench-kit | VS Code | 비고 |
| --- | --- | --- | --- |
| 위 / 아래 이동 | `ArrowUp` / `ArrowDown` | 같음 | 같음 |
| 펼치기 / 접기 | `ArrowRight` / `ArrowLeft` | 같음 | 같음 |
| 모두 접기 | `Ctrl+ArrowLeft` | `Ctrl+ArrowLeft` (목록 공통) | 같음 |
| 펼침 토글 | `Space` | `Space` | 같음 |
| 열기(확정) | `Enter` | `Enter` | 다름 — 이미 임시 탭으로 열려 있으면 그 탭을 **확정**한다 (FR-P7) |
| 옆 칸에 열기 | `Ctrl+Enter` | `Ctrl+Enter` | 같음 |
| 선택 토글 | `Ctrl+Shift+Enter` | (마우스 `Ctrl+클릭`) | 다름 — 키보드만으로 하는 경로를 따로 둔다 |
| 처음 / 끝으로 | `Home` / `End` | 같음 | 같음 |
| 화면 단위 이동 | `PageUp` / `PageDown` | 같음 | 같음 |
| 범위 선택 | `Shift+ArrowUp` / `Shift+ArrowDown` | 같음 | 같음 |
| 전체 선택 | `Ctrl+A` | `Ctrl+A` | 같음 |
| 포커스 고정 스크롤 | `Ctrl+ArrowUp` / `Ctrl+ArrowDown` | 같음 | 같음 |
| 트리에서 찾기 | `Ctrl+F` 또는 `Ctrl+Alt+F` | (글자를 바로 입력하면 검색) | 다름 — 찾기 위젯을 명시적으로 연다 |
| 트리에서 파일 보기 / 편집 열기 | `F3` / `F4` | 없음 | 포커스된 파일에 적용 |
| 현재 파일 탭 보기 / 편집 전환 | `F3` / `F4` | 없음 | 현재 파일 탭에 적용 |
| 선택 해제 / 찾기 닫기 | `Escape` | `Escape` | 같음 |

### 6. 탐색기 폭 조절 손잡이

`Tab`으로 경계 손잡이에 포커스를 준 뒤 쓴다. VS Code에는 대응하는 키가 없다(마우스 전용).

| 기능 | workbench-kit | VS Code |
| --- | --- | --- |
| 한 단계 줄이기 / 늘리기 | `ArrowLeft` / `ArrowRight` | 없음 |
| 최소 폭으로 | `Home` | 없음 |
| 창 폭의 40%로 | `End` | 없음 |

### 7. 에디터 안 (monaco가 제공)

껍데기가 예약하지 않고 monaco 기본값을 그대로 쓴다. 그래서 VS Code와 같다.

| 기능 | workbench-kit | VS Code | 비고 |
| --- | --- | --- | --- |
| 찾기 | `Ctrl+F` | `Ctrl+F` | 같음 |
| 바꾸기 | `Ctrl+H` | `Ctrl+H` | 같음 |
| 되돌리기 / 다시하기 | `Ctrl+Z` / `Ctrl+Y` | 같음 | 같음 |

자동완성·hover·미니맵·멀티커서는 꺼져 있다(`X-12`, `FR-P5`).

이 키들은 껍데기가 **예약한 것이 아니다.** 껍데기가 손대지 않으니 탭 안의 보기(여기서는
monaco)가 받는 것뿐이다 — 다른 보기를 넣은 앱에서는 그 보기가 하는 대로 동작한다.

### 8. 껍데기가 **가져가지 않는** 키

리소스 종류를 아는 일은 앱 몫이라, 아래는 껍데기가 손대지 않고 탭 안 보기로 그대로
넘어간다(`FR-R1a`). VS Code에서 같은 키가 하는 일을 참고로 적는다.

| 키 | 껍데기 | VS Code |
| --- | --- | --- |
| `Ctrl+S` | 앱에 넘김 | 저장 |
| `F2` | 앱에 넘김 | 이름 바꾸기 |
| `Delete` | 앱에 넘김 (메뉴가 열려 있을 때만 예외) | 삭제 |
| `Ctrl+C` / `Ctrl+V` | 앱에 넘김 | 복사 / 붙이기 |

---

## 문서

| 문서 | 무엇이 있나 |
| --- | --- |
| [`INTENT.md`](docs/current/INTENT.md) | 이 프로젝트가 무엇을 왜 하는가. 버전이 바뀌어도 변하지 않는 것 |
| [`BRIEF.md`](docs/current/BRIEF.md) | 이번 버전(v0.2)에서 무엇을 왜 하는가. 하지 않을 것. 완료 조건 |
| [`DECISIONS.md`](docs/current/DECISIONS.md) | 설계 결정 20개(D-1 ~ D-20)와 각각의 근거·배제한 대안 |
| [`SPEC.md`](docs/current/SPEC.md) | 이번 버전이 만족해야 할 것 |
| [`PLAN.md`](docs/current/PLAN.md) | Phase 1 ~ 7의 목적·대응 요구 ID·완료 조건, 그리고 적대적 검증 게이트 |
| [`backlog.json`](docs/current/backlog.json) | task 34개, 전건 완료. `id` · `phase`(= `priority` P1 ~ P7) · 완료 조건 |
| [`PROGRESS.md`](docs/current/PROGRESS.md) | task별 진행 기록과 계획 외 개선 26건, 마감 요약 |

이전 버전(v0.1) 문서는 [`docs/history/v0.1/`](docs/history/v0.1/)에 있다.

### 참고 자료 (`refs/`)

| 문서 | 무엇이 있나 |
| --- | --- |
| [`scenarios.md`](docs/refs/scenarios.md) | 사용자 시나리오 70개와 각각의 정해진 결과 |
| [`skeleton-proposal.md`](docs/refs/skeleton-proposal.md) | 무엇을 가져오고 무엇을 만들 것인가 — 제안과 그 결과 |
| [`licenses.md`](docs/refs/licenses.md) | 반입할 것들의 라이선스와 배포할 때 함께 넣을 것 |
| [`handoff.md`](docs/refs/handoff.md) | **구현 세션에 줄 지시문.** Phase별·검증별 |
| [`next-session-prompts.md`](docs/refs/next-session-prompts.md) | 기획 단계에서 쓴 프롬프트 (끝남) |
| [`next-version.md`](docs/refs/next-version.md) | 다음 버전으로 미룬 것과 그 근거. 확장 후보 앱 대조 |
| [`vscode-ui-reference.md`](docs/refs/vscode-ui-reference.md) | VS Code UI 요소 용어 사전 |
| [`ui-vscode-mapping.md`](docs/refs/ui-vscode-mapping.md) | 앞선 프로젝트가 남긴 의도를 VS Code 용어로 옮겨 읽기 |
| [`vscode-reuse-plan.md`](docs/refs/vscode-reuse-plan.md) | VS Code 요소별 남김 / 가져옴 / 뺌 |

## 다음

v0.2를 마감했다(2026-09-16). 남긴 것과 다음 버전 후보는
[`PROGRESS.md`의 마감 요약](docs/current/PROGRESS.md)에 있다 — 트리 세로선 간격
등 금지 값 예외 2건, 대비 미달 5건, pywebview 재확인 항목, monaco 문법 강조
(범위 밖으로 제외)가 그 후보다. 다음 버전의 범위·번호는 사람이 정한다.

## 가져다 쓰는 것

| 무엇 | 어디에 | 라이선스 |
| --- | --- | --- |
| [dockview](https://github.com/dockview/dockview) | 칸·탭·보기 수명 | MIT |
| [monaco-editor](https://github.com/microsoft/monaco-editor) | 텍스트·코드 보기와 편집 | MIT |
| [codicons](https://github.com/microsoft/vscode-codicons) | UI 아이콘 | 아이콘 CC BY 4.0 / 코드 MIT |
| [seti-ui](https://github.com/jesseweed/seti-ui) | 파일 종류 아이콘 (기본) | MIT |
| [vscode-icons](https://github.com/vscode-icons/vscode-icons) | 파일 종류 아이콘 (컬러) | 아이콘 CC BY-SA / 코드 MIT |

자세한 것은 [`docs/refs/licenses.md`](docs/refs/licenses.md).
