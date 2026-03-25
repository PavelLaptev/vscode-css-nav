import * as vscode from "vscode";
import { CssVarIndex } from "./cssVarIndex";
import { extractVarRefs } from "./utils";

// Matches every var(--foo) in a line, capturing the variable name
const VAR_REF_RE = /var\(\s*(--[\w-]+)[^)]*\)/g;

export class CssVarColorProvider implements vscode.DocumentColorProvider {
  constructor(private readonly index: CssVarIndex) {}

  provideDocumentColors(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.ColorInformation[] {
    const results: vscode.ColorInformation[] = [];
    const config = vscode.workspace.getConfiguration("cssVarNav");
    const maxDepth: number = config.get("maxNestingDepth") ?? 10;

    for (let lineIdx = 0; lineIdx < document.lineCount; lineIdx++) {
      const lineText = document.lineAt(lineIdx).text;
      VAR_REF_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = VAR_REF_RE.exec(lineText)) !== null) {
        const varName = m[1];
        const resolved = this.resolveValue(varName, maxDepth);
        const color = parseColor(resolved);
        if (!color) continue;

        const start = new vscode.Position(lineIdx, m.index);
        const end = new vscode.Position(lineIdx, m.index + m[0].length);
        results.push(
          new vscode.ColorInformation(new vscode.Range(start, end), color)
        );
      }
    }

    return results;
  }

  provideColorPresentations(
    color: vscode.Color,
    context: { document: vscode.TextDocument; range: vscode.Range },
    _token: vscode.CancellationToken
  ): vscode.ColorPresentation[] {
    // We don't support editing the color from the picker — just display.
    const hex = colorToHex(color);
    return [new vscode.ColorPresentation(hex)];
  }

  // ---------------------------------------------------------------------------

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
// Color parsing — converts CSS color strings to vscode.Color (0–1 channels)
// ---------------------------------------------------------------------------

function parseColor(value: string): vscode.Color | null {
  const v = value.trim();

  // #rgb  #rgba  #rrggbb  #rrggbbaa
  const hex = v.match(/^#([0-9a-fA-F]{3,8})$/);
  if (hex) return parseHex(hex[1]);

  // rgb() / rgba()
  const rgb = v.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/
  );
  if (rgb) {
    return new vscode.Color(
      Number(rgb[1]) / 255,
      Number(rgb[2]) / 255,
      Number(rgb[3]) / 255,
      rgb[4] !== undefined ? Number(rgb[4]) : 1
    );
  }

  // rgb() modern syntax: rgb(r g b / a)
  const rgbMod = v.match(
    /^rgba?\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/
  );
  if (rgbMod) {
    const a = rgbMod[4] !== undefined ? parseAlpha(rgbMod[4]) : 1;
    return new vscode.Color(
      Number(rgbMod[1]) / 255,
      Number(rgbMod[2]) / 255,
      Number(rgbMod[3]) / 255,
      a
    );
  }

  // hsl() / hsla()
  const hsl = v.match(
    /^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%(?:\s*,\s*([\d.]+))?\s*\)$/
  );
  if (hsl)
    return hslToColor(
      Number(hsl[1]),
      Number(hsl[2]),
      Number(hsl[3]),
      hsl[4] !== undefined ? Number(hsl[4]) : 1
    );

  // hsl() modern syntax: hsl(h s% l% / a)
  const hslMod = v.match(
    /^hsla?\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%(?:\s*\/\s*([\d.]+%?))?\s*\)$/
  );
  if (hslMod) {
    const a = hslMod[4] !== undefined ? parseAlpha(hslMod[4]) : 1;
    return hslToColor(
      Number(hslMod[1]),
      Number(hslMod[2]),
      Number(hslMod[3]),
      a
    );
  }

  // Named CSS color
  const named = NAMED_COLORS[v.toLowerCase()];
  if (named) return parseHex(named);

  return null;
}

function parseHex(hex: string): vscode.Color | null {
  let r: number,
    g: number,
    b: number,
    a = 1;
  if (hex.length === 3) {
    r = parseInt(hex[0] + hex[0], 16);
    g = parseInt(hex[1] + hex[1], 16);
    b = parseInt(hex[2] + hex[2], 16);
  } else if (hex.length === 4) {
    r = parseInt(hex[0] + hex[0], 16);
    g = parseInt(hex[1] + hex[1], 16);
    b = parseInt(hex[2] + hex[2], 16);
    a = parseInt(hex[3] + hex[3], 16) / 255;
  } else if (hex.length === 6) {
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
  } else if (hex.length === 8) {
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
    a = parseInt(hex.slice(6, 8), 16) / 255;
  } else {
    return null;
  }
  return new vscode.Color(r / 255, g / 255, b / 255, a);
}

function hslToColor(h: number, s: number, l: number, a: number): vscode.Color {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const ch = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - ch * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return new vscode.Color(f(0), f(8), f(4), a);
}

function parseAlpha(v: string): number {
  if (v.endsWith("%")) return Number(v.slice(0, -1)) / 100;
  return Number(v);
}

