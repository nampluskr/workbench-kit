> 버전: v0.4 · 작성일: 2026-09-25 · 상태: 초안 (사람 확인 대기)
>
> 이 문서는 이번 버전에 적용할 설계 결정을 기록한다. 변하지 않는 의도는
> workbench-kit의 `INTENT.md`에, 이번 버전에 무엇을 왜 하는지는 `BRIEF.md`에 있다.
> 출발점은 `docs/refs/next-version.md`의 `N-2`와 그 "v0.4에서 정해야 할 것" 목록이다.

# DECISIONS — workbench-kit v0.4

## D-1. 마크다운 토글 아이콘은 새 SVG 두 개로 만든다 (아이콘 직접 구현 금지의 예외)

**선택**

Activity Bar의 마크다운 토글에 쓸 SVG 아이콘 두 개를 새로 만든다. 모양은
`codicon-markdown`을 바탕으로 한다.

| 상태 | 모양 |
| --- | --- |
| 꺼짐 (기본) | `codicon-markdown` 바깥에 사각형 테두리 |
| 켜짐 | 사각형 내부가 채워지고, 안의 `codicon-markdown`은 반전된(빼낸) 형태 |

SVG는 기존 vscode-icons와 같은 방식(`src/icons/vscode-icons.ts`의 `import.meta.glob`
원문 문자열 → 인라인 SVG)으로 넣고, 색은 `currentColor`로 두어 세 색 테마를 따른다.
`codicon-markdown`(MIT, `@vscode/codicons`)의 경로를 가져다 쓰면 라이선스 고지를
`licenses/`에 맞춘다.

위치는 Activity Bar 상단 `File Filter` 바로 아래, 호버 라벨은 `"Markdown Rendering"`이다.
Activity Bar에 영역 표시 토글이 아닌 항목을 두는 두 번째 예외다(첫 번째는 v0.3 D-12의
File Filter).

지금 `ActivityBarController`는 codicon 클래스만 그린다(`src/core/activitybar.ts:97`,
`<i class="codicon …">`). SVG 항목을 그리려면 이 컨트롤러에 **SVG 아이콘을 받는 범용
경로**를 더한다. 마크다운을 아는 코드는 그 경로에 넣지 않는다(어느 앱이든 SVG 아이콘을
쓸 수 있는 장치). 이 변경은 D-11에 따라 공통부 변경으로 허용된다.

**근거**

사용자가 꺼짐·켜짐 모양과 새 SVG 방식을 지정했다(2026-09-25). 이것은 "아이콘을 직접
구현하지 않는다"(v0.2 `NFR-7`, `CLAUDE.md`)의 **사람이 승인한 예외**이며, 예외는 이
아이콘 두 개로 한정한다. 인라인 SVG이므로 CSP `img-src`와 무관하다.

**배제한 대안**

- **기존 codicon 둘로 교체** (`codicon-markdown` ↔ `codicon-open-preview`/`codicon-preview`,
  파일 필터 방식) — 사용자가 사각형 테두리/반전 모양을 지정해 배제.
- **`codicon-markdown` 글리프 + CSS로 사각형·반전 그리기** — 아이콘 파일 없이 되지만
  사용자가 새 SVG를 골랐다. 배제.
- **`.activity-bar-item.active` 배경 강조** — 사용자가 지정한 모양이 아니다. 배제.

---

## D-2. 렌더링은 markdown-it, 정화는 DOMPurify. 원문 HTML은 정화 후 렌더링한다

**선택**

마크다운→HTML 변환은 `markdown-it`, 결과 HTML의 정화는 `DOMPurify`로 한다. 마크다운
안에 직접 쓴 HTML 태그는 글자로 표시하지 않고, 정화(스크립트·이벤트 속성 등 제거)한
뒤 HTML로 그린다. 두 라이브러리는 새 의존성이며 공통부의 마크다운 렌더링 모듈(D-11)에서만 쓴다.

