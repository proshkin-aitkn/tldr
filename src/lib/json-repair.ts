/**
 * Attempt to repair common JSON issues produced by LLMs:
 * - Trailing commas before } or ]
 * - Unescaped double quotes inside string values
 * - Unescaped control characters (newlines, tabs) in strings
 */
export function repairJson(raw: string): string {
  // Fix trailing commas: ,] or ,}
  let s = raw.replace(/,(\s*[}\]])/g, '$1');

  try {
    JSON.parse(s);
    return s;
  } catch { /* needs deeper repair */ }

  // Fix unescaped double quotes and control chars inside string values
  const chars: string[] = [];
  let inString = false;
  let i = 0;

  while (i < s.length) {
    const ch = s[i];

    if (!inString) {
      chars.push(ch);
      if (ch === '"') inString = true;
      i++;
    } else {
      if (ch === '\\') {
        // Escaped character — keep both chars
        chars.push(ch);
        if (i + 1 < s.length) {
          chars.push(s[i + 1]);
          i += 2;
        } else {
          i++;
        }
      } else if (ch === '"') {
        if (isStringTerminator(s, i)) {
          chars.push('"');
          inString = false;
        } else {
          // Interior unescaped quote — escape it
          chars.push('\\"');
        }
        i++;
      } else if (ch === '\n') {
        chars.push('\\n');
        i++;
      } else if (ch === '\r') {
        chars.push('\\r');
        i++;
      } else if (ch === '\t') {
        chars.push('\\t');
        i++;
      } else {
        chars.push(ch);
        i++;
      }
    }
  }

  return chars.join('');
}

/**
 * Heuristic: determine whether a `"` at position `pos` (inside a string)
 * is the real string terminator or an unescaped interior quote.
 *
 * Checks the next non-whitespace character after the quote:
 * - `:`, `}`, `]` → definite terminator
 * - `,` → terminator only if what follows the comma looks like a JSON value
 *   (starts with `"`, `{`, `[`, digit/minus, or true/false/null keyword)
 * - end of input → terminator
 * - anything else → interior quote
 */
function isStringTerminator(s: string, pos: number): boolean {
  let j = pos + 1;
  while (j < s.length && ' \t\r\n'.includes(s[j])) j++;
  if (j >= s.length) return true;

  const next = s[j];

  if (next === ':' || next === '}' || next === ']') return true;

  if (next === ',') {
    // Look past comma + whitespace to see if a valid JSON value follows
    let k = j + 1;
    while (k < s.length && ' \t\r\n'.includes(s[k])) k++;
    if (k >= s.length) return true;
    return looksLikeJsonValue(s, k);
  }

  return false;
}

/** Check whether the character at position `k` starts a valid JSON value token. */
function looksLikeJsonValue(s: string, k: number): boolean {
  const ch = s[k];
  if (ch === '"' || ch === '{' || ch === '[') return true;
  if (ch === '-' || (ch >= '0' && ch <= '9')) return true;
  // Check for true / false / null keywords (must not be followed by alphanumeric)
  const rest = s.slice(k);
  for (const kw of ['true', 'false', 'null']) {
    if (rest.startsWith(kw)) {
      const end = k + kw.length;
      if (end >= s.length || !/[a-zA-Z0-9_]/.test(s[end])) return true;
    }
  }
  return false;
}

/** Find the index of the closing `}` that matches the opening `{` at `start`. */
export function findMatchingBrace(raw: string, start: number): number {
  let depth = 0;
  let inString = false;
  let i = start;

  while (i < raw.length) {
    const ch = raw[i];

    if (inString) {
      if (ch === '\\') {
        i += 2; // skip escaped char
        continue;
      }
      if (ch === '"') {
        if (isStringTerminator(raw, i)) {
          inString = false;
        }
        // else: interior unescaped quote — stay in string
      }
      i++;
    } else {
      if (ch === '"') {
        inString = true;
      } else if (ch === '{') {
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0) return i;
      }
      i++;
    }
  }

  return -1;
}

/**
 * Attempt to close truncated JSON by finishing open strings, arrays, and objects.
 * Useful when the LLM hit a token limit and the response was cut off mid-JSON.
 */
export function closeTruncatedJson(raw: string): string {
  let s = raw.trimEnd();

  // Track parser state
  let inString = false;
  const stack: string[] = []; // '{' or '['
  let i = 0;

  while (i < s.length) {
    const ch = s[i];

    if (inString) {
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === '"') {
        if (isStringTerminator(s, i)) {
          inString = false;
        }
      }
      i++;
    } else {
      if (ch === '"') {
        inString = true;
      } else if (ch === '{' || ch === '[') {
        stack.push(ch);
      } else if (ch === '}' && stack.length && stack[stack.length - 1] === '{') {
        stack.pop();
      } else if (ch === ']' && stack.length && stack[stack.length - 1] === '[') {
        stack.pop();
      }
      i++;
    }
  }

  // Nothing to close — already balanced
  if (!inString && stack.length === 0) return s;

  // Close open string
  if (inString) s += '"';

  // Clean up trailing partial key-value pairs in objects
  // e.g. , "key":  or  , "key"  (dangling key without value)
  s = s.replace(/,\s*"[^"]*"\s*:\s*$/, '');
  s = s.replace(/,\s*"[^"]*"\s*$/, '');

  // Close all open brackets/braces in reverse order
  while (stack.length) {
    const open = stack.pop()!;
    s = s.replace(/,\s*$/, ''); // remove trailing comma before closing
    s += open === '{' ? '}' : ']';
  }

  return s;
}

/** Try JSON.parse, falling back to repairJson, then truncation recovery. */
export function parseJsonSafe(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch { /* try repair */ }

  try {
    return JSON.parse(repairJson(raw));
  } catch { /* try truncation recovery */ }

  // Try closing truncated JSON (LLM hit token limit)
  try {
    return JSON.parse(repairJson(closeTruncatedJson(raw)));
  } catch {
    return null;
  }
}
