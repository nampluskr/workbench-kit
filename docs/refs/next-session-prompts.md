# 다음 세션에서 쓸 프롬프트

> 참조 메모 · 작성일: 2026-09-08
>
> `project-workflow/docs/PROMPTS.md` 2절의 방식을 이 프로젝트에 맞게 조정한 것이다.
> 순서대로 복사해서 쓴다. **한 번에 하나씩** 준다.
>
> 표준 프롬프트와 한 군데 다르다. 표준은 "대신 지어내지 말고 질문만 해"인데, 이
> 프로젝트는 기능 요구사항이 될 시나리오 70개가 이미 `refs/scenarios.md`에 있다.
> 그것을 알려주지 않으면 새 세션이 처음부터 70번을 묻는다.

---

## 1. SPEC.md

```
D:\projects\_ideas\workbench-kit 의 기획 문서를 이어서 쓴다. SPEC.md를 만들 차례야.

먼저 읽어:
- D:\projects\project-workflow\docs\DOC-SCHEMA.md 의 1절과 5절
- INTENT.md · BRIEF.md · DECISIONS.md (결정 D-1 ~ D-28)
- refs/scenarios.md — 시나리오 70개와 각각의 정해진 결과

1절 기능 요구사항은 새로 짜는 게 아니라 refs/scenarios.md를 옮기는 일이야.
항목마다 FR 번호를 붙이고 판정 방법을 적어. 어느 결정(D-n)에서 나온 것인지도 남겨.
내용을 바꾸거나 없던 요구를 새로 지어내지 마. 옮기다가 빠진 게 보이면 물어봐.

2절 비기능 요구사항 · 3절 제약사항 · 4절 미구현 대상은 시나리오에 없다.
DECISIONS와 BRIEF에서 끌어올 수 있는 것을 먼저 정리해 보여주고, 모자란 것만 나한테 물어.
한 번에 하나씩 묻고, 내가 모호하게 답하면 다시 물어.

INTENT.md에 어긋나는 게 보이면 고치지 말고 멈추고 보고해.
```

---

## 2. PLAN.md

SPEC이 끝난 뒤.

```
SPEC.md가 끝났으니 PLAN.md를 쓴다.

D:\projects\project-workflow\docs\DOC-SCHEMA.md 6절을 읽어.
Phase 인덱스만 쓰고 상세 설계는 쓰지 마.
Phase마다 목적 한 줄 · 대응 요구 ID · 검증 가능한 완료 조건.
완료 조건 없는 Phase가 하나라도 있으면 그 문서는 미완성이야.

Phase를 어떻게 가를지 초안을 먼저 보여주고 내 확인을 받아.
그때 이것도 같이 설명해:
- D-6이 pywebview와 Electron 두 갈래를 함께 만들기로 했는데, 그게 Phase 순서에
  어떻게 반영되나
- D-24(dockview) · D-18(monaco) 같은 반입이 어느 Phase에 들어가나
```

---

## 3. backlog.json

PLAN이 끝난 뒤.

```
PLAN.md가 끝났으니 backlog.json을 쓴다.

D:\projects\project-workflow\docs\DOC-SCHEMA.md 7절을 읽어.
task마다 id · phase · summary · note · done.
note에 설계 설명을 쓰지 마. 맥락은 PLAN과 DECISIONS가 담는다.
모든 task에 완료 조건이 있어야 하고, phase는 PLAN에 있는 번호여야 해.

다 쓰면 backlog validate 를 돌려서 결과를 보여줘.
(backlog CLI는 D:\projects\_bin\backlog.cmd 에 있다.)
```

---

## 4. 검사

셋을 다 쓴 뒤.

```
D:\projects\project-workflow\docs\DOC-SCHEMA.md 10절 검사 목록으로
D:\projects\_ideas\workbench-kit 의 문서를 검사해줘.
고치지는 말고 결과만 표로 보여줘.
```

**걸리는 항목이 나오면 그게 정상이다.** 대신 채워 주면 잘못 동작한 것이다.

한 가지는 미리 알고 있다 — `BRIEF.md`의 완료 조건이 아직 `refs/scenarios.md`를
가리킨다. SPEC이 생기면 이렇게 고친다.

```
BRIEF.md의 완료 조건이 refs/scenarios.md를 가리키고 있어.
SPEC.md를 가리키게 고쳐줘.
```

---

## 5. 승격 (초기화)

검사를 통과한 뒤. **여기서부터 폴더가 움직인다.**

```
D:\projects\project-workflow\docs\INIT.md 를 읽고 이 프로젝트를 초기화해줘.
D:\projects\_ideas\workbench-kit 를 최상위(D:\projects\workbench-kit)로 승격하는 거야.

- git 저장소와 GitHub 원격이 이미 있다
- refs/ 가 있으니 docs/refs/ 로 옮겨
- 착수 모드를 먼저 판별해서 말하고, 검사 결과를 표로 보여준 다음 진행해
- 빠진 게 있으면 대신 채우지 말고 멈추고 보고해
```

---

## 쓰지 말 것

`PROMPTS.md` 11절이 그대로 적용된다. 이 프로젝트에서 특히 조심할 것 둘.

- **"SPEC도 네가 알아서 써줘"** — 기능 요구사항은 시나리오를 옮기는 것이지만
  비기능·제약·미구현 대상은 사람 몫이다. 그것까지 맡기면 요구가 일반론이 된다.
- **"전 Phase 다 진행해줘"** — 구현에 들어간 뒤의 이야기지만, 한 Phase씩 준다.
