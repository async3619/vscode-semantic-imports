# Semantic Imports

VS Code extension that provides accurate syntax highlighting for imported symbols in TypeScript.

## Problem

VS Code's built-in syntax highlighting does not distinguish imported symbols (variables, types, classes, functions, etc.) from locally defined ones. All identifiers are highlighted the same way regardless of their origin, making it harder to understand code at a glance.

## Solution

Semantic Imports analyzes import statements and provides precise semantic tokens for every usage of imported symbols throughout the file. This enables your color theme to visually distinguish imported identifiers from local ones.

### Supported Languages

- TypeScript (`.ts`)
- TypeScript React (`.tsx`)

## Development

### Prerequisites

- Node.js >= 18
- pnpm

### Setup

```bash
pnpm install
```

### Scripts

| Command | Description |
|---------|-------------|
| `pnpm build` | Bundle the extension for production |
| `pnpm watch` | Watch mode with auto-rebuild |
| `pnpm test` | Run tests |
| `pnpm lint` | Run ESLint |
| `pnpm format` | Format code with Prettier |
| `pnpm package` | Create `.vsix` package |

### Debugging

Press `F5` in VS Code to launch the Extension Development Host with the extension loaded.

## License

MIT
