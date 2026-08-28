import type { MetadataRoute } from 'next';
import { BRAND } from '@/lib/brand';

/**
 * The web app manifest, served at /manifest.webmanifest and linked automatically.
 *
 * THIS IS THE ONE PART OF A FAVICON SET THAT IS CODE. Everything else is placement: Next 16
 * reads `app/favicon.ico`, `app/icon.*` and `app/apple-icon.*` off disk and emits the <link>
 * tags itself, so there is nothing to wire and nothing that can be wired wrongly. Any
 * `site.webmanifest` that comes out of a favicon generator should be discarded rather than
 * dropped into the repo: it would sit at a different URL, be linked by nothing, and quietly
 * disagree with this file the first time a colour changes.
 *
 * WHAT THIS EXPECTS, all in app/, all GENERATED rather than pasted as of 28 Aug 2026:
 *
 *   app/icon.tsx         32x32,   the browser tab, reduced 2+1 grid. Served at /icon
 *   app/icon1.tsx        192x192, full 3+2 grid. Served at /icon1
 *   app/icon2.tsx        512x512, full 3+2 grid. Served at /icon2
 *   app/apple-icon.tsx   180x180, auto-linked as apple-touch-icon. Served at /apple-icon
 *   app/favicon.ico      32x32,   the ONE file still on disk, because Next cannot emit .ico.
 *                        Built by `npm run favicon` from /icon, so it is reproducible rather
 *                        than hand-made. See scripts/make-favicon.mjs.
 *
 * THE SERVED PATHS WERE CHECKED AGAIN, NOT ASSUMED, and they CHANGED when the icons went from
 * static PNGs to generated routes. With a static app/icon.png the emitted href was
 * `/icon.png?icon.<hash>.png` and bare `/icon` was a 404. With a generated app/icon.tsx it is
 * the other way round: the href is `/icon?<hash>`, bare `/icon` returns 200 image/png, and
 * `/icon.png` is a 404. Verified against 16.3.1 with curl on 28 Aug 2026:
 *
 *   /icon        200 image/png       /icon.png        404
 *   /icon1       200 image/png       /apple-icon.png  404
 *   /icon2       200 image/png       /favicon.ico     200 image/vnd.microsoft.icon
 *   /apple-icon  200 image/png
 *
 * The bare paths are what this manifest references, because a manifest cannot carry a build
 * hash. If a Next upgrade moves them the symptom is a missing icon in an install prompt, not a
 * broken page, and the check is one curl.
 *
 * If a future Next upgrade moves those paths the symptom is a missing icon in an install
 * prompt, not a broken page, and the check is one curl.
 *
 * Colours come from lib/brand.ts, which is also where the layout's viewport themeColor reads
 * from. They cannot disagree any more, because there is only one value.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Word of Model',
    short_name: 'Word of Model',
    description:
      'What AI assistants actually say about your business, measured the same way every month.',
    start_url: '/',
    display: 'standalone',
    // From lib/brand.ts, like the layout's themeColor. Two places for one colour is how a theme
    // colour ends up disagreeing with the page it tints; now there is one place and both read it.
    background_color: BRAND.paper,
    theme_color: BRAND.paper,
    icons: [
      { src: '/favicon.ico', sizes: '32x32', type: 'image/x-icon' },
      { src: '/icon1', sizes: '192x192', type: 'image/png' },
      { src: '/icon2', sizes: '512x512', type: 'image/png' },
    ],
  };
}
