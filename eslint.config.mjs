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
          ],
        },
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'warn',
    },
  },
  prettierPlugin,
  globalIgnores(['dist/', 'node_modules/']),
])

export default eslintConfig
