import { defineConfig, globalIgnores } from 'eslint/config'
import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'
import prettierPlugin from 'eslint-plugin-prettier/recommended'

const eslintConfig = defineConfig([
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            'src/*.test.ts',
            'src/decoration/*.test.ts',
            'src/symbol/*.test.ts',
            'src/symbol/utils/*.test.ts',
            'src/symbol/resolvers/*.test.ts',
            'src/theme/*.test.ts',
            'src/typescript/plugin/*.test.ts',
            'src/typescript/server/*.test.ts',
            'src/theme/utils/*.test.ts',
            'src/utils/*.test.ts',
            'src/parser/*.test.ts',
          ],
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 25,
        },
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../*'],
              message: 'Use path alias (@/...) instead of relative parent imports.',
            },
          ],
        },
      ],
    },
  },
  prettierPlugin,
  {
    rules: {
      curly: ['error', 'all'],
    },
  },
  globalIgnores(['dist/', 'node_modules/', 'tsPlugin/index.js']),
])

export default eslintConfig
