# 구현 세션에 줄 지시문

> 참조 메모 · 작성일: 2026-09-25 · 대상 버전 v0.4
>
> 기획 세션에서 착수·구현 세션으로 넘기는 자리다. **한 번에 하나씩** 준다.
> v0.1용 지시문은 git 이력(이 파일의 이전 커밋)에 있다.

## 넘기기 전에 알아 둘 것

- **v0.4 문서는 레포 루트에 있다** — `BRIEF.md` · `DECISIONS.md`(D-1~D-11) · `PLAN.md`.
  `SPEC.md`·`backlog.json`은 두지 않는다. INIT(모드 B)가 이것들을 `docs/current/`로 옮긴다.
- **`INTENT.md`가 2026-09-25에 바뀌었다** — 복사해 쓰는 껍데기에서 필수·공통 기능을
  갖춘 stand-alone 베이스 앱으로(1·3·4·7절). 그래서 이번 버전은 마크다운 렌더링을
  **공통부 `src/core/markdown/`에 둔다**(D-11). 허용 범위는 `.claude/rules/common-core.md`의
  허용 목록이 정한다.
- **INIT 사전 검사는 이 세션에서 미리 돌렸다(2026-09-25)** — 전부 통과. `docs/current/`의
  v0.3 파일 5개는 `docs/history/v0.3/`과 바이트 단위로 같으므로 INIT 5단계에서 지워도 잃는
  것이 없다. backlog CLI는 이 PATH에 없지만 v0.4는 backlog를 쓰지 않아 해당 없음.
- **`README.md` 개요 블럭은 에이전트 초안이다.** 사람이 아직 문구를 확정하지 않았다.
- **Python·pywebview 버전은 확인하지 못했다** — 이 세션 PATH에는 Windows Store `python`
  스텁뿐이었다. `PLAN.md`에 v0.3 값과 "착수 시 재확인"이 적혀 있다.
- **필수 통과 Phase는 1 · 2 · 3 · 4 전부다.** 미해결 Critical이 있으면 다음 Phase로 넘어가지 않는다.
- v0.3까지 반대 벤더 검토자는 Codex였다(`docs/reviews/A29.md`). 구현 에이전트의
  벤더가 다르면 그 **반대** 벤더를 쓴다.

---

## 0. v0.4 착수 (INIT 모드 B)

```
D:\projects\workbench-kit 에서 작업한다.

D:\projects\project-workflow\docs\INIT.md 를 읽고 v0.4를 시작해줘.
루트의 BRIEF.md·DECISIONS.md·PLAN.md 가 v0.4 문서다.
current의 INTENT.md는 지우지 말고(2026-09-25에 사람 요청으로 개정됨),
이전 BRIEF(docs/history/v0.3/BRIEF.md)와 대조한 요약을 먼저 보여준 다음
내 확인을 받고 진행해.
보고에 반대 벤더 CLI 사용 가능 여부와 Python·pywebview 실제 버전을 포함해.
```

**기대 반응** — 모드 B 판별 → 사전 확인 → 문서 검사 표 → BRIEF 대조 요약 후 **멈춤**
→ 승인 → `docs/current/` 교체·새 `PROGRESS.md` → 하네스 점검 → 보고 후 **멈춤**.

---

## 1. Phase 시작 (Phase마다)

```
D:\projects\workbench-kit 에서 작업한다.

Phase <n>을 시작한다.
읽어: docs/current/PLAN.md 의 Phase <n> 절, 그 절의 "대응"에 적힌 D-n만
docs/current/DECISIONS.md 에서.
읽지 마: DECISIONS 전체 · refs/ 전체 · history/.

먼저 완료 조건 각각을 무엇으로 판정할지(어느 verify 스크립트의 어떤 단언인지)
말하고 내 확인을 받아. 그다음 구현해.
끝나면 docs/current/PROGRESS.md 에 무엇을·결과·검증을 남겨.
막히면 추측하지 말고 멈추고 물어.
```

| Phase | 특히 조심할 것 |
| --- | --- |
| 1 렌더링 파이프라인 | `src/presets/file-preset.ts` diff 0줄. `scripts/verify-phase3.mjs` 공통부 정적 검사는 `src/core/markdown/`**만** 빼고 나머지엔 그대로 둔다. XSS 단언은 "실행 흔적 0건"을 실제로 센다 |
| 2 토글과 열기 규칙 | 아이콘은 **새 SVG 두 개**(D-1, 사람이 승인한 아이콘 규칙 예외 — 이 둘로 한정). Activity Bar에 더하는 SVG 경로는 범용 장치로, 마크다운을 모른다. 이미 열린 탭은 토글에 따라 바뀌지 않는다 |
| 3 수식과 코드 강조 | `katex.css`가 번들 파일로 **실제로 적용**되는지 실측(CSP가 주입 `<style>`을 막는다). DOMPurify가 KaTeX 출력을 지우지 않는지 |
| 4 이미지·링크·저장 갱신 | CSP는 `img-src 'self' blob:` **하나만** 더한다. 외부 열기 브릿지는 `http(s)`만. `src/core/markdown/` 밖 변경은 D-11이 이름을 댄 것뿐 |

---

## 2. 적대적 검증 (Phase마다 — 전부 필수 통과)

```
Phase <n>의 세션 내 리뷰어 검토가 끝났으니 반대 벤더 적대적 검증을 돌린다.

docs/ADVERSARIAL-REVIEW.md 를 읽고 그대로 따라.
구현자가 누구였는지 먼저 말하고, 그 반대 벤더 CLI로 돌려.
공격 초점은 docs/current/PLAN.md "적대적 검증" 절의 Phase <n> 행이다.
Phase 4는 D-7·D-10과 BRIEF 4절도 함께 준다.

- 검토자에게 구현 세션 대화·판단 근거·git 상태를 주지 마
- 실행은 3회까지. 소진하면 멈추고 보고해
- 반대 벤더 CLI를 못 쓰면 기본 모델로 폴백하지 말고 멈추고 보고해
- 결과를 docs/reviews/A<번호>.md 에 6절 양식으로 남겨 (v0.3 마지막이 A29)

미해결 Critical이 있으면 다음 Phase로 넘어가지 마.
통과하면 그 Phase 변경분을 커밋해.
```

---

## 쓰지 말 것

- **"전 Phase 다 진행해줘"** — 한 Phase씩 준다. 네 Phase 모두 필수 통과 게이트가 있다.
- **"공통부니까 core 어디든 고쳐도 돼"** — 허용은 `src/core/markdown/` 폴더뿐이다(D-11).
- **"아이콘도 예외 됐으니 다른 것도 SVG로"** — 예외는 D-1의 두 개로 한정.
- **"CSP 좀 풀어서 해결해"** — `img-src blob:` 외에는 풀지 않는다(`.claude/rules/dockview-css.md`).
