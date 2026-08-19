import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Sans_Condensed } from 'next/font/google';
import { env } from '@/lib/env';
import './globals.css';

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
const description =
  'Your buyers stopped Googling. They started asking. Find out whether AI names you when it recommends companies in your category. One question, two engines, free.';

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
  themeColor: '#F7F6F2',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${condensed.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
