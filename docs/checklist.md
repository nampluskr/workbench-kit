# 검사 목록 — 구현 세부 검사 · 로직 수준 시뮬레이션 · 사용자 행동 검사

> 작성: Phase 7 (WK-039) · FR-R3의 완료 조건을 충족하는 정식 문서. `npm test`
> (`scripts/verify-dist.mjs` + `scripts/verify-phase2~7.mjs`)가 내는 **모든 검사**를
> 아래 세 종류로 가른다. 어디에도 속하지 않는 검사는 0개다.
>
> **Round-1 adversarial review (A7) 수정**: 최초 판에서 `verify-phase3.mjs`의
> Mock DOM 절(§4)을 "사용자 행동"으로 분류했었다 — 틀렸다. 그 절은 실제 브라우저가
> 아니라 Node 프로세스 안의 `MockElement`/`global.document`에 `TreeController`를
> 직접 심어 이벤트를 발사한다(§1의 원래 정의가 요구하는 "살아 있는 브라우저"가
> 아예 없다). 실제 호스트 배선(DOM 렌더링·CSS·메뉴↔트리 실배선·Electron/pywebview
> 이벤트 루프)의 결함을 잡지 못한다는 뜻이다. 아래에 **세 번째 종류**를 신설해
> 정확히 다시 분류했다.
>
> **Round-3 adversarial review (A7) 이후 SPEC 개정**: 이 세 번째 종류는 처음엔
> `docs/current/SPEC.md`의 FR-R3(당시 "두 종류") 문언과 어긋났었다. 반대 벤더
> 검토에서 지적받아 사람이 확인 후 FR-R3를 세 종류를 요구하도록 개정했다
> (2026-09-09). 지금은 이 문서와 SPEC이 일치한다.

---

## 1. 분류 규칙

| 종류 | 정의 | 실행 방식 |
| --- | --- | --- |
| **사용자 행동 검사** | 실제 키보드·마우스 조작(또는 그것을 코드로 그대로 재현한 것 — `dispatchEvent`, `.click()`, 실제 host 브리지 API 호출)을 **살아 있는 브라우저(Electron·pywebview 프로세스 그 자체)** 안에서 실행하고, 그 결과로 나온 DOM·상태를 확인하는 단언. `docs/current/SPEC.md` 1절 FR 행의 "사용자가 하는 것 → 정해진 결과"를 그대로, 실제 호스트 배선을 통해 재현한다 |  `scripts/phase{n}-suite.js`(및 그 결과를 실행하는 `phase{n}-electron-runner.cjs` · `src/hosts/pywebview/main.py`의 `--phase{n}-test`)가 **실제 Electron·pywebview 창 안에서** `record()`로 남기고 `[TEST_ASSERT]PASS\|FAIL\|\|\|...`로 콘솔에 실어 보내는 모든 단언 |
| **로직 수준 시뮬레이션** | 실제 키·마우스 이벤트 객체를 실제 컨트롤러 인스턴스(`TreeController` 등)에 발사하지만, **실제 브라우저·호스트 프로세스 밖**(Node의 `global.document` 목업)에서 실행한다. 컨트롤러 자신의 이벤트 처리 로직은 실제로 검증하지만, 그 로직이 진짜 DOM·CSS·메뉴 배선·호스트 이벤트 루프와 맞물려 실제로 작동하는지는 증명하지 않는다 | `scripts/verify-phase3.mjs` §4(Mock DOM Environment)가 이 방식이다. FR-H1·NFR-5가 요구하는 "사용자 행동으로 확인"의 대체물이 아니다 — 133건 판정에서는 **보조 증거**로만 쓰고, 가능한 FR은 Phase 7이 실제 호스트 버전으로 승격한다(`docs/phase7-fr-matrix.md` 참고) |
| **구현 세부 검사** | 소스 코드 문자열(grep) · 빌드 산출물 구조(파일 개수·해시) · `package.json` 설정 · 라이선스 폴더 구성 · **테스트 하네스 자체의 무결성**(단언 개수가 고정 매니페스트와 일치하는지, 두 갈래 결과 개수가 같은지)처럼 **실제 사용자 조작을 실행하지 않고** 판정하는 것 | `scripts/verify-phase{n}.mjs`가 **Node 프로세스 안에서 직접** 호출하는 `assert()` 전부. 브라우저 스위트를 실행해 받은 개별 `[PASS]`/`[FAIL]` 줄을 그대로 옮겨 출력하는 것은 여기서 제외한다(그건 위 사용자 행동 검사로 이미 분류됨) |