**근거**

저장소에 마크다운 렌더러와 정화 라이브러리가 없다. `markdown-it`은 VS Code 마크다운
미리보기가 쓰는 렌더러다. 임의 마크다운을 그리므로 XSS를 막는 정화 층이 필요하다
(`next-version.md` N-2 "CSP 안전").

**배제한 대안**

- **`marked` + `DOMPurify`** — 원문 HTML을 그대로 통과시켜 안전을 정화 층에만 의존한다. 배제.
- **원문 HTML을 글자 그대로 표시** — 가장 안전하지만 사용자가 정화 후 렌더링을 골랐다. 배제.

---

## D-3. 테이블과 수식을 렌더링한다. 수식은 KaTeX HTML 출력

**선택**

- **테이블**: `markdown-it` 기본 GFM 테이블을 그대로 쓴다. 테이블 선·색은 `src/style.css`에 둔다.
- **수식**: KaTeX로 그린다(VS Code 미리보기와 같은 `@vscode/markdown-it-katex` 계열).
  문법은 인라인 `$…$`, 블록 `$$…$$`. 출력은 **KaTeX HTML**이며, `katex.css`와 글꼴
  파일을 번들에 포함한다.

**근거**

사용자 요청(2026-09-25, "수식과 테이블도 보이게"). 출력 방식은 VS Code·GitHub과 같은
모양인 HTML 출력을 사용자가 골랐다. 이 앱의 CSP는 주입된 `<style>`을 막으므로
(`.claude/rules/dockview-css.md`), `katex.css`가 번들된 파일로 실제 적용되는지와 글꼴이
`font-src 'self' data:` 안에서 로드되는지를 **실측으로 확인해야 한다.** KaTeX 출력의
`style="…"` 속성은 `style-src-attr 'unsafe-inline'`(D-20, v0.2)으로 허용된다. DOMPurify
설정은 KaTeX 출력을 지우지 않아야 한다.

**배제한 대안**

- **KaTeX MathML 출력** — CSS·글꼴 번들이 없어 CSP 위험은 없지만 모양이 투박하다. 배제.
- **수식 미지원** — 사용자 요청으로 배제.

---

## D-4. 렌더링 화면의 이름은 `rendered` / "Rendered"다

**선택**

렌더링 보기의 코드 식별자는 `'rendered'`를 쓴다(기존 파일 탭 모드 `'viewer'`·`'editor'`와
겹치지 않게). 화면 글자(탭 툴팁 등)는 `"Rendered"`. 코드는 `src/core/markdown/`에 있다(D-11).

**근거**

`preview`는 이미 "한 번 클릭으로 열리는 임시(치환) 탭"의 뜻으로 `src/core/editor.ts`에
73곳 쓰이고 있고, `viewer`는 읽기 전용 원문 모드다. 셋과 겹치지 않는 이름이 필요하다.
화면 글자는 영어로 고정한다(v0.2 D-9).

**배제한 대안**

- **`reader` / "Reader"** — `viewer`와 뜻이 비슷해 헷갈린다. 배제.
- **`markdown-render` / "Markdown"** — 다른 형식 렌더링이 생기면 이름이 늘어난다. 배제.
- **`preview`** — 기존 임시 탭 뜻과 충돌한다. 배제.

---

## D-5. 토글이 켜지면 `.md`는 클릭·Enter·F3으로 rendered, F4로 editor

**선택**

| | 토글 켜짐, `.md` | 토글 꺼짐 (지금과 동일) |
| --- | --- | --- |
| 트리 클릭·`Enter` | rendered | 기본 열기 모드 |
| `F3` (트리·열린 탭) | rendered | viewer |
| `F4` (트리·열린 탭) | editor (원문) | editor |

