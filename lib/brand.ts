/**
 * The brand, in one place.
 *
 * WHY THIS FILE EXISTS. Before 28 Aug 2026 the palette was copied into eight files by hand:
 * app/globals.css, lib/report-css.ts, lib/report-mail.ts, lib/mail.ts, lib/billing-mail.ts,
 * app/report/[runId]/route.ts, app/manifest.ts and app/layout.tsx. Same eleven colours, typed
 * out eleven times, in two different cases. It had already drifted - see the notes on `pen`
 * below - and the drift was invisible because nothing compared the copies.
 *
 * NOT `server-only`. The layout's viewport export, the icon routes and the mark component all
 * read this, and two of those run outside a server component. Nothing here is a secret; it is
 * eleven hex strings and three font stacks.
 *
 * THE CSS CUSTOM PROPERTIES IN app/globals.css ARE THE SAME VALUES, and they have to be,
 * because a stylesheet cannot import TypeScript. That is a second copy by necessity rather
 * than by choice, so it is CHECKED rather than trusted: `npm run brandcheck` parses the
 * :root block out of globals.css and fails if a single value disagrees with this file. A
 * guarantee stated in a comment is a comment; this one is enforced by a script that runs in
 * `npm run check`.
 *
 * WHO CANNOT USE THE CSS PROPERTIES, and therefore reads this file instead:
 *
 *   the report HTML     built as a string in a serverless function, styled by REPORT_CSS
 *   every email         a stylesheet is not dependable in an inbox; hex goes inline
 *   the manifest        JSON, no cascade
 *   the icon routes     ImageResponse renders to a bitmap, no cascade
 *   the viewport meta   themeColor is a string in a metadata export
 */

/**
 * §2 of the site brand brief, 28 Aug 2026. Eight tokens, and the names are the brief's.
 *
 * GREEN IS A SCALPEL. One accent per view. A page with a green button, a green rule, a green
 * heading and a green icon has no accent, it has a second body colour.
 */
export const BRAND = {
  /** Page ground on dark surfaces, primary type on light. */
  ink: '#15171C',
  /** Page ground on light surfaces, primary type on dark. */
  paper: '#F7F6F2',
  /** The single accent. One cell, one rule, one link colour. */
  green: '#2E7D5B',
  /** Secondary type on paper. */
  soft: '#5C5F68',
  /** Secondary type on ink. */
  mute: '#A9ACB4',
  /** Tertiary: timestamps, captions. */
  faint: '#8E9199',
  /** Hairlines, and inactive cells on paper. */
  line: '#DEDCD4',
  /** Inactive cells on ink. */
  cellDark: '#3A3D45',

  // ---------------------------------------------------------------- beyond the brief's eight
  //
  // These are NOT brand accents and must not be used as any. They are the report's markup
  // device - highlighter on a competitor, red pen on an absence - which §6 of the brief keeps
  // deliberately, and the card ground the report and the site both sit panels on. Named here
  // so they are governed by the same file rather than living loose in five stylesheets.

  /** Raised panels: cards, the report's evidence blocks. */
  card: '#FFFFFF',
  /** Highlighter: a competitor was named. */
  mark: '#FFE566',
  /** Highlighter: the client was named. */
  markYou: '#9BDBFF',
  /**
   * Red pen: an annotation, or an absence.
   *
   * THIS IS THE ONE THAT HAD DRIFTED. globals.css carried a second red, `#C0392B`, reachable
   * only as the fallback of `var(--red, …)` - and `--red` was never declared, so the fallback
   * was what actually rendered on two wizard elements. Two reds four units apart, one of them
   * undeclared, is exactly the failure this file exists to stop. Consolidated onto this value
   * on 28 Aug 2026; the wizard's warning text and competitor concern shifted very slightly.
   */
  pen: '#C8332B',
} as const;

/**
 * IBM Plex, three cuts, no fourth.
 *
 * The mono is the system's signature: it is what makes the ads read as an instrument rather
 * than a brochure. On the site it is loaded by next/font in app/layout.tsx and reached through
 * `--font-mono`; these literal stacks are for the surfaces with no font loader - the report
 * string, the emails and the icon routes.
 */
export const FONT = {
  sans: `"IBM Plex Sans",system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif`,
  cond: `"IBM Plex Sans Condensed","IBM Plex Sans",system-ui,sans-serif`,
  mono: `"IBM Plex Mono",ui-monospace,Consolas,"Courier New",monospace`,
} as const;

