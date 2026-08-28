import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Sans_Condensed } from 'next/font/google';
import { headers } from 'next/headers';
import { env } from '@/lib/env';
import { metaAllowedFor } from '@/lib/meta';
import { MetaPixel } from '@/components/MetaPixel';
import './globals.css';
import { BRAND } from '@/lib/brand';

// The report template's type stack, self hosted by next/font so the site and the
// report render identically without a call out to Google on every page view.
const sans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const condensed = IBM_Plex_Sans_Condensed({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-cond',
  display: 'swap',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

const title = 'Word of Model - what AI actually says about your business';
/**
 * Feeds the meta description, OpenGraph and Twitter, so it is both the search result and the
 * link preview Meta renders when it scrapes an ad URL - read by somebody who has just been
 * promised "free, about a minute, no account".
 *
 * NAMES THE OBJECT, like the hero does. "They started asking." on its own made the reader
 * supply what was being asked, and this string carried that weakness for a fortnight after
 * being written alongside the old two-line headline.
 *
 * The two-line form, not the hero's three-line drop: that drop is typography and depends on
 * line breaks a meta description does not have. Inline, "They started asking ChatGPT." is the
 * sentence the drop is built from.
 *
 * 149 characters. Google truncates around 160, and this is measured rather than eyeballed -
 * naming ChatGPT also gives the later "it" an antecedent, so the string got shorter and more
 * concrete at the same time.
 */
const description =
  'Your buyers stopped Googling. They started asking ChatGPT. Find out whether it names you when buyers ask who to use. One question, two engines, free.';

export const metadata: Metadata = {
  // Same resolution as every other absolute URL in the build, so a preview
  // deploy's canonical and OG tags point at the preview rather than at the live
  // site. See the note on env.siteUrl.
  metadataBase: new URL(env.siteUrl),
  title,
  description,
  openGraph: {
    title,
    description,
    url: '/',
    siteName: 'Word of Model',
    type: 'website',
  },
  twitter: { card: 'summary_large_image', title, description },
  robots: { index: true, follow: true },
  alternates: { canonical: '/' },
};

export const viewport: Viewport = {
  // lib/brand.ts, the same value app/manifest.ts reads. See the note there.
  themeColor: BRAND.paper,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Decided on the server, from the country Vercel puts on the request, and passed down as a
  // fact rather than a flag the browser could get wrong. No pixel id, or a visitor in the UK
  // or the EEA, and the script is never in the page at all - not loaded and disabled, absent.
  const country = (await headers()).get('x-vercel-ip-country');
  const pixel = metaAllowedFor(country) ? env.metaPixelId : null;

  return (
    <html lang="en" className={`${sans.variable} ${condensed.variable} ${mono.variable}`}>
      <body>
        {children}
        {pixel ? <MetaPixel pixelId={pixel} /> : null}
      </body>
    </html>
  );
}
