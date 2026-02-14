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

## Development Workflow

- All features and bug fixes must be tracked via **GitHub Issues** before starting work
- All code changes must go through **Pull Requests** linked to the corresponding issue
- Workflow: Create Issue → Create branch → Implement → Open PR → Merge
- Branch naming: `feat/<short-description>`, `fix/<short-description>`, etc.
- Commit frequently: after each meaningful unit of work, commit on the current branch before moving to the next task
- **PR 머지는 반드시 Squash Merge를 사용한다**
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
