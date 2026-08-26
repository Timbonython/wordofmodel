import type { MetadataRoute } from 'next';

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
 * THE FILES THIS EXPECTS, all in app/, all pasted rather than generated here:
 *
 *   app/favicon.ico      the browser tab. This is the one production is 404ing on.
 *   app/icon.png         192x192, served at /icon.png
 *   app/icon1.png        512x512, served at /icon1.png. The numeric suffix is the convention
 *                        for a second icon; they sort lexically.
 *   app/apple-icon.png   180x180, optional, auto-linked as apple-touch-icon if present.
 *
 * THE SERVED PATHS WERE CHECKED, NOT ASSUMED, and the documentation is out of date on this.
 * `app-icons.md` in this Next version says an icon is served at `/icon?<generated>`. It is
 * not: the emitted href is `/icon.png?icon.<hash>.png`, `/icon` alone is a 404, and the bare
 * `/icon.png` returns 200 with `content-type: image/png`. Verified against 16.3.1 by putting a
 * throwaway PNG in place and fetching it. The bare paths are what this manifest references,
 * because a manifest cannot carry a build hash.
 *
 * If a future Next upgrade moves those paths the symptom is a missing icon in an install
 * prompt, not a broken page, and the check is one curl.
 *
 * Colours come from the same values the site uses: --paper, which is also the theme colour
 * already set in the layout's viewport export. Two places for one colour is how a theme colour
 * ends up disagreeing with the page it tints, so if one moves, move both.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Word of Model',
    short_name: 'Word of Model',
    description:
      'What AI assistants actually say about your business, measured the same way every month.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f7f6f2',
    theme_color: '#f7f6f2',
    icons: [
      { src: '/favicon.ico', sizes: 'any', type: 'image/x-icon' },
      { src: '/icon.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon1.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
