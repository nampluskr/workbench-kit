# workbench-kit

파일 탐색기·탭 편집·마크다운 미리보기·여러 폴더 동시 터미널을 갖춘 VS Code 스타일
데스크톱 앱이다. 설치해서 바로 쓸 수 있다.

## 무엇을 할 수 있나

- **탐색기 트리**로 폴더를 열고, 파일을 클릭하거나 `Enter`로 편집 탭에 연다. 찾기
  (`Ctrl+F`), 잘라내기 없는 복사/이동, 이름 바꾸기, 삭제(기본 꺼짐 — 안전장치)를
  지원한다.
- **폴더 탭**을 여러 개 동시에 열어 둘 수 있다(`Ctrl+K Ctrl+O`). 폴더마다 펼침·선택
  상태가 따로 저장되고, 재시작 뒤에도 그대로 복원된다.
- 파일 탭은 **보기(읽기 전용) / 편집** 두 모드로 열리고, 언제든 `F3`/`F4`로 전환한다.
- `.md` 파일은 **렌더링된 화면으로 바로 열 수 있다** — 표·수식(KaTeX)·코드 강조·
  GitHub 스타일 작업 목록/알림 상자를 지원하고, 코드 블록에는 복사 버튼이 있다.
- 폴더 탭에서 **명령 프롬프트나 PowerShell 터미널**을 열 수 있다. 같은 폴더에 터미널
  탭을 여러 개 띄워 두고 번갈아 쓸 수 있다.
- 화면을 좌우/상하로 분할하고, 탭을 끌어 옮긴다. 흰색·회색·검정 세 가지 색 테마와
  세 가지 파일 아이콘 테마 중 고른다.
- 화면 전체를 `Ctrl+-`/`Ctrl+Shift+=`로 확대·축소한다.

## 설치와 실행

미리 빌드된 배포판은 아직 없다 — 소스를 내려받아 실행 파일을 직접 만든다. 한 번만
하면 된다.

```bash
git clone https://github.com/nampluskr/workbench-kit.git
cd workbench-kit
npm install
```

**Node.js 22 이상**이 필요하다.

이 앱은 화면이 같은 두 갈래로 나온다 — **어느 한쪽만 있으면 된다.**

| 갈래 | 필요한 것 | 특징 |
| --- | --- | --- |
| Electron | 없음(빌드할 때만 Node.js 필요) | 설치 뒤에는 다른 프로그램 설치가 필요 없다. 터미널은 Node의 `node-pty`가 맡는다 |
| pywebview | Python 3.x | 화면은 Windows의 WebView2(대부분 이미 설치돼 있음)가 그린다. 터미널은 `pywinpty`가 맡는다 |

둘 중 뭘 골라야 할지 모르겠으면 **Electron**을 쓴다 — Python 설치가 필요 없다.

### 1. 실행 파일(.exe) 만들기

**Electron 갈래**

```bash
npm run package:electron
```

`dist-exe/`에 두 가지가 생긴다.

- `Workbench Kit Setup <버전>.exe` — 더블클릭하면 설치 마법사가 뜬다. 서명된 실행
  파일이 아니라서 Windows SmartScreen 경고가 뜰 수 있다 — "추가 정보" → "실행"으로
  넘긴다.
- `win-unpacked/Workbench Kit.exe` — 설치 없이 그대로 실행하는 포터블 버전. 폴더
  전체를 옮겨도 그대로 동작한다.

**pywebview 갈래**

```bash
pip install -r requirements.txt
pip install pyinstaller
npm run package:pywebview
```

`dist-py/workbench-kit/workbench-kit.exe`가 생긴다. `dist-py/workbench-kit/` 폴더
전체를 옮겨야 한다 — exe 파일 하나만 옮기면 실행되지 않는다.

두 갈래 모두 `npm run build`로 화면을 먼저 새로 만든 뒤 포장하므로, 소스를 고친
뒤에는 그냥 다시 위 명령을 실행하면 된다.

### 2. 설치 없이 바로 실행 (개발 중 확인용)

실행 파일을 만들지 않고 그 자리에서 바로 띄워 본다.

```bash
npm run build            # 화면 산출물을 한 번 만든다 — 두 갈래 모두 이걸 읽는다
npm run start:electron   # Python 불필요
# 또는
pip install -r requirements.txt
npm run start:pywebview  # Python 필요
```

코드를 고친 뒤 다시 확인하려면 `npm run build`부터 다시 실행해야 반영된다.

## 단축키

껍데기가 먼저 가져가는 키와, VS Code에서 같은 기능을 부르는 키를 나란히 둔 표다.
여기 없는 키는 열려 있는 파일·터미널 등 그 탭 자신의 몫이다.

### 1. 파일과 창

