import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

export interface CssVarDefinition {
  /** The variable name including leading dashes, e.g. --clr-btn-gray */
  name: string;
  /** The raw value as written in the source */
  rawValue: string;
  /** URI of the file where the variable is defined */
  uri: vscode.Uri;
  /** 0-based line number */
  line: number;
  /** 0-based column of the variable name start */
  column: number;
}

// Matches:  --var-name   :   <value>   ;
// Works inside both plain CSS rule blocks and :root / selector blocks.
const VAR_DEFINITION_RE = /(--[\w-]+)\s*:\s*([^;}{]+)/g;

// Matches the opening of a <style ...> block in Svelte/HTML
const STYLE_BLOCK_RE = /<style[^>]*>([\s\S]*?)<\/style>/gi;

export class CssVarIndex {
  /** Map from variable name → list of definitions (a variable may be defined in multiple files) */
  private index = new Map<string, CssVarDefinition[]>();
  private isBuilding = false;

  /** Returns all known definitions for a variable name. */
  getDefinitions(varName: string): CssVarDefinition[] {
    return this.index.get(varName) ?? [];
  }

  /** Returns every variable name in the index. */
  getAllVarNames(): string[] {
    return Array.from(this.index.keys());
  }

  /** Full rebuild from scratch. */
  async build(): Promise<void> {
    if (this.isBuilding) return;
    this.isBuilding = true;
    this.index.clear();

    try {
      const config = vscode.workspace.getConfiguration("cssVarNav");
      const includeGlobs: string[] = config.get("fileGlobs") ?? [
        "**/*.css",
        "**/*.postcss",
        "**/*.pcss",
        "**/*.svelte",
        "**/*.scss",
        "**/*.less",
        "**/*.html"
      ];
      const excludeGlobs: string[] = config.get("excludeGlobs") ?? [
        "**/node_modules/**",
        "**/dist/**",
        "**/build/**",
        "**/.git/**"
      ];
      const excludePattern = `{${excludeGlobs.join(",")}}`;

      const fileUris: vscode.Uri[] = [];
      for (const glob of includeGlobs) {
        const found = await vscode.workspace.findFiles(glob, excludePattern);
        fileUris.push(...found);
      }

      // Deduplicate by fsPath
      const seen = new Set<string>();
      for (const uri of fileUris) {
        if (seen.has(uri.fsPath)) continue;
        seen.add(uri.fsPath);
        this.indexFile(uri);
      }
    } finally {
      this.isBuilding = false;
    }
  }

  /** Index (or re-index) a single file. */
  indexFile(uri: vscode.Uri): void {
    let text: string;
    try {
      text = fs.readFileSync(uri.fsPath, "utf8");
    } catch {
      return;
    }

    const ext = path.extname(uri.fsPath).toLowerCase();
    const isSvelteOrHtml = ext === ".svelte" || ext === ".html";

    if (isSvelteOrHtml) {
      this.parseStyleBlocks(uri, text);
    } else {
      this.parseCssText(uri, text, 0);
    }
  }

  /** Remove all entries that point to a specific file (used before re-indexing). */
  removeFile(uri: vscode.Uri): void {
    for (const [name, defs] of this.index.entries()) {
      const filtered = defs.filter((d) => d.uri.fsPath !== uri.fsPath);
      if (filtered.length === 0) {
        this.index.delete(name);
      } else {
        this.index.set(name, filtered);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private parseStyleBlocks(uri: vscode.Uri, text: string): void {
    STYLE_BLOCK_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = STYLE_BLOCK_RE.exec(text)) !== null) {
      const blockStart = match.index + match[0].indexOf(match[1]);
      // Count the line offset to the start of the style block content
      const lineOffset = countLines(text, blockStart);
      this.parseCssText(uri, match[1], lineOffset);
    }
  }

  private parseCssText(
    uri: vscode.Uri,
    cssText: string,
    lineOffset: number
  ): void {
    const lines = cssText.split("\n");
    VAR_DEFINITION_RE.lastIndex = 0;

    // We scan line-by-line so we get precise positions.
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      VAR_DEFINITION_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = VAR_DEFINITION_RE.exec(line)) !== null) {
        const varName = m[1];
        const rawValue = m[2].trim();
        const column = m.index;

        const def: CssVarDefinition = {
          name: varName,
          rawValue,
          uri,
          line: lineOffset + lineIdx,
          column
        };

        const existing = this.index.get(varName) ?? [];
        // Avoid exact duplicates (same file + same line)
        if (
          !existing.some(
            (e) => e.uri.fsPath === uri.fsPath && e.line === def.line
          )
        ) {
          existing.push(def);
          this.index.set(varName, existing);
        }
      }
    }
  }
}

/** Count how many newline characters appear before position `pos` in `text`. */
function countLines(text: string, pos: number): number {
  let count = 0;
  for (let i = 0; i < pos; i++) {
    if (text[i] === "\n") count++;
  }
  return count;
}
