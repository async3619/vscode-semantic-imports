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
- **Issue 제목은 conventional commit 형식이 아닌, 목적을 설명하는 자연어로 작성한다**
  - 좋은 예: `import된 심볼에 대한 semantic token 제공`
  - 나쁜 예: `feat(provider): add semantic tokens for imported symbols`

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
