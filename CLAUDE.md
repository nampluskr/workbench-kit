project-workflow v0.2 기준으로 초기화됨 (2026-09-08)

# 이 프로젝트에서 지킬 것

- `docs/current/INTENT.md`는 SSOT다. 사람의 요청으로만 고친다. 다른 문서는 여기 어긋나면 안 된다
- 현재 버전 문서는 `docs/current/`에 있다. INTENT와 버전 문서는 사람이 쓴다. **고치지 않는다**
- 문서가 `INTENT.md`에 어긋나면 혼자 맞추지 말고 멈추고 보고한다
- major·minor 버전 번호는 사람이 정한다. 스스로 올리지 않는다
- `backlog.json`은 CLI로만 바꾼다. 직접 편집하지 않는다
- 진행 중에 task를 추가하지 않는다. 계획 밖 작업은 `docs/current/PROGRESS.md`에 적는다
- task를 닫을 때마다 `PROGRESS.md`에 무엇을·결과·검증을 남긴다
- `docs/history/` 아래는 읽기만 한다. 수정도 삭제도 하지 않는다
- 완료 조건은 `PLAN.md`·`backlog.json`에 적힌 것으로 판정한다. 스스로 정하지 않는다
- 요구가 바뀌면 `SPEC.md`부터 고친다. 코드나 backlog로 우회하지 않는다
- 되돌릴 수 없는 작업(배포·삭제·외부 상태 변경)은 먼저 묻는다

- 껍데기는 리소스 종류를 모른다. 파일·폴더·터미널·확장자를 아는 코드를 공통 코어에 넣지 않는다 (INTENT 3 · D-4 · NFR-1)
- 두 갈래(Electron · pywebview)는 **산출물 한 벌**을 읽는다. 갈래별로 갈라진 빌드 설정을 만들지 않는다 (D-25 · NFR-2)
- 칸·탭·보기 수명은 dockview, 편집 화면은 monaco, 아이콘은 codicons·seti·vscode-icons를 쓴다. 직접 구현하지 않는다 (NFR-4)
- 새 기능 Phase와 리팩토링은 `docs/ADVERSARIAL-REVIEW.md`의 **반대 벤더 검증**을 거친다. 반대 벤더 CLI를 못 쓰면 기본 모델로 폴백하지 말고 멈추고 보고한다
- 필수 통과 Phase는 1 · 4 · 5 · 7이다. 미해결 Critical이 있으면 다음 Phase로 넘어가지 않는다 (`PLAN.md` 적대적 검증)

<!--
아래에 이 프로젝트 고유의 제약을 추가한다.
버전 마감 때 DECISIONS.md에서 승격된 것이 여기 들어온다. 출처를 남긴다.

- torch 버전을 올리지 않는다 (v0.1 D-3)

5~15줄을 넘기지 않는다. 길어지면 안 읽힌다.
설명과 배경은 여기 쓰지 않는다. 근거는 그 버전 DECISIONS.md에 있다.
-->
