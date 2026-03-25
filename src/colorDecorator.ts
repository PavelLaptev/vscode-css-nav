/**
 * Renders inline color swatches for CSS variable references that resolve to a
 * color — using editor decorations instead of registerColorProvider so that no
 * color-picker popup appears on hover.
 */
import * as vscode from "vscode";
import { CssVarIndex } from "./cssVarIndex";
import { extractVarRefs } from "./utils";

const VAR_REF_RE = /var\(\s*(--[\w-]+)[^)]*\)/g;

export class CssVarColorDecorator {
  private decorationType: vscode.TextEditorDecorationType;

  constructor(private readonly index: CssVarIndex) {
    this.decorationType = vscode.window.createTextEditorDecorationType({
      before: {
        contentText: " ",
        width: "0.8em",
        height: "0.8em",
        margin: "0.1em 0.2em 0 0",
        border: "1px solid rgba(128,128,128,0.35)"
      }
    });
  }

  /** Call once during activation to wire up all editor events. */
  register(context: vscode.ExtensionContext): void {
    // Decorate the active editor immediately
    if (vscode.window.activeTextEditor) {
      this.decorateEditor(vscode.window.activeTextEditor);
    }

    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) this.decorateEditor(editor);
      }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document === event.document) {
          this.decorateEditor(editor);
        }
      }),
      this.decorationType
    );
  }

  private decorateEditor(editor: vscode.TextEditor): void {
    const config = vscode.workspace.getConfiguration("cssVarNav");
    const maxDepth: number = config.get("maxNestingDepth") ?? 10;

    const decorations: vscode.DecorationOptions[] = [];
    const doc = editor.document;

    for (let lineIdx = 0; lineIdx < doc.lineCount; lineIdx++) {
      const lineText = doc.lineAt(lineIdx).text;
      VAR_REF_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = VAR_REF_RE.exec(lineText)) !== null) {
        const varName = m[1];
        const resolved = this.resolveValue(varName, maxDepth);
        const color = parseColor(resolved);
        if (!color) continue;

        const start = new vscode.Position(lineIdx, m.index);
        const end = new vscode.Position(lineIdx, m.index + m[0].length);
        decorations.push({
          range: new vscode.Range(start, end),
          renderOptions: {
            before: {
              backgroundColor: color
            }
          }
        });
      }
    }

    editor.setDecorations(this.decorationType, decorations);
  }

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
      value = value.replace(
        new RegExp(`var\\(\\s*${escapeRegex(ref)}[^)]*\\)`, "g"),
        resolved
      );
    }

    return value.trim();
  }
}

// ---------------------------------------------------------------------------
// Color parsing — returns a CSS color string suitable for backgroundColor,
// or null if the value isn't a recognizable color.
// ---------------------------------------------------------------------------

export function parseColor(value: string): string | null {
  const v = value.trim();
  if (!v) return null;

  if (/^#[0-9a-fA-F]{3,8}$/.test(v)) return v;
  if (/^rgba?\s*\(/.test(v)) return v;
  if (/^hsla?\s*\(/.test(v)) return v;
  if (/^color-mix\s*\(/.test(v)) return v;
  if (/^color\s*\(/.test(v)) return v;

  if (/^[a-zA-Z]+$/.test(v) && NAMED_COLORS.has(v.toLowerCase())) return v;

  return null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const NAMED_COLORS = new Set([
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
  "transparent"
]);
