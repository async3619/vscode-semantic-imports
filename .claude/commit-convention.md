# Commit Message Convention

This project enforces **Conventional Commits** via `commitlint` + `husky`.

## Format

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

## Allowed Types

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

## Rules

- Type is **required** and must be lowercase
- Description is **required** and must be lowercase
- Body and footer are optional
- Breaking changes must include `BREAKING CHANGE:` in footer or `!` after type

## Examples

```
feat(provider): add semantic token provider for imports
fix(parser): handle re-export statements correctly
docs: update README with setup instructions
chore: update dependencies
```