이 규칙은 **어느 스크립트 파일이 출력하느냐가 아니라, 그 단언이 무엇을 실행해서
나왔느냐**로 가른다. `verify-phase{n}.mjs`의 "브라우저 실행" 절 안에도 두 종류가
섞여 있다 — 브라우저 스위트가 낸 개별 결과(사용자 행동)와, 그 결과 개수가
매니페스트와 맞는지·두 갈래가 같은지를 확인하는 오케스트레이션 단언(구현 세부)이
같은 절 안에 함께 있다. 아래 표는 그 둘을 절 단위가 아니라 **성격 단위**로 가른다.

---

## 2. `npm test` 전 구간 — 절 단위 분류

### `scripts/verify-dist.mjs` (Phase 1)

| 절 | 분류 |
| --- | --- |
| 0. Environment Minimum Versions | 구현 세부 |
| 1. Build Configurations | 구현 세부 |
| 2. Build & Golden Set | 구현 세부 |
| 3. Read-Only Inspection Script Identity | 구현 세부 |
| 4. Host Smoke Tests & Collecting Attestations — 그 안에서 실제 Electron·pywebview 프로세스를 띄워 DOM/CSS 상태를 읽는 부분 | 사용자 행동(화면이 실제로 뜨는지 확인) |
| 4. 같은 절의 해시·파일목록 대조 자체 | 구현 세부 |
| 5. Cross-Host Parity | 구현 세부 (두 갈래 산출물 대조 — 오케스트레이션) |

### `scripts/verify-phase2.mjs`

| 절 | 분류 |
| --- | --- |
| 1. Zero Tab-Explorer-Templates Values in CSS | 구현 세부 |
| 2. Theme Tokens & Contrast | 구현 세부 (색 토큰 값·대비율 계산) |
| 3. Icon Resolution & Compound Extensions | 구현 세부 |
| 4. Core Menu Immutability | 구현 세부 |
| 5. License Body Completeness | 구현 세부 |
| 6. Zen Mode State Sync & Host Sizing | 구현 세부(연동 코드 존재 확인) |
| 7. AGENTS Coding Contract | 구현 세부 |

### `scripts/verify-phase3.mjs`

| 절 | 분류 |
| --- | --- |
| 1. Zero Tab-Explorer-Templates Values in CSS | 구현 세부 |
| 2. Core Purity Across `src/core/` | 구현 세부 |
| 3. Coding Contracts (한글 주석 0건 등) | 구현 세부 |
| 4·4.1~4.7.1 Functional Verification in Mock DOM Environment (트리 키보드·마우스·새로고침·인라인 입력 등) | **로직 수준 시뮬레이션** — 실제 키다운/클릭 이벤트를 발사하지만 실제 브라우저가 아닌 Node의 mock DOM 위에서 실행(round-1 A7 재분류) |

### `scripts/verify-phase4.mjs`

| 절 | 분류 |
| --- | --- |
| 1. Zero Tab-Explorer-Templates Values in CSS | 구현 세부 |
| 2. Core Purity in `src/core/editor.ts` | 구현 세부 |
| 3. English Comments | 구현 세부 |
| 4. UI Structural Invariants (FR-D8, FR-J3, FR-J6, FR-N6b) | **구현 세부** — FR 번호가 붙어 있지만 실행 방식은 소스 문자열 존재/부재 검사(grep)다. 실제 조작을 실행하지 않으므로 사용자 행동 검사가 아니다 |
| 5·6. In-Browser Runtime Verification (Electron·pywebview) — 브라우저 안에서 실제로 탭 열기/닫기/드래그/분할을 실행하는 개별 결과 | **사용자 행동** |
| 5·6의 "매니페스트와 개수 일치"·"두 갈래 divergence 0" 오케스트레이션 단언 | 구현 세부 |

### `scripts/verify-phase5.mjs`

