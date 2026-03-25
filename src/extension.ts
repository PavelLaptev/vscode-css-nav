import * as vscode from "vscode";
import { CssVarIndex } from "./cssVarIndex";
import { CssVarDefinitionProvider } from "./definitionProvider";
import { CssVarHoverProvider } from "./hoverProvider";
import { CssVarColorDecorator } from "./colorDecorator";

// Languages in which the providers will be active
const DOCUMENT_SELECTORS: vscode.DocumentSelector = [
  { scheme: "file", language: "css" },
  { scheme: "file", language: "postcss" },
  { scheme: "file", language: "svelte" },
  { scheme: "file", language: "scss" },
  { scheme: "file", language: "less" },
  { scheme: "file", language: "html" },
  // Some editors register PostCSS files under this id
  { scheme: "file", pattern: "**/*.pcss" }
];

export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  const index = new CssVarIndex();

  // Build the index on activation
  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    0
  );
  statusBar.text = "$(sync~spin) CSS Vars: indexing…";
  statusBar.show();
  context.subscriptions.push(statusBar);

  await index.build();
  statusBar.text = "$(check) CSS Vars: ready";
  setTimeout(() => statusBar.hide(), 3000);

  // Register providers
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(
      DOCUMENT_SELECTORS,
      new CssVarDefinitionProvider(index)
    ),
    vscode.languages.registerHoverProvider(
      DOCUMENT_SELECTORS,
      new CssVarHoverProvider(index)
    )
  );

  // Inline color swatches via decorations (no picker popup)
  new CssVarColorDecorator(index).register(context);

  // Watch for file changes and keep the index up to date
  const watcher = vscode.workspace.createFileSystemWatcher(
    "**/*.{css,postcss,pcss,svelte,scss,less,html}"
  );

  watcher.onDidChange((uri) => {
    index.removeFile(uri);
    index.indexFile(uri);
  });

  watcher.onDidCreate((uri) => {
    index.indexFile(uri);
  });

  watcher.onDidDelete((uri) => {
    index.removeFile(uri);
  });

  context.subscriptions.push(watcher);

  // Rebuild command (accessible via Command Palette)
  context.subscriptions.push(
    vscode.commands.registerCommand("cssVarNav.rebuildIndex", async () => {
      statusBar.text = "$(sync~spin) CSS Vars: indexing…";
      statusBar.show();
      await index.build();
      statusBar.text = "$(check) CSS Vars: ready";
      setTimeout(() => statusBar.hide(), 3000);
      vscode.window.showInformationMessage("CSS variable index rebuilt.");
    })
  );
}

export function deactivate(): void {
  // Nothing to clean up beyond what the subscriptions handle
}
