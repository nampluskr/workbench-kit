# monaco 색 — `setTheme()`으로는 색이 안 바뀐다

이 규칙이 막는 사고: monaco의 `setTheme()`/`defineTheme()`을 부르면 에디터 색이 VS Code처럼
바뀔 거라고 믿는 것. 실제로는 **한 픽셀도 안 바뀐다.**

**대상 경로** — `src/style.css`의 monaco 관련 구간, `src/**/texteditor.ts`.

## 무엇이 벌어지고 있나

monaco는 테마 색을 실행 시 `<style class="monaco-colors">`(약 140KB, `--vscode-*` 정의
1,770여 개 포함)로 주입한다. 이 앱의 CSP(`style-src 'self'`)가 **주입된 `<style>`을
차단**하므로(`dockview-css.md`와 같은 함정) `document.styleSheets`에 이 시트가 끝내
등록되지 않는다. `setTheme()`은 monaco 내부에서 이 시트의 내용을 바꾸려 할 뿐이라
아무 효과가 없다.

반면 vite가 번들한 monaco CSS(`.mtk*` 토큰 색 제외)는 정상 적용되고, 그 CSS는 색을
전부 `var(--vscode-*)`로만 참조한다.

## 하지 않는다

- `setTheme()`/`defineTheme()`으로 색이 바뀔 것으로 기대하고 CSS 쪽 작업을 생략한다
- CSP의 `style-src`/`style-src-elem`을 풀어서 주입된 `<style>`을 허용한다 (금지 사유는
  `dockview-css.md`와 동일 — 벤더 색이 손복사본을 덮어쓰고 보안 기준이 내려간다)
- `.mtk*` 토큰 색(문법 강조)이 이미 있다고 가정한다 — v0.2에서는 범위 밖으로
  의도적으로 뺐다(plain text + 찾기 위젯만, D-19)

## 색을 추가·수정할 때

1. `src/style.css`의 `:root`/테마 블럭에 필요한 `--vscode-*` 변수를 앱 토큰(`--editor-bg`
   등)에 연결하거나, 대응 앱 토큰이 없으면 테마 블럭마다 값을 직접 둔다
2. 앱 토큰으로 못 미치는 것(캐럿, 현재 줄 표시, `.mtk*`)은 벤더 CSS를 실측해 손복사한다
3. `src/**/texteditor.ts`의 `setEditorColorTheme()`에서 `vs`/`vs-dark` 루트 클래스만
   맞추고, 실제 색은 1~2번의 CSS가 낸다

출처: v0.2 D-19 · D-20 · `docs/current/DECISIONS.md`
