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

> **아직 기획 단계다.** 구현은 시작하지 않았다.

---

## 문서

| 문서 | 무엇이 있나 |
| --- | --- |
| [`INTENT.md`](INTENT.md) | 이 프로젝트가 무엇을 왜 하는가. 버전이 바뀌어도 변하지 않는 것 |
| [`BRIEF.md`](BRIEF.md) | 이번 버전(v0.1)에서 무엇을 왜 하는가. 하지 않을 것. 완료 조건 |
| [`DECISIONS.md`](DECISIONS.md) | 설계 결정 28개(D-1 ~ D-28)와 각각의 근거·배제한 대안 |

### 참고 자료 (`refs/`)

| 문서 | 무엇이 있나 |
| --- | --- |
| [`scenarios.md`](refs/scenarios.md) | 사용자 시나리오 70개와 각각의 정해진 결과 |
| [`skeleton-proposal.md`](refs/skeleton-proposal.md) | 무엇을 가져오고 무엇을 만들 것인가 — 제안과 그 결과 |
| [`licenses.md`](refs/licenses.md) | 반입할 것들의 라이선스와 배포할 때 함께 넣을 것 |
| [`vscode-ui-reference.md`](refs/vscode-ui-reference.md) | VS Code UI 요소 용어 사전 |
| [`ui-vscode-mapping.md`](refs/ui-vscode-mapping.md) | 앞선 프로젝트가 남긴 의도를 VS Code 용어로 옮겨 읽기 |
| [`vscode-reuse-plan.md`](refs/vscode-reuse-plan.md) | VS Code 요소별 남김 / 가져옴 / 뺌 |

## 앞으로 쓸 문서

`SPEC.md` → `PLAN.md` → `backlog.json` 순으로 쓴다. 그 뒤에 착수한다.

## 가져다 쓰는 것

| 무엇 | 어디에 | 라이선스 |
| --- | --- | --- |
| [dockview](https://github.com/dockview/dockview) | 칸·탭·보기 수명 | MIT |
| [monaco-editor](https://github.com/microsoft/monaco-editor) | 텍스트·코드 보기와 편집 | MIT |
| [codicons](https://github.com/microsoft/vscode-codicons) | UI 아이콘 | 아이콘 CC BY 4.0 / 코드 MIT |
| [seti-ui](https://github.com/jesseweed/seti-ui) | 파일 종류 아이콘 (기본) | MIT |
| [vscode-icons](https://github.com/vscode-icons/vscode-icons) | 파일 종류 아이콘 (컬러) | 아이콘 CC BY-SA / 코드 MIT |

자세한 것은 [`refs/licenses.md`](refs/licenses.md).
