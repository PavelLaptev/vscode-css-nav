export interface VarMatch {
  varName: string;
  tokenStart: number;
  tokenEnd: number;
}

export function getVarNameAtPosition(
  lineText: string,
  character: number
): VarMatch | null {
  const varCallRe = /var\(\s*(--[\w-]+)[^)]*\)/g;
  let m: RegExpExecArray | null;
  while ((m = varCallRe.exec(lineText)) !== null) {
    const start = m.index;
    const end = m.index + m[0].length;
    if (character >= start && character <= end) {
      return { varName: m[1], tokenStart: start, tokenEnd: end };
    }
  }

  const bareRe = /--([\w-]+)/g;
  while ((m = bareRe.exec(lineText)) !== null) {
    const start = m.index;
    const end = m.index + m[0].length;
    if (character >= start && character <= end) {
      return { varName: m[0], tokenStart: start, tokenEnd: end };
    }
  }

  return null;
}

/**
 * Given a raw CSS value, extract all var(--foo) references it contains.
 */
export function extractVarRefs(value: string): string[] {
  const refs: string[] = [];
  const re = /var\(\s*(--[\w-]+)[^)]*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value)) !== null) {
    refs.push(m[1]);
  }
  return refs;
}