| 기능 | workbench-kit | VS Code | 비고 |
| --- | --- | --- | --- |
| 파일 열기 | `Ctrl+O` | `Ctrl+O` | 같음 |
| 폴더 열기 / 추가 | `Ctrl+K Ctrl+O` | `Ctrl+K Ctrl+O` | 같음 — 기존 폴더 탭을 교체하지 않고 새로 더한다 |
| 새 탭 열기 | `Ctrl+N` | `Ctrl+N` | 같음 |
| 활성 탭 닫기 | `Ctrl+W` | `Ctrl+W` | 같음 |
| 활성 그룹 모든 탭 닫기 | `Ctrl+K W` | `Ctrl+K W` | 같음 |
| 끝내기 | `Alt+F4` | `Alt+F4` | 같음 |

### 2. 화면과 레이아웃

| 기능 | workbench-kit | VS Code | 비고 |
| --- | --- | --- | --- |
| 좌우 분할 | `Ctrl+\` | `Ctrl+\` | 같음 |
| 상하 분할 | `Ctrl+K Ctrl+\` | `Ctrl+K Ctrl+\` | 같음 |
| 폴더탭·탐색기 보이기/감추기 | `Ctrl+B` | `Ctrl+B` | 같음 |
| Zen 모드 | `F11` | `Ctrl+K Z`(`F11`은 전체화면) | 다름 — 창 크기는 그대로 두고 메뉴·탭줄만 감춘다 |
| Zen 모드 나가기 | `F11` 또는 `Escape` | `Escape Escape` | 다름 — 한 번으로 나온다 |
| 화면 확대 / 축소 / 원래대로 | `Ctrl+Shift+=` / `Ctrl+-` / `Ctrl+Shift+0` | 없음 | — |
| 렌더링된 마크다운 문서만 확대 / 축소 | `Ctrl`+마우스 휠(마크다운 위에서만) | 없음 | 화면 전체가 아니라 그 문서 글자 크기만 바뀐다 |

### 3. 포커스와 탭 이동

| 기능 | workbench-kit | VS Code | 비고 |
| --- | --- | --- | --- |
| 탐색기로 포커스 | `Ctrl+0` | `Ctrl+0` | 같음 |
| 1번 / 2번 에디터 칸으로 포커스 | `Ctrl+1` / `Ctrl+2` | `Ctrl+1` / `Ctrl+2` | 같음 |
| 다음 / 이전 탭으로 이동 | `Ctrl+PageDown` / `Ctrl+PageUp` | 같음 | 같음 |
| 다음 / 이전 영역으로 포커스 | `F6` / `Shift+F6` | `F6` / `Shift+F6` | 같음 |

### 4. 탐색기 트리

| 기능 | workbench-kit | VS Code | 비고 |
| --- | --- | --- | --- |
| 위 / 아래 이동, 펼치기 / 접기 | `↑`/`↓`, `→`/`←` | 같음 | 같음 |
| 열기(확정) | `Enter` | `Enter` | 다름 — 미리보기로 열려 있던 탭을 확정한다 |
| 옆 칸에 열기 | `Ctrl+Enter` | `Ctrl+Enter` | 같음 |
| 트리에서 찾기 | `Ctrl+F` 또는 뷰 제목줄 돋보기 아이콘 | 글자를 바로 입력 | 다름 — 찾기 위젯을 명시적으로 연다 |
| 파일 보기 / 편집 열기 | `F3` / `F4` | 없음 | 포커스된 파일에 적용. 열린 파일 탭 안에서도 같은 키로 전환한다 |
| 선택 삭제 | `Delete` 또는 우클릭 `Delete` | `Delete` | **다름 — 기본 꺼짐.** `File > Allow Delete in Explorer`로 켜야 하고 확인창을 거친다. 영구 삭제, 휴지통 없음 |

### 5. 에디터 안 (monaco 제공)

| 기능 | workbench-kit | VS Code |
| --- | --- | --- |
| 찾기 / 바꾸기 | `Ctrl+F` / `Ctrl+H` | 같음 |
| 되돌리기 / 다시하기 | `Ctrl+Z` / `Ctrl+Y` | 같음 |
| 저장 | `Ctrl+S` | 같음 |

자동완성·hover·미니맵·멀티커서는 꺼져 있다.

## 라이선스

MIT. 다음 오픈소스를 가져다 쓴다.

| 무엇 | 어디에 | 라이선스 |
| --- | --- | --- |
| [dockview](https://github.com/dockview/dockview) | 칸·탭 레이아웃 | MIT |
| [monaco-editor](https://github.com/microsoft/monaco-editor) | 텍스트·코드 편집 | MIT |
| [codicons](https://github.com/microsoft/vscode-codicons) | UI 아이콘 | 아이콘 CC BY 4.0 / 코드 MIT |
| [seti-ui](https://github.com/jesseweed/seti-ui) | 파일 종류 아이콘(기본) | MIT |
| [vscode-icons](https://github.com/vscode-icons/vscode-icons) | 파일 종류 아이콘(컬러) | 아이콘 CC BY-SA / 코드 MIT |

아이콘 저작자 표시는 앱 안의 `Help > About`에서도 볼 수 있다. 라이선스 본문 전체는
소스의 `licenses/` 폴더에 있다.
