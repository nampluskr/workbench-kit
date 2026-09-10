# workbench-kit

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

> **기획을 마치고 착수했다.** 구현은 Phase 1부터 시작한다.

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

## 문서

| 문서 | 무엇이 있나 |
| --- | --- |
| [`INTENT.md`](docs/current/INTENT.md) | 이 프로젝트가 무엇을 왜 하는가. 버전이 바뀌어도 변하지 않는 것 |
| [`BRIEF.md`](docs/current/BRIEF.md) | 이번 버전(v0.1)에서 무엇을 왜 하는가. 하지 않을 것. 완료 조건 |
| [`DECISIONS.md`](docs/current/DECISIONS.md) | 설계 결정 32개(D-1 ~ D-32)와 각각의 근거·배제한 대안 |
| [`SPEC.md`](docs/current/SPEC.md) | 이번 버전이 만족해야 할 것 — 기능 요구 133건, 비기능 7, 제약 11, 미구현 22 |
| [`PLAN.md`](docs/current/PLAN.md) | Phase 1 ~ 7의 목적·대응 요구 ID·완료 조건, 그리고 적대적 검증 게이트 |
| [`backlog.json`](docs/current/backlog.json) | task 48개. `id` · `phase`(= `priority` P1 ~ P7) · 완료 조건 |

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

기획을 마치고 **착수했다**(2026-09-08, `INIT.md` 모드 C). 문서는 `docs/current/`,
참고 자료는 `docs/refs/`, Phase별 적대적 검증 기록은 `docs/reviews/`에 쌓인다.
구현은 `docs/current/PLAN.md`의 Phase 1부터, task는 `docs/current/backlog.json`의
`WK-001`부터다. 구현 세션에 줄 지시문은 [`docs/refs/handoff.md`](docs/refs/handoff.md).

## 가져다 쓰는 것

| 무엇 | 어디에 | 라이선스 |
| --- | --- | --- |
| [dockview](https://github.com/dockview/dockview) | 칸·탭·보기 수명 | MIT |
| [monaco-editor](https://github.com/microsoft/monaco-editor) | 텍스트·코드 보기와 편집 | MIT |
| [codicons](https://github.com/microsoft/vscode-codicons) | UI 아이콘 | 아이콘 CC BY 4.0 / 코드 MIT |
| [seti-ui](https://github.com/jesseweed/seti-ui) | 파일 종류 아이콘 (기본) | MIT |
| [vscode-icons](https://github.com/vscode-icons/vscode-icons) | 파일 종류 아이콘 (컬러) | 아이콘 CC BY-SA / 코드 MIT |

자세한 것은 [`docs/refs/licenses.md`](docs/refs/licenses.md).
