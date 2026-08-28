import { markImage } from '@/components/mark-image';

/**
 * 192px, for the web app manifest. The FULL 3+2 grid: the size rule in the brief is about
 * legibility below 32px, not about having two marks.
 *
 * The numeric suffix is Next's convention for a second icon; they sort lexically, and the
 * emitted paths are /icon1 and /icon2. Those paths were CHECKED with curl, not assumed - see
 * the note in app/manifest.ts about the documentation being wrong on this.
 */
export const size = { width: 192, height: 192 };
export const contentType = 'image/png';
export default function Icon192() {
  return markImage(192, { inset: 0.72 });
}
