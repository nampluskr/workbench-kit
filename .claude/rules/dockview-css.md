# dockview 스타일 — 라이브러리가 준 CSS가 적용되지 않는다

이 규칙이 막는 사고: dockview가 자기 CSS를 갖고 있다고 믿고 `dv-*` 규칙을 안 쓰거나,
쓰다 만 채로 두는 것. 그러면 화면에는 아무것도 안 나오는데 **DOM 질의와 자동 검사는
전부 통과한다.** v0.1에서 실제로 두 번 일어났다.

**대상 경로** — `src/style.css`, 그리고 dockview 버전을 올리는 모든 변경.

## 무엇이 벌어지고 있나

`dockview-core` 8.2.0은 **스타일시트 파일을 배포하지 않는다.** 대신 모듈이 로드될 때
`document.head`에 인라인 `<style>`을 만들어 자기 CSS를 주입한다. 그런데 이 앱의
`index.html`은 `style-src 'self'` CSP를 걸고 있으므로 **브라우저가 그 주입을 통째로
차단한다** — 요소는 head에 남지만 `document.styleSheets`에 등록되지 않는다.

결과적으로 **모든 `dv-*` 규칙은 `src/style.css`에 직접 있어야 한다.** 이 파일의
`dv-*` 구간은 취향이 아니라 **벤더 CSS의 손복사본**이다.

## 하지 않는다

- CSP를 풀어서 인라인 스타일을 허용한다. 이 앱의 보안 기준을 낮추는 방향이다
- dockview가 알아서 그려 줄 것으로 보고 `dv-*` 규칙을 생략한다
- 요소가 DOM에 있다는 것만으로 "보인다"고 판정한다. **실측 크기·색·조상 가시성까지 본다**

## dockview 버전을 올릴 때

`src/style.css`의 손복사본이 조용히 낡는다. 올리기 전에 확인한다.

1. 새 번들이 주입하는 CSS 문자열을 꺼내 `src/style.css`의 `dv-*` 구간과 대조한다
2. **클래스명이 바뀌었는지 본다.** v0.1에서 `dv-drop-target-overlay`를 스타일링하고
   있었는데 그 이름은 dockview 8.2.0이 발행하지 않는 것이었다 — 드래그 표시가 통째로
   안 그려지는데 드롭 자체는 동작해서 검사가 통과했다
3. `scripts/phase4-suite.js`의 `P4-SEPARATOR-SIZE` · `P4-SEPARATOR-COLOR` ·
   `P4-DND-INDICATOR`가 회귀 단언이다. 규칙을 지우면 실패하는 것을 확인했다

출처: v0.1 계획 외 개선 (UT-EDT-003) · `docs/reviews/A8.md`