| 절 | 분류 |
| --- | --- |
| 1. Core Purity: Zero Resource-Kind Branching | 구현 세부 |
| 2. App-Facing Surface: Zero Direct Tab/Pane Manipulation (정적 메서드 목록 검사) | 구현 세부 |
| 3. Reserved-Key Documentation | 구현 세부(문서 존재·내용 검사) |
| 4. CSS Invariants | 구현 세부 |
| 5·6. In-Browser Runtime Verification (개별 결과: 우클릭 메뉴 실제 열기, `F10`+화살표 실제 탐색, 트리 실제 선택 등) | **사용자 행동** |
| 5·6의 매니페스트/divergence 오케스트레이션 | 구현 세부 |

### `scripts/verify-phase6.mjs`

| 절 | 분류 |
| --- | --- |
| 1. App-Layer monaco Isolation | 구현 세부 |
| 2. Core Purity | 구현 세부 |
| 3. monaco Feature Flags Match D-18 | 구현 세부(생성 옵션 값 검사) |
| 4. Dependency Version Pin | 구현 세부 |
| 5. dist/ Golden Set Preserved | 구현 세부 |
| 6·6b·7. In-Browser Runtime Verification (Electron·pywebview·2회 실제 프로세스 재시작) — 개별 결과(실제 탭 닫기 버튼 클릭, 실제 종료 경로, 실제 찾기/바꾸기 치환 등) | **사용자 행동** |
| 6·6b·7의 매니페스트/divergence 오케스트레이션 | 구현 세부 |

### `scripts/verify-phase7.mjs`

| 절 | 분류 |
| --- | --- |
| 1. License Completeness & Attribution | 구현 세부 |
| 2. Zero Custom Implementation (NFR-4) | 구현 세부 |
| 3. VS Code Baseline Comparison Doc | 구현 세부(문서 존재·divergence 개수 확인) |
| 4. Checklist Doc | 구현 세부(문서 존재·내용 확인) |
| 5. 133-Item FR Matrix Completeness | 구현 세부(문서 대조 + 인용된 단언 ID가 실제로 존재하는지 소스에서 확인) |
| 6·7. In-Browser Runtime Verification (Electron·pywebview) — 개별 결과(실제 메뉴 열기·Zen·테마·아이콘 테마·트리 키보드 등) | **사용자 행동** |
| 6·7의 매니페스트/divergence 오케스트레이션 | 구현 세부 |

---

## 3. 133건과의 관계 (FR-R3 · NFR-5)

`docs/current/SPEC.md` 1절의 133건은 전부 "사용자가 하는 것 → 정해진 결과" 형태다.
이 133건 대부분의 판정은 **사용자 행동 검사에서** 나온다 — `phase{n}-suite.js`가
실제 조작을 재현해 낸 개별 결과가 그 판정이다. 구현 세부 검사(core purity·
라이선스·빌드 구조 등)는 이 133건과 무관한, **별도의** 품질 게이트다 — 133건의
어느 FR에도 "사용자가 하는 것"으로 대응하지 않으며, 코드가 어떻게 짜였는지를
보증할 뿐 사용자 결과를 보증하지 않기 때문이다.

**예외 — 판정 방법 자체가 코드 구조를 묻는 FR 소수(FR-I1, FR-P6, FR-Q3, FR-H2,
FR-M5, FR-R2, FR-R3 등)는 133건 안에 있으면서도 정의 자체가 "사용자가 하는 것 →
관찰 결과"가 아니라 "코드가 이렇게 짜였는가"다** (예: FR-Q3 "판정 방법"란이 문자
그대로 "공통 코어에 확장자→아이콘 대응표가 0건이다"). 이런 행은 그 FR 자신의
"판정 방법" 열이 요구하는 그대로 구현 세부 검사로 실제로 판정한다 — 133건
전건이 "빠짐없이 실행되어 있다"는 요구(NFR-5)를 어기지 않으며, 다만 그 판정
방식이 "사용자 행동"이 아니라 "그 FR이 원래 정의한 구조 확인"이라는 뜻이다.

`docs/phase7-fr-matrix.md`(WK-041)가 133건 각각을 어느 단언(사용자 행동 또는
위 예외의 구조 확인)이 판정하는지 짝짓는다.
