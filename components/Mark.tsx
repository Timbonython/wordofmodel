import { MARK_FULL, MARK_SMALL, markRects } from '@/lib/brand';

/**
 * The mark: five cells, top-left lit.
 *
 * WHAT IT MEANS, because that is why it won. Five cells with one lit is Recommendation Share
 * drawn as a logo - it depicts the one number this product exists to report. The quotation
 * mark it replaced on 28 Aug 2026 said "we quote things", which is true of every testimonial
 * business on earth. Decided in §1 of the brand brief.
 *
 * THE INACTIVE CELLS HAVE THEIR OWN TOKENS AND ARE NOT AN OPACITY OF THE TEXT COLOUR. §2 of
 * the brief names both: `--line` for inactive cells on paper, `--cell-dark` for inactive cells
 * on ink. Those are different hues, not one colour at two alphas, so `currentColor` at 0.22 -
 * which is what this was first written as - would have been a third value nobody declared.
 *
 * The lit cell is always the accent. Green is a scalpel: one accent per view, and inside this
 * mark that accent is exactly one cell.
 */
export function Mark({
  size = 22,
  surface = 'paper',
  className,
}: {
  /** Rendered pixel size. At 32 and below the reduced grid is drawn - see the brief. */
  size?: number;
  /** Which ground the mark is sitting on. Decides the inactive cell colour, per §2. */
  surface?: 'paper' | 'ink';
  className?: string;
}) {
  // The 2+1 grid below 32px. Not the full five shrunk: at that size five cells is four grey
  // smudges and a green one, which is the one real advantage the quote mark had.
  const mark = size <= 32 ? MARK_SMALL : MARK_FULL;
  const VIEW = 100;
  const rects = markRects(mark, VIEW);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {rects.map((r, i) => (
        <rect
          key={i}
          x={r.x}
          y={r.y}
          width={r.w}
          height={r.h}
          fill={r.lit ? 'var(--green)' : surface === 'ink' ? 'var(--cell-dark)' : 'var(--line)'}
        />
      ))}
    </svg>
  );
}

/**
 * The lockup: mark + WORD OF MODEL, per §1 of the brief.
 *
 * Plex Condensed 700, uppercase, letter-spacing .02em. The `suffix` is the small grey tail the
 * mastheads already carried - ".ai" on the inner pages, "/ free scan" on the home page - kept
 * because it is doing a real job, telling you which surface you are on.
 */
export function Wordmark({
  suffix,
  size = 22,
  surface = 'paper',
}: {
  suffix?: string;
  size?: number;
  surface?: 'paper' | 'ink';
}) {
  return (
    <span className="lockup">
      <Mark size={size} surface={surface} />
      <span className="lockup-text">
        Word of Model&trade;
        {suffix ? <span className="lockup-suffix">{suffix}</span> : null}
      </span>
    </span>
  );
}