- 토글을 바꿔도 **이미 열린 탭은 그대로** 둔다. 다음에 여는 `.md`부터 적용한다.
- 토글이 켜진 동안 `.md`의 원문 읽기 전용(viewer)은 토글을 꺼야 쓸 수 있다.
- `.md`가 아닌 파일은 토글과 무관하다.

**근거**

사용자가 위 동작을 골랐다(2026-09-25). 이미 열린 탭을 건드리지 않으므로 편집 중(●)
탭의 모드가 바뀌는 일이 없다.

**배제한 대안**

- **F3이 rendered ↔ viewer를 순환** — 배제.
- **토글을 바꾸면 열린 탭도 전환** — 배제.

---

## D-6. 토글은 전역 설정이고, 재시작 뒤에도 기억하며, 기본은 꺼짐이다

**선택**

- 모든 Folder Tab의 모든 `.md`에 하나의 값을 쓴다.
- `localStorage`에 저장한다. 처음에는 꺼짐.
- 기본 열기 모드(`workbench:default-file-mode`)를 editor로 둔 경우에도 토글이 켜져
  있으면 트리 클릭·`Enter`로 연 `.md`는 rendered다(토글 우선).
- 설정 모듈은 공통부의 마크다운 렌더링 모듈(D-11) 안에 둔다. 형태는
  `src/presets/delete-enabled.ts`(localStorage 키 + 변경 알림)를 따른다.

**근거**

사용자가 골랐다(2026-09-25). 기존 전역 설정인 Delete enabled와 같은 수명이다. 기본
꺼짐이면 업그레이드 직후 동작이 v0.3과 같다.

**배제한 대안**

- **Folder Tab마다 따로** — 배제.
- **기억 안 함(실행마다 꺼짐)**, **기억하되 기본 켜짐** — 배제.
- **기본 열기 모드 우선** — 배제.

---

## D-7. 로컬 이미지는 blob: URL로 띄우고, CSP에 `img-src 'self' blob:`을 더한다

**선택**

마크다운의 상대 경로 이미지(`![](./img.png)`)는 앱이 fs 브릿지로 파일을 읽어 `blob:`
URL로 바꿔 표시한다. `index.html` CSP에 `img-src 'self' blob:`을 더한다. 원격
(`http`·`https`) 이미지는 표시하지 않는다.

**근거**

사용자가 로컬 이미지 표시를 v0.4 범위에 넣었다(2026-09-25). 현재 CSP는 `img-src`가
없어 `default-src 'self'`를 따르므로 앱 번들 밖 파일·`data:`·`blob:` 이미지가 모두
막힌다. 여는 것은 이미지 종류뿐이며 `script-src`·`style-src`·`style-src-elem`은 그대로다.

**배제한 대안**

- **`img-src data:`** — base64 변환이라 큰 이미지에서 메모리·속도가 불리하다. 배제.
- **이미지 포기(대체 텍스트만)** — 사용자가 포함을 골랐다. 배제.

---

## D-8. 코드 블록 문법 강조는 highlight.js

**선택**

