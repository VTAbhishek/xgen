/**
 * Code 39 barcode generator — no dependencies, so the shop keeps printing
 * stickers when the internet is down.
 *
 * Code 39 encodes each character as 9 elements (5 bars, 4 gaps) where exactly
 * three are wide, hence the name. Characters are separated by a narrow gap, and
 * the whole thing is fenced by a `*` start/stop character. Readers pick the
 * symbology up without configuration, which is what makes it the safe default
 * for a hand scanner nobody has set up.
 */

// Each pattern is 9 elements, alternating bar/gap starting with a bar.
// n = narrow, w = wide.
const PATTERNS: Record<string, string> = {
  '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn',
  '4': 'nnnwwnnnw', '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw',
  '8': 'wnnwnnwnn', '9': 'nnwwnnwnn',
  A: 'wnnnnwnnw', B: 'nnwnnwnnw', C: 'wnwnnwnnn', D: 'nnnnwwnnw',
  E: 'wnnnwwnnn', F: 'nnwnwwnnn', G: 'nnnnnwwnw', H: 'wnnnnwwnn',
  I: 'nnwnnwwnn', J: 'nnnnwwwnn', K: 'wnnnnnnww', L: 'nnwnnnnww',
  M: 'wnwnnnnwn', N: 'nnnnwnnww', O: 'wnnnwnnwn', P: 'nnwnwnnwn',
  Q: 'nnnnnnwww', R: 'wnnnnnwwn', S: 'nnwnnnwwn', T: 'nnnnwnwwn',
  U: 'wwnnnnnnw', V: 'nwwnnnnnw', W: 'wwwnnnnnn', X: 'nwnnwnnnw',
  Y: 'wwnnwnnnn', Z: 'nwwnwnnnn',
  '-': 'nwnnnnwnw', '.': 'wwnnnnwnn', ' ': 'nwwnnnwnn', '$': 'nwnwnwnnn',
  '/': 'nwnwnnnwn', '+': 'nwnnnwnwn', '%': 'nnnwnwnwn', '*': 'nwnnwnwnn',
};

export interface Bar {
  /** Distance from the symbol's left edge, in narrow-module units. */
  x: number;
  /** Bar width in narrow-module units (1 = narrow, `wide` = wide). */
  w: number;
}

export interface Code39 {
  bars: Bar[];
  /** Full symbol width in narrow-module units, quiet zones excluded. */
  width: number;
}

/** Characters Code 39 cannot carry are dropped rather than mis-encoded. */
export function code39Clean(value: string): string {
  return value.toUpperCase().replace(/[^0-9A-Z\-. $/+%]/g, '');
}

/**
 * Bar geometry for `value`, measured in narrow modules so the caller picks the
 * physical scale. `wide` is the wide-to-narrow ratio — the spec allows 2:1 to
 * 3:1, and 2.5 keeps a 15-digit IMEI narrow enough for a 50mm sticker while
 * staying comfortably inside tolerance.
 */
export function code39Bars(value: string, wide = 2.5): Code39 {
  const text = `*${code39Clean(value)}*`;
  const bars: Bar[] = [];
  let x = 0;

  for (let i = 0; i < text.length; i++) {
    const pattern = PATTERNS[text[i]];
    if (!pattern) continue;

    for (let e = 0; e < pattern.length; e++) {
      const w = pattern[e] === 'w' ? wide : 1;
      if (e % 2 === 0) bars.push({ x, w }); // even elements are bars, odd are gaps
      x += w;
    }
    x += 1; // narrow inter-character gap
  }

  // The trailing inter-character gap is not part of the symbol.
  return { bars, width: Math.max(0, x - 1) };
}

/**
 * Standalone `<svg>` markup for a barcode, sized to `heightPx` with the width
 * following from the encoded length. Used for the on-screen preview; the
 * printed sticker draws its own bars into a PDF instead.
 */
export function code39SvgString(value: string, heightPx = 44, moduleAndPad = { module: 1.6, pad: 6 }): string {
  const { module, pad } = moduleAndPad;
  const { bars, width } = code39Bars(value);
  const w = width * module + pad * 2;

  const rects = bars
    .map((b) => `<rect x="${(b.x * module + pad).toFixed(2)}" y="0" width="${(b.w * module).toFixed(2)}" height="${heightPx}"/>`)
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(2)} ${heightPx}" `
    + `width="${w.toFixed(2)}" height="${heightPx}" shape-rendering="crispEdges" role="img" `
    + `aria-label="Barcode ${code39Clean(value)}"><rect width="${w.toFixed(2)}" height="${heightPx}" fill="#fff"/>`
    + `<g fill="#000">${rects}</g></svg>`;
}
