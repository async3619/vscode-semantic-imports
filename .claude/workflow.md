# Development Workflow

- All features and bug fixes must be tracked via **GitHub Issues** before starting work
- All code changes must go through **Pull Requests** linked to the corresponding issue
- Workflow: Create Issue → Create branch from `dev` → Implement → Open PR to `dev` → Squash Merge
- Release workflow: `dev`의 릴리즈 준비 완료 → `dev` → `main` PR 생성 → Create Merge Commit
- Branch naming: `feat/<short-description>`, `fix/<short-description>`, etc.
- Commit frequently: after each meaningful unit of work, commit on the current branch before moving to the next task

## 커밋 분할 가이드

작업의 변경 사항이 많아질 경우, 하나의 커밋에 모든 내용을 담지 않고 **리뷰하기 좋은 단위로 커밋을 분할**한다.

### 원칙

- 하나의 커밋은 **하나의 논리적 변경 단위**를 담는다
- 리뷰어가 커밋 단위로 변경 사항을 따라갈 수 있어야 한다
- 각 커밋은 단독으로 빌드/테스트가 통과하는 상태를 유지한다

### 분할 기준

- **구조 변경과 로직 변경을 분리한다**: 파일 이동, 이름 변경 등의 구조적 변경은 별도 커밋으로 먼저 수행한다
- **리팩토링과 기능 추가를 분리한다**: 기존 코드 정리 후 새 기능을 추가하는 경우, 리팩토링 커밋과 기능 추가 커밋을 나눈다
- **테스트 추가를 분리한다**: 새 테스트 코드는 해당 구현과 같은 커밋에 포함하되, 기존 코드에 대한 테스트 보강은 별도 커밋으로 분리할 수 있다
- **설정/의존성 변경을 분리한다**: `package.json`, 설정 파일 등의 변경은 별도 커밋으로 분리한다

### 예시

하나의 기능 추가 작업이 다음 단계를 포함한다면:

1. `refactor(parser): extract helper function for reuse` - 기존 코드 리팩토링
2. `feat(parser): add support for dynamic imports` - 새 기능 구현 + 테스트
3. `chore: add new dependency for dynamic import analysis` - 의존성 추가

이처럼 각 단계를 별도 커밋으로 분리하여 리뷰어가 변경 흐름을 쉽게 파악할 수 있도록 한다.

## Issue 작성 가이드

Issue는 **문제를 정의**하는 과정이다. 어떤 문제가 있는지 명확히 기술하고, 해결할 수 있는 방안들을 정리하는 곳이다.

- 제목은 conventional commit 형식이 아닌, **목적을 설명하는 자연어**로 작성한다
  - 좋은 예: `import된 심볼에 대한 semantic token 제공`
  - 나쁜 예: `feat(provider): add semantic tokens for imported symbols`
- 본문에는 다음을 포함한다:
  - **문제 정의**: 현재 상태와 기대하는 상태의 차이
  - **해결 방안**: 가능한 접근 방식들과 각각의 트레이드오프

### Severity 라벨

모든 Issue는 생성 시 반드시 **severity 라벨**을 부여해야 한다. Issue의 중요도와 긴급성을 기준으로 다음 중 하나를 선택한다:

- **`severity: low`** (🟢 녹색)
  - 코드 품질 개선, 문서화, 마이너한 리팩토링
  - 당장 처리하지 않아도 프로젝트 진행에 영향 없음
  - 예시: ESLint 규칙 추가, 코드 스타일 정리, 전역 상태 캡슐화

- **`severity: medium`** (🟡 노란색)
  - 기능 개선, 일반적인 리팩토링, 성능 최적화, CI/CD 개선
  - 중요하지만 긴급하지 않은 작업
  - 예시: 캐시 도입, 아키텍처 개선, 테스트 커버리지 확보

- **`severity: high`** (🟠 주황색)
  - 사용자 경험에 영향을 주는 버그, 핵심 기능 구현, 심각한 성능 문제
  - 빠른 시일 내 해결이 필요함
  - 예시: 외부 라이브러리 파일 에러, 번들 사이즈 비대화, semantic token 누락

- **`severity: urgent`** (🔴 빨간색)
  - 확장 기능이 작동하지 않는 치명적 버그, 보안 이슈
  - 즉시 해결이 필요함
  - 예시: 확장 로드 실패, 크래시, 데이터 손실

## PR 작성 가이드

PR은 **정의된 문제를 정해진 방법으로 해결**하는 과정이다. Issue에서 정의된 문제와 선택된 해결 방안을 바탕으로 구현 결과를 설명한다.

- 제목은 **conventional commit 형식**을 따른다 (Squash Merge 시 커밋 메시지로 사용됨)
  - 좋은 예: `feat(provider): add type-based coloring for imported symbols`
  - 나쁜 예: `Import 구문의 심볼에 타입 기반 색상 적용`
- 본문에는 다음을 포함한다:
  - **요약**: 어떤 문제를 어떤 방법으로 해결했는지
  - **변경 사항**: 주요 구현 내용
  - 대응하는 Issue 링크 (`Closes #N`)