/** Eyebrows, labels, URLs, data. Uppercase, wide. The signature, stated once. */
export const EYEBROW = {
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
} as const;

// ---------------------------------------------------------------------------------- the mark
//
// FIVE CELLS, ONE LIT. It is Recommendation Share drawn as a logo: it depicts the one number
// the whole product exists to report. That is why the 3+2 grid beat the quotation mark on
// 28 Aug 2026 - a quote mark says "we quote things", which is true of every testimonial
// business on earth.
//
// The geometry lives here as data rather than in an SVG file because three different renderers
// draw it: the React component in components/Mark.tsx, and the two icon routes, which render
// through ImageResponse and cannot read an SVG off disk. One shape, three consumers, one
// definition.

/** Cell coordinates as [column, row]. The lit cell is always [0, 0] - top left. */
export type Cell = readonly [number, number];

/**
 * The primary mark: 3 across the top, 2 below, top-left lit.
 *
 * Use at 40px and above. Below that the cells and their gaps stop being separable and it
 * turns to mush, which is the one real advantage the quote mark had and the reason MARK_SMALL
 * exists rather than a scaled-down copy of this.
 */
export const MARK_FULL = {
  columns: 3,
  rows: 2,
  cells: [
    [0, 0], [1, 0], [2, 0],
    [0, 1], [1, 1],
  ] as readonly Cell[],
  lit: [0, 0] as Cell,
} as const;

/**
 * The reduced mark: 2 across, 1 below, top-left lit. For 16-32px only.
 *
 * SAME IDEA, FEWER CELLS. Not the full five shrunk - at 16px five cells is four grey smudges
 * and a green one. Never the full five at small sizes, and never the quotation mark again.
 */
export const MARK_SMALL = {
  columns: 2,
  rows: 2,
  cells: [
    [0, 0], [1, 0],
    [0, 1],
  ] as readonly Cell[],
  lit: [0, 0] as Cell,
} as const;

/** Which mark a given pixel size should draw. The 32px boundary is the brief's. */
export function markFor(sizePx: number): typeof MARK_FULL | typeof MARK_SMALL {
  return sizePx <= 32 ? MARK_SMALL : MARK_FULL;
}

/**
 * Cell rectangles for a mark, in a square viewport of `size` units.
 *
 * The gap is a twelfth of the box and the grid is centred on its own bounding box rather than
 * on the viewport, so the 3x2 and the 2x2 both sit optically centred without a magic offset
 * per mark.
 */
export function markRects(
  mark: typeof MARK_FULL | typeof MARK_SMALL,
  size: number,
): Array<{ x: number; y: number; w: number; h: number; lit: boolean }> {
  const gap = size / 12;
  const cell = (size - gap * (Math.max(mark.columns, mark.rows) - 1)) / Math.max(mark.columns, mark.rows);
  const gridW = mark.columns * cell + (mark.columns - 1) * gap;
  const gridH = mark.rows * cell + (mark.rows - 1) * gap;
  const originX = (size - gridW) / 2;
  const originY = (size - gridH) / 2;
  return mark.cells.map(([c, r]) => ({
    x: originX + c * (cell + gap),
    y: originY + r * (cell + gap),
    w: cell,
    h: cell,
    lit: c === mark.lit[0] && r === mark.lit[1],
  }));
}

/**
 * The mark as an SVG string, for the surfaces built as HTML text rather than as React.
 *
 * The report is assembled into a string inside a serverless function and the /report notice
 * pages are template literals; neither can render components/Mark.tsx. This draws from the
 * same MARK_FULL / MARK_SMALL geometry, so there is still exactly one definition of the shape.
 *
 * LITERAL HEX, NOT var(). The report's stylesheet declares its own custom properties, but this
 * string is also used on pages that have no stylesheet at all, so it carries its own colours.
 * They come from BRAND above, so they cannot drift from the site's.
 */
export function markSvg(size: number, surface: 'paper' | 'ink' = 'paper'): string {
  const mark = markFor(size);
  const VIEW = 100;
  const inactive = surface === 'ink' ? BRAND.cellDark : BRAND.line;
  const cells = markRects(mark, VIEW)
    .map(
      (r) =>
        `<rect x="${round(r.x)}" y="${round(r.y)}" width="${round(r.w)}" height="${round(r.h)}" fill="${r.lit ? BRAND.green : inactive}"/>`,
    )
    .join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${VIEW} ${VIEW}" role="presentation" aria-hidden="true" style="display:block">${cells}</svg>`;
}

const round = (n: number): string => String(Math.round(n * 100) / 100);
