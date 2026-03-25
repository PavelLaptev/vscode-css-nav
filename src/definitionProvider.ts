import * as vscode from "vscode";
import { CssVarIndex } from "./cssVarIndex";
import { getVarNameAtPosition } from "./utils";

export class CssVarDefinitionProvider implements vscode.DefinitionProvider {
  constructor(private readonly index: CssVarIndex) {}

  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): vscode.DefinitionLink[] {
    const lineText = document.lineAt(position.line).text;
    const match = getVarNameAtPosition(lineText, position.character);
    if (!match) return [];

    // originSelectionRange covers the full var(--foo) token — VS Code uses this
    // to draw a single underline across the whole expression, not word-by-word.
    const originRange = new vscode.Range(
      new vscode.Position(position.line, match.tokenStart),
      new vscode.Position(position.line, match.tokenEnd)
    );

    const defs = this.index.getDefinitions(match.varName);
    return defs.map((def) => {
      const targetRange = new vscode.Range(
        new vscode.Position(def.line, def.column),
        new vscode.Position(def.line, def.column + def.name.length)
      );
      return {
        originSelectionRange: originRange,
        targetUri: def.uri,
        targetRange,
        targetSelectionRange: targetRange
      } satisfies vscode.DefinitionLink;
    });
  }
}
