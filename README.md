# CSS Variable Navigation

A VS Code extension that lets you navigate to CSS custom property definitions by Ctrl+Clicking (or pressing F12) on any `var(--variable-name)` reference in CSS, PostCSS, Svelte, SCSS, Less, or HTML files.

## Features

- **Go to Definition** — Ctrl+Click / F12 on a `var(--foo)` reference to jump to where `--foo` is defined, across any file in the workspace.
- **Hover preview** — Hover over a variable reference to see its value, the file it's defined in, and the full resolution chain for nested variables.
- **Color swatches** — When a variable resolves to a color (`#hex`, `rgb()`, `hsl()`, `color-mix()`, named keywords), a color swatch is shown in the hover popup.
- **Multi-file index** — Scans all `.css`, `.postcss`, `.pcss`, `.svelte`, `.scss`, `.less`, and `.html` files in the workspace on startup, and keeps the index up to date as files change.
- **Incremental updates** — File watcher re-indexes only the changed file on save.
- **Rebuild command** — Run `CSS Var Nav: Rebuild Variable Index` from the Command Palette to force a full rescan.

## Usage

1. Open any project containing CSS variables.
2. The extension activates automatically for supported file types.
3. Ctrl+Click (or F12) on `var(--my-variable)` — you'll be taken to the definition.
4. Hover over `var(--my-variable)` to see the value and resolution chain.

## Configuration

| Setting                     | Default                                                                                           | Description                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `cssVarNav.fileGlobs`       | `["**/*.css", "**/*.postcss", "**/*.pcss", "**/*.svelte", "**/*.scss", "**/*.less", "**/*.html"]` | Glob patterns of files to scan                      |
| `cssVarNav.excludeGlobs`    | `["**/node_modules/**", "**/dist/**", "**/build/**", "**/.git/**"]`                               | Glob patterns to exclude                            |
| `cssVarNav.maxNestingDepth` | `10`                                                                                              | Maximum variable nesting depth for hover resolution |

## Development

```bash
npm install
npm run compile   # one-off build
npm run watch     # watch mode
```

Press **F5** in VS Code to launch the Extension Development Host.