function colorToHex(c: vscode.Color): string {
  const hex = (n: number) =>
    Math.round(n * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${hex(c.red)}${hex(c.green)}${hex(c.blue)}${c.alpha < 1 ? hex(c.alpha) : ""}`;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Minimal named color map (hex without #)
const NAMED_COLORS: Record<string, string> = {
  black: "000000",
  silver: "c0c0c0",
  gray: "808080",
  grey: "808080",
  white: "ffffff",
  maroon: "800000",
  red: "ff0000",
  purple: "800080",
  fuchsia: "ff00ff",
  magenta: "ff00ff",
  green: "008000",
  lime: "00ff00",
  olive: "808000",
  yellow: "ffff00",
  navy: "000080",
  blue: "0000ff",
  teal: "008080",
  aqua: "00ffff",
  cyan: "00ffff",
  orange: "ffa500",
  aliceblue: "f0f8ff",
  antiquewhite: "faebd7",
  aquamarine: "7fffd4",
  azure: "f0ffff",
  beige: "f5f5dc",
  bisque: "ffe4c4",
  blanchedalmond: "ffebcd",
  blueviolet: "8a2be2",
  brown: "a52a2a",
  burlywood: "deb887",
  cadetblue: "5f9ea0",
  chartreuse: "7fff00",
  chocolate: "d2691e",
  coral: "ff7f50",
  cornflowerblue: "6495ed",
  cornsilk: "fff8dc",
  crimson: "dc143c",
  darkblue: "00008b",
  darkcyan: "008b8b",
  darkgoldenrod: "b8860b",
  darkgray: "a9a9a9",
  darkgrey: "a9a9a9",
  darkgreen: "006400",
  darkkhaki: "bdb76b",
  darkmagenta: "8b008b",
  darkolivegreen: "556b2f",
  darkorange: "ff8c00",
  darkorchid: "9932cc",
  darkred: "8b0000",
  darksalmon: "e9967a",
  darkseagreen: "8fbc8f",
  darkslateblue: "483d8b",
  darkslategray: "2f4f4f",
  darkslategrey: "2f4f4f",
  darkturquoise: "00ced1",
  darkviolet: "9400d3",
  deeppink: "ff1493",
  deepskyblue: "00bfff",
  dimgray: "696969",
  dimgrey: "696969",
  dodgerblue: "1e90ff",
  firebrick: "b22222",
  floralwhite: "fffaf0",
  forestgreen: "228b22",
  gainsboro: "dcdcdc",
  ghostwhite: "f8f8ff",
  gold: "ffd700",
  goldenrod: "daa520",
  greenyellow: "adff2f",
  honeydew: "f0fff0",
  hotpink: "ff69b4",
  indianred: "cd5c5c",
  indigo: "4b0082",
  ivory: "fffff0",
  khaki: "f0e68c",
  lavender: "e6e6fa",
  lavenderblush: "fff0f5",
  lawngreen: "7cfc00",
  lemonchiffon: "fffacd",
  lightblue: "add8e6",
  lightcoral: "f08080",
  lightcyan: "e0ffff",
  lightgoldenrodyellow: "fafad2",
  lightgray: "d3d3d3",
  lightgrey: "d3d3d3",
  lightgreen: "90ee90",
  lightpink: "ffb6c1",
  lightsalmon: "ffa07a",
  lightseagreen: "20b2aa",
  lightskyblue: "87cefa",
  lightslategray: "778899",
  lightslategrey: "778899",
  lightsteelblue: "b0c4de",
  lightyellow: "ffffe0",
  limegreen: "32cd32",
  linen: "faf0e6",
  mediumaquamarine: "66cdaa",
  mediumblue: "0000cd",
  mediumorchid: "ba55d3",
  mediumpurple: "9370db",
  mediumseagreen: "3cb371",
  mediumslateblue: "7b68ee",
  mediumspringgreen: "00fa9a",
  mediumturquoise: "48d1cc",
  mediumvioletred: "c71585",
  midnightblue: "191970",
  mintcream: "f5fffa",
  mistyrose: "ffe4e1",
  moccasin: "ffe4b5",
  navajowhite: "ffdead",
  oldlace: "fdf5e6",
  olivedrab: "6b8e23",
  orangered: "ff4500",
  orchid: "da70d6",
  palegoldenrod: "eee8aa",
  palegreen: "98fb98",
  paleturquoise: "afeeee",
  palevioletred: "db7093",
  papayawhip: "ffefd5",
  peachpuff: "ffdab9",
  peru: "cd853f",
  pink: "ffc0cb",
  plum: "dda0dd",
  powderblue: "b0e0e6",
  rosybrown: "bc8f8f",
  royalblue: "4169e1",
  saddlebrown: "8b4513",
  salmon: "fa8072",
  sandybrown: "f4a460",
  seagreen: "2e8b57",
  seashell: "fff5ee",
  sienna: "a0522d",
  skyblue: "87ceeb",
  slateblue: "6a5acd",
  slategray: "708090",
  slategrey: "708090",
  snow: "fffafa",
  springgreen: "00ff7f",
  steelblue: "4682b4",
  tan: "d2b48c",
  thistle: "d8bfd8",
  tomato: "ff6347",
  turquoise: "40e0d0",
  violet: "ee82ee",
  wheat: "f5deb3",
  whitesmoke: "f5f5f5",
  yellowgreen: "9acd32"
};
