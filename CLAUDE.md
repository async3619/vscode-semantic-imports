# Project Guidelines

## Commit Message Convention

This project enforces **Conventional Commits** via `commitlint` + `husky`.

### Format

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Allowed Types

- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation only
- `style` - Code style (formatting, semicolons, etc.)
- `refactor` - Code refactoring (no feature/fix)
- `perf` - Performance improvement
- `test` - Adding or updating tests
- `build` - Build system or dependencies
- `ci` - CI/CD configuration
- `chore` - Other changes (tooling, config, etc.)
- `revert` - Reverts a previous commit

### Rules

- Type is **required** and must be lowercase
- Description is **required** and must be lowercase
- Body and footer are optional
- Breaking changes must include `BREAKING CHANGE:` in footer or `!` after type

### Examples

```
feat(provider): add semantic token provider for imports
fix(parser): handle re-export statements correctly
docs: update README with setup instructions
chore: update dependencies
```

## Branch Strategy

- **`main`**: 프로덕션 릴리즈 브랜치. 항상 안정된 상태를 유지한다.
- **`dev`**: 개발 브랜치. 모든 PR의 베이스 브랜치(base branch)이다.
- 모든 기능/버그 수정 브랜치는 `dev`에서 분기하고, `dev`로 PR을 생성한다.
- `dev` → `main` 머지는 릴리즈 준비가 완료되었을 때만 수행하며, **Create Merge Commit** 방식을 사용한다.
- `dev` → `main` 머지 외의 모든 PR 머지는 **Squash Merge**를 사용한다.

## Development Workflow

- All features and bug fixes must be tracked via **GitHub Issues** before starting work
- All code changes must go through **Pull Requests** linked to the corresponding issue
- Workflow: Create Issue → Create branch from `dev` → Implement → Open PR to `dev` → Squash Merge
- Release workflow: `dev`의 릴리즈 준비 완료 → `dev` → `main` PR 생성 → Create Merge Commit
- Branch naming: `feat/<short-description>`, `fix/<short-description>`, etc.
- Commit frequently: after each meaningful unit of work, commit on the current branch before moving to the next task

### Issue 작성 가이드

Issue는 **문제를 정의**하는 과정이다. 어떤 문제가 있는지 명확히 기술하고, 해결할 수 있는 방안들을 정리하는 곳이다.

- 제목은 conventional commit 형식이 아닌, **목적을 설명하는 자연어**로 작성한다
  - 좋은 예: `import된 심볼에 대한 semantic token 제공`
  - 나쁜 예: `feat(provider): add semantic tokens for imported symbols`
- 본문에는 다음을 포함한다:
  - **문제 정의**: 현재 상태와 기대하는 상태의 차이
  - **해결 방안**: 가능한 접근 방식들과 각각의 트레이드오프

#### Severity 라벨

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

### PR 작성 가이드

PR은 **정의된 문제를 정해진 방법으로 해결**하는 과정이다. Issue에서 정의된 문제와 선택된 해결 방안을 바탕으로 구현 결과를 설명한다.

- 제목은 **conventional commit 형식**을 따른다 (Squash Merge 시 커밋 메시지로 사용됨)
  - 좋은 예: `feat(provider): add type-based coloring for imported symbols`
  - 나쁜 예: `Import 구문의 심볼에 타입 기반 색상 적용`
- 본문에는 다음을 포함한다:
  - **요약**: 어떤 문제를 어떤 방법으로 해결했는지
  - **변경 사항**: 주요 구현 내용
  - 대응하는 Issue 링크 (`Closes #N`)

## Tech Stack

- VS Code Extension API
- TypeScript 5
- esbuild (bundler)
- vitest (test framework)
- pnpm (package manager)

## Code Style

- ESLint 9 (flat config) + Prettier via `eslint-plugin-prettier`
- No semicolons
- Single quotes
- Print width: 120
- Tab width: 2
- Trailing commas: all
- if문이 한 줄이어도 반드시 중괄호(`{}`)를 사용한다 (`curly: ['error', 'all']`)
- 함수의 return type은 생략한다 (TypeScript 타입 추론에 위임). 단, body가 없는 abstract method 등은 예외
