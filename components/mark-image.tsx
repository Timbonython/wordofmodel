import { ImageResponse } from 'next/og';
import { BRAND, MARK_FULL, MARK_SMALL, markRects } from '@/lib/brand';

/**
 * The mark as a bitmap, for every generated icon route.
 *
 * ONE SHAPE, ONE DEFINITION. This and components/Mark.tsx both read the geometry out of
 * lib/brand.ts, so the tab icon, the home-screen icon and the masthead cannot disagree about
 * what the mark is. The four PNGs this replaced were produced by a favicon generator and
 * dropped into app/ - a binary nobody can diff, carrying a shape nobody can regenerate, which
 * is how the site ended up with three different marks in public at once.
 *
 * ON INK, ALWAYS. An icon is composited against a tab strip, a home screen or an install
 * prompt, none of which we control, so it carries its own ground rather than inheriting one.
 */
export function markImage(size: number, opts: { inset?: number } = {}) {
  // The reduced 2+1 grid at 32px and below, per §1 of the brief. Not the full five shrunk.
  const mark = size <= 32 ? MARK_SMALL : MARK_FULL;
  const inset = opts.inset ?? 1;
  const box = size * inset;
  const offset = (size - box) / 2;
  const rects = markRects(mark, box);

  return new ImageResponse(
    (
      <div style={{ width: size, height: size, display: 'flex', position: 'relative', background: BRAND.ink }}>
        {rects.map((r, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: offset + r.x,
              top: offset + r.y,
              width: r.w,
              height: r.h,
              background: r.lit ? BRAND.green : BRAND.cellDark,
            }}
          />
        ))}
      </div>
    ),
    { width: size, height: size },
  );
}
