import * as vscode from "vscode";
import { CssVarIndex } from "./cssVarIndex";
import { getVarNameAtPosition, extractVarRefs } from "./utils";
import * as path from "path";

export class CssVarHoverProvider implements vscode.HoverProvider {
  constructor(private readonly index: CssVarIndex) {}

  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): vscode.Hover | null {
    const lineText = document.lineAt(position.line).text;
    const match = getVarNameAtPosition(lineText, position.character);
    if (!match) return null;
    const { varName, tokenStart, tokenEnd } = match;

    const defs = this.index.getDefinitions(varName);
    if (defs.length === 0) return null;

    const config = vscode.workspace.getConfiguration("cssVarNav");
    const maxDepth: number = config.get("maxNestingDepth") ?? 10;

    const md = new vscode.MarkdownString("", true);
    md.isTrusted = true;
    md.supportHtml = true;

    // Resolve the final value once, up front
    const resolvedValue = this.resolveValue(varName, maxDepth);
    const color = tryExtractColor(resolvedValue);

    // Color preview block — rendered before the code fence so it's prominent
    if (color) {
      md.appendMarkdown(
        `<div style="` +
          `display:inline-flex;align-items:center;gap:8px;` +
          `padding:6px 10px;margin-bottom:6px;` +
          `border-radius:6px;` +
          `background:var(--vscode-editorHoverWidget-background);` +
          `border:1px solid var(--vscode-editorHoverWidget-border)` +
          `">` +
          `<span style="` +
          `display:inline-block;` +
          `width:28px;height:28px;` +
          `background:${color};` +
          `border:1px solid rgba(128,128,128,0.4);` +
          `border-radius:4px;` +
          `flex-shrink:0` +
          `"></span>` +
          `<code style="font-size:12px">${escapeHtml(resolvedValue)}</code>` +
          `</div>\n\n`
      );
    }

    md.appendMarkdown(`### \`${varName}\`\n\n`);

    for (const def of defs) {
      const relPath = this.relPath(def.uri);
      const lineNo = def.line + 1; // 1-based for display
      const fileLink = `[${relPath}:${lineNo}](${def.uri.toString()}#L${lineNo})`;

      md.appendMarkdown(`**Defined in** ${fileLink}\n\n`);
      md.appendMarkdown("```css\n");

      // Resolve the chain up to maxDepth
      const chain = this.resolveChain(varName, maxDepth);
      for (const step of chain) {
        md.appendMarkdown(`${step.name}: ${step.rawValue};\n`);
      }

      md.appendMarkdown("```\n\n");
    }

    // Provide the hover range so it covers the full var(--foo) expression
    const hoverRange = new vscode.Range(
      new vscode.Position(position.line, tokenStart),
      new vscode.Position(position.line, tokenEnd)
    );
    return new vscode.Hover(md, hoverRange);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Build the full resolution chain for a variable.
   * Returns steps from the outermost variable down to a concrete value.
   */
  private resolveChain(
    varName: string,
    maxDepth: number,
    visited = new Set<string>()
  ): Array<{ name: string; rawValue: string }> {
    if (visited.has(varName) || maxDepth <= 0) return [];
    visited.add(varName);

    const defs = this.index.getDefinitions(varName);
    if (defs.length === 0) return [];

    const def = defs[0];
    const step = { name: def.name, rawValue: def.rawValue };
    const refs = extractVarRefs(def.rawValue);

    if (refs.length === 0) {
      return [step];
    }

    const nested: Array<{ name: string; rawValue: string }> = [];
    for (const ref of refs) {
      nested.push(...this.resolveChain(ref, maxDepth - 1, new Set(visited)));
    }

    return [step, ...nested];
  }

  /**
   * Resolve a variable's value to a concrete (non-var()) string, or return
   * the raw value if it can't be fully resolved.
   */
  private resolveValue(
    varName: string,
    maxDepth: number,
    visited = new Set<string>()
  ): string {
    if (visited.has(varName) || maxDepth <= 0) return varName;
    visited.add(varName);

    const defs = this.index.getDefinitions(varName);
    if (defs.length === 0) return varName;

    let value = defs[0].rawValue;
    const refs = extractVarRefs(value);

    for (const ref of refs) {
      const resolved = this.resolveValue(ref, maxDepth - 1, new Set(visited));
      // Replace the var(--ref) occurrence with the resolved value
      value = value.replace(
        new RegExp(`var\\(\\s*${escapeRegex(ref)}[^)]*\\)`, "g"),
        resolved
      );
    }

    return value.trim();
  }

  private relPath(uri: vscode.Uri): string {
    const ws = vscode.workspace.getWorkspaceFolder(uri);
    if (ws) {
      return path.relative(ws.uri.fsPath, uri.fsPath);
    }
    return uri.fsPath;
  }
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

/** Try to extract a recognizable CSS color from a value string. */
function tryExtractColor(value: string): string | null {
  if (!value) return null;
  const v = value.trim();

  // Hex colors: #fff, #ffffff, #ffffffff
  if (/^#[0-9a-fA-F]{3,8}$/.test(v)) return v;

  // Named colors (basic set) and rgb/rgba/hsl/hsla
  if (/^(rgb|rgba|hsl|hsla)\s*\(/.test(v)) return v;

  // color-mix() — return as-is for the swatch (browser will render it)
  if (/^color-mix\s*\(/.test(v)) return v;

  // Named CSS color keyword (very basic check)
  if (/^[a-zA-Z]+$/.test(v) && isCssColorKeyword(v)) return v;

  return null;
}

const CSS_COLOR_KEYWORDS = new Set([
  "aliceblue",
  "antiquewhite",
  "aqua",
  "aquamarine",
  "azure",
  "beige",
  "bisque",
  "black",
  "blanchedalmond",
  "blue",
  "blueviolet",
  "brown",
  "burlywood",
  "cadetblue",
  "chartreuse",
  "chocolate",
  "coral",
  "cornflowerblue",
  "cornsilk",
  "crimson",
  "cyan",
  "darkblue",
  "darkcyan",
  "darkgoldenrod",
  "darkgray",
  "darkgreen",
  "darkgrey",
  "darkkhaki",
  "darkmagenta",
  "darkolivegreen",
  "darkorange",
  "darkorchid",
  "darkred",
  "darksalmon",
  "darkseagreen",
  "darkslateblue",
  "darkslategray",
  "darkslategrey",
  "darkturquoise",
  "darkviolet",
  "deeppink",
  "deepskyblue",
  "dimgray",
  "dimgrey",
  "dodgerblue",
  "firebrick",
  "floralwhite",
  "forestgreen",
  "fuchsia",
  "gainsboro",
  "ghostwhite",
  "gold",
  "goldenrod",
  "gray",
  "green",
  "greenyellow",
  "grey",
  "honeydew",
  "hotpink",
  "indianred",
  "indigo",
  "ivory",
  "khaki",
  "lavender",
  "lavenderblush",
  "lawngreen",
  "lemonchiffon",
  "lightblue",
  "lightcoral",
  "lightcyan",
  "lightgoldenrodyellow",
  "lightgray",
  "lightgreen",
  "lightgrey",
  "lightpink",
  "lightsalmon",
  "lightseagreen",
  "lightskyblue",
  "lightslategray",
  "lightslategrey",
  "lightsteelblue",
  "lightyellow",
  "lime",
  "limegreen",
  "linen",
  "magenta",
  "maroon",
  "mediumaquamarine",
  "mediumblue",
  "mediumorchid",
  "mediumpurple",
  "mediumseagreen",
  "mediumslateblue",
  "mediumspringgreen",
  "mediumturquoise",
  "mediumvioletred",
  "midnightblue",
  "mintcream",
  "mistyrose",
  "moccasin",
  "navajowhite",
  "navy",
  "oldlace",
  "olive",
  "olivedrab",
  "orange",
  "orangered",
  "orchid",
  "palegoldenrod",
  "palegreen",
  "paleturquoise",
  "palevioletred",
  "papayawhip",
  "peachpuff",
  "peru",
  "pink",
  "plum",
  "powderblue",
  "purple",
  "red",
  "rosybrown",
  "royalblue",
  "saddlebrown",
  "salmon",
  "sandybrown",
  "seagreen",
  "seashell",
  "sienna",
  "silver",
  "skyblue",
  "slateblue",
  "slategray",
  "slategrey",
  "snow",
  "springgreen",
  "steelblue",
  "tan",
  "teal",
  "thistle",
  "tomato",
  "turquoise",
  "violet",
  "wheat",
  "white",
  "whitesmoke",
  "yellow",
  "yellowgreen",
  "transparent",
  "currentcolor",
  "inherit",
  "initial",
  "unset"
]);

function isCssColorKeyword(v: string): boolean {
  return CSS_COLOR_KEYWORDS.has(v.toLowerCase());
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
