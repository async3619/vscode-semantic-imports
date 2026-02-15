<h1 align="center">
  <br />
  <img src="./assets/vscode-logo.png" alt="VS Code" width="48" />
  &nbsp;&nbsp;
  <img src="./assets/typescript-logo.png" alt="TypeScript" width="48" />
  <br />
  vscode-semantic-imports
  <sup>
    <br />
    <br />
  </sup>
</h1>

<div align="center">
    <a href="https://marketplace.visualstudio.com/items?itemName=async3619.vscode-semantic-imports">
        <img alt="Visual Studio Marketplace Version" src="https://img.shields.io/visual-studio-marketplace/v/async3619.vscode-semantic-imports?style=flat-square&label=marketplace" />
    </a>
    <a href="https://github.com/async3619/vscode-semantic-imports/blob/main/LICENSE">
        <img alt="License" src="https://img.shields.io/github/license/async3619/vscode-semantic-imports?style=flat-square" />
    </a>
    <a href="https://codecov.io/gh/async3619/vscode-semantic-imports">
        <img alt="Codecov" src="https://img.shields.io/codecov/c/github/async3619/vscode-semantic-imports?style=flat-square" />
    </a>
    <br />
    <sup>Accurate syntax highlighting for imported symbols in TypeScript</sup>
    <br />
    <br />
</div>

## Introduction

|             Before             |            After             |
| :----------------------------: | :--------------------------: |
| ![Before](./assets/before.png) | ![After](./assets/after.png) |

VS Code's built-in syntax highlighting treats all identifiers the same way, regardless of whether they are locally defined or imported from external modules. This extension solves this by analyzing import statements and applying precise, type-aware coloring to every usage of imported symbols throughout your file.

This means you can visually distinguish imported functions, classes, types, and variables at a glance — making your code easier to read and navigate.

## Features

- **Fast** — Resolves symbol types through a TypeScript Server plugin running inside tsserver, avoiding expensive external API calls
- **Type-aware coloring** — Imported symbols are colored based on their resolved type (function, class, interface, etc.), not just their text
- **Zero configuration** — Automatically reads your active color theme and applies matching colors to imported symbols. Supports both semantic token colors and TextMate rules, and also respects your custom color settings (`editor.semanticTokenColorCustomizations`, `editor.tokenColorCustomizations`). When you switch themes, colors update instantly — no settings to configure

## How It Works

1. **Parse** — Analyzes all import statements in the current file and extracts imported symbol names
2. **Find** — Locates every occurrence of imported symbols throughout the document
3. **Resolve** — Determines the semantic type of each symbol using a multi-strategy approach:
   - **Hover Provider** — Extracts type info from VS Code's hover tooltip
   - **Semantic Tokens** — Navigates to the symbol definition and reads its semantic token type
   - **Quick Info** — Falls back to TypeScript Server's quick info request
4. **Decorate** — Applies color-coded decorations based on the resolved symbol type

## Development

### Prerequisites

- Node.js >= 18
- pnpm

### Setup

```bash
pnpm install
```

### Scripts

| Command        | Description                         |
| -------------- | ----------------------------------- |
| `pnpm build`   | Bundle the extension for production |
| `pnpm watch`   | Watch mode with auto-rebuild        |
| `pnpm test`    | Run tests                           |
| `pnpm lint`    | Run ESLint                          |
| `pnpm format`  | Format code with Prettier           |
| `pnpm package` | Create `.vsix` package              |

### Debugging

Press `F5` in VS Code to launch the Extension Development Host with the extension loaded.

## Requirements

- VS Code `1.85.0` or later
- TypeScript language features enabled (built-in with VS Code)

## License

MIT &copy; [async3619](https://github.com/async3619)
