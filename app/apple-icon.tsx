import { markImage } from '@/components/mark-image';

/**
 * The iOS home screen, 180px, full grid.
 *
 * Inset harder than the manifest icons because iOS applies a rounded mask and clips the
 * corners of anything flush to the edge.
 */
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';
export default function AppleIcon() {
  return markImage(180, { inset: 0.66 });
}
