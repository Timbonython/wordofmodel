import { markImage } from '@/components/mark-image';

/** 512px, for the manifest's install prompt. Full grid, same inset as the 192. */
export const size = { width: 512, height: 512 };
export const contentType = 'image/png';
export default function Icon512() {
  return markImage(512, { inset: 0.72 });
}
