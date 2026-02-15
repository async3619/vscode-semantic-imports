---
name: release
description: dev → main 릴리즈 PR을 생성하고, 머지한 뒤, main → dev 백머지까지 수행하는 릴리즈 워크플로우 스킬.
disable-model-invocation: true
---

다음 단계를 순서대로 수행한다:

## 1. 사전 검증
- 현재 브랜치가 `dev`인지 확인한다. 아니면 중단하고 사용자에게 알린다.
- 워킹 트리가 clean한지 확인한다. 커밋되지 않은 변경사항이 있으면 중단하고 사용자에게 알린다.
- `git pull origin dev`로 최신 상태를 가져온다.
- `dev`에 `main` 대비 새로운 커밋이 있는지 `git log main..dev --oneline`으로 확인한다. 새 커밋이 없으면 중단한다.

## 2. 릴리즈 PR 생성
- `git log main..dev --oneline`으로 포함될 커밋 목록을 가져온다.
- GitHub MCP 도구(`create_pull_request`)로 PR을 생성한다:
  - **head**: `dev`
  - **base**: `main`
  - **title**: `Release: dev → main`
  - **body**: 포함되는 커밋 목록을 bullet point로 정리한다
- 생성된 PR 번호와 URL을 사용자에게 보여준다.

## 3. PR 머지
- 사용자에게 머지 진행 여부를 확인받는다.
- 확인되면 GitHub MCP 도구(`merge_pull_request`)로 **반드시 `merge` 방식**(Create Merge Commit)으로 머지한다. **squash나 rebase를 절대 사용하지 않는다.**

## 4. 백머지 (main → dev)
- `git fetch origin`으로 최신 상태를 가져온다.
- `git checkout dev && git pull origin dev`로 dev 브랜치를 업데이트한다.
- `git merge origin/main`으로 main을 dev에 백머지한다.
- 충돌이 발생하면 사용자에게 알리고 수동 해결을 요청한다.
- 충돌이 없으면 `git push origin dev`로 푸시한다.

## 5. 완료 보고
- 릴리즈 PR URL, 머지 결과, 백머지 결과를 요약하여 사용자에게 보고한다.
