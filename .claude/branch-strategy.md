# Branch Strategy

- **`main`**: 프로덕션 릴리즈 브랜치. 항상 안정된 상태를 유지한다.
- **`dev`**: 개발 브랜치. 모든 PR의 베이스 브랜치(base branch)이다.
- 모든 기능/버그 수정 브랜치는 `dev`에서 분기하고, `dev`로 PR을 생성한다.
- `dev` → `main` 머지는 릴리즈 준비가 완료되었을 때만 수행하며, **Create Merge Commit** 방식을 사용한다.
- `dev` → `main` 머지 외의 모든 PR 머지는 **Squash Merge**를 사용한다.
