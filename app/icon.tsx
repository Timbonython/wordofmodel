import { markImage } from '@/components/mark-image';

/**
 * The browser tab. 32px, so the REDUCED 2+1 grid - see §1 of the brand brief and the note in
 * components/mark-image.tsx. Never the full five at this size, and never the quotation mark
 * again, which is what this replaced on 28 Aug 2026.
 */
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';
export default function Icon() {
  // INSET, and this was found by looking at it rather than by reasoning about it. Drawn flush
  // to the edge the 2+1 grid fills the whole square and stops reading as a mark at all - it
  // becomes a green corner on a dark block. The ink ground has to be visible around the cells
  // for the shape to be a shape. 0.68 is the largest inset that still leaves the cells crisp
  // on the 32px pixel grid.
  return markImage(32, { inset: 0.68 });
}
