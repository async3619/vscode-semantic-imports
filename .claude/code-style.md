# Code Style

- ESLint 9 (flat config) + Prettier via `eslint-plugin-prettier`
- No semicolons
- Single quotes
- Print width: 120
- Tab width: 2
- Trailing commas: all
- if문이 한 줄이어도 반드시 중괄호(`{}`)를 사용한다 (`curly: ['error', 'all']`)
- 함수의 return type은 생략한다 (TypeScript 타입 추론에 위임). 단, body가 없는 abstract method 등은 예외
