# `docs/` — 요구가 사람 것이 아니게 되는 사고를 막는다

이 규칙이 막는 사고: 구현이 막힐 때 에이전트가 요구 쪽을 고쳐 맞추는 것. 그러면
"무엇을 하기로 했었나"가 사후에 바뀌어 완료 판정이 무의미해진다.

## `docs/current/` — 읽는다. 고치지 않는다

`INTENT.md` · `BRIEF.md` · `DECISIONS.md` · `SPEC.md` · `PLAN.md`는 **사람이 쓴다.**
요구가 실제로 바뀌어야 한다면 코드나 backlog로 우회하지 말고 **멈추고 보고한다.**

예외는 둘이다.
- `PROGRESS.md` — 에이전트가 append한다. task를 닫을 때마다 쓴다.
- `backlog.json` — **CLI로만** 바꾼다(`backlog update`). 직접 편집은 hook이 막는다.

## `docs/refs/` — 참고 자료. 읽기 전용으로 본다

`scenarios.md`가 `SPEC.md` 1절의 재료다. 둘이 어긋나 보이면 **`SPEC.md`가 계약**이고,
어긋남 자체를 보고한다.

`next-version.md`는 다음 버전으로 미룬 것이다. 이번 버전에서 하지 않는다.

## `docs/ADVERSARIAL-REVIEW.md` — 가이드의 사본. 고치지 않는다

절차가 바뀌면 `project-workflow`의 원본을 고치고 다시 복사한다.

## `docs/reviews/` — Phase별 검토 기록 `A{n}.md`가 쌓인다

필수 통과 Phase(현재 버전 `PLAN.md`가 정한다. v0.2: 1 · 4 · 7)는 여기 기록이 없으면 닫지 않는다.