rendered 화면의 코드 블록(```` ```lang ````)은 `highlight.js`로 색을 입힌다. 색은 `hljs`
클래스에 대해 `src/style.css`의 테마 블록마다 둔다.

**근거**

VS Code 마크다운 미리보기가 쓰는 것과 같다. 색이 클래스로 나오므로 테마 토큰으로
정의할 수 있고 CSP 주입 `<style>` 문제가 없다.

**배제한 대안**

- **monaco colorize** — 새 의존성은 없지만 `.mtk*` 토큰 색이 CSP 때문에 없어
  (`.claude/rules/monaco-colors.md`) 손복사해야 한다. 배제.
- **Shiki** — 색을 인라인 `style` 속성으로 넣어 테마 토큰 규칙(`dockview-css.md`)과
  어긋나고 번들이 크다. 배제.

---

## D-9. rendered 탭은 앱 안에서 저장할 때만 다시 그린다

**선택**

같은 파일을 editor 탭에서 저장하면 열려 있는 그 파일의 rendered 탭을 다시 그린다.
타이핑 중(저장 전)이나 외부 편집기로 바꾼 내용은 반영하지 않는다.

**근거**

사용자가 골랐다(2026-09-25). 새 호스트 브릿지(파일 감시)가 필요 없다.

**배제한 대안**

- **앱 안 편집 즉시(저장 전 포함)** — 배제.
- **디스크 변경 감시(외부 편집기 포함)** — 두 호스트에 감시 브릿지가 새로 필요하다. 배제.

---

## D-10. 링크는 상대 경로·외부·앵커를 모두 처리한다

**선택**

| 링크 | 동작 |
| --- | --- |
| 상대 경로 파일 | 앱 안에서 연다. 열기 모드는 D-5를 따른다 |
| `http`·`https` | 외부 브라우저로 연다 |
| `#제목` | 같은 문서 안에서 해당 위치로 스크롤 |

외부 브라우저 열기는 두 호스트에 브릿지를 새로 더한다(`deletePath`와 같은 구조:
`src/hosts/electron/main.cjs`·`preload.cjs`, `src/hosts/pywebview/main.py`,
`src/providers/filesystem.ts` — 모두 `src/core` 밖). 그 밖의
스킴(`file:`·`javascript:` 등)은 열지 않는다.

**근거**

사용자가 골랐다(2026-09-25). 현재 저장소에 외부 브라우저를 여는 코드가 없다.

**배제한 대안**

- **상대·앵커만(외부 링크는 무동작)** — 배제.

---

## D-11. 마크다운 렌더링은 공통부 `src/core/markdown/`에 둔다

**선택**

렌더러(markdown-it·DOMPurify·KaTeX·highlight.js), rendered 보기, 토글 설정(D-6), 그리고
`.md`를 rendered로 여는 연결(D-4·D-5)까지 **전부** `src/core/markdown/`에 둔다.
`src/presets/file-preset.ts`는 고치지 않는다. 이미지 읽기(D-7)와 외부 열기(D-10)는
기존 호스트 브릿지(`src/providers/filesystem.ts`)를 거친다.

`src/core/markdown/` 밖에서 필요한 변경은 두 종류로 한정한다 — (1) 앱 진입점
(`src/main.ts`)에서 이 모듈을 등록·배선하는 것, (2) D-1의 Activity Bar SVG 경로,
D-10의 외부 열기 브릿지처럼 이 결정 문서가 이름을 댄 것. 그 밖의 변경이 필요해지면
구현을 멈추고 사람에게 묻는다.

`.claude/rules/common-core.md`의 허용 목록에 이 기능을 올리고, `scripts/verify-phase3.mjs`의
공통부 정적 검사는 이 폴더만 빼고 나머지 `src/core`에는 그대로 적용한다.

**근거**

`INTENT.md`가 2026-09-25에 바뀌어 베이스 앱의 필수·공통 기능은 리소스 종류를 알더라도
공통부에 둘 수 있게 됐고, 마크다운 렌더링이 그 필수 기능으로 명시됐다. 사용자가 위치를
공통부로 골랐다(2026-09-25). 한 폴더로 모아야 허용 목록과 정적 검사의 예외를 좁게 둘 수 있다.

**배제한 대안**

- **갈아끼우는 자리(`src/presets/`)에 둔다** — 필수 기능이 파생 앱에서 갈아끼워질 수 있는
  자리에 놓인다. 배제.
- **렌더러는 `src/core/markdown/`, 탭 모드 연결은 `file-preset.ts`** — 사용자가 전부
  공통부로 골랐다(2026-09-25). 배제.
- **별도 공통 기능 폴더(`src/features/` 등) 신설** — 층이 하나 더 생긴다. 배제.
- **`src/core` 전체에서 정적 검사를 푼다** — 허용 목록 밖 코드의 누수를 못 잡는다. 배제.
