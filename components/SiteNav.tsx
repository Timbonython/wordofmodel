'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Wordmark } from '@/components/Mark';

/**
 * The site bar. §3 of the brand brief, and the reference is Xero: a normal SaaS navigation,
 * because a product asking for a subscription should look like one.
 *
 *   [mark] WORD OF MODEL      How it works    Pricing    Sample report    [ Free scan ]
 *
 * WHAT THIS REPLACED, and why it is not a cosmetic change. Every page carried a hand-copied
 * `.masthead` block with a wordmark and a one-line "issue" caption, and nothing linked to
 * anything. /method - the strongest page on the site - was reachable only by accident, from
 * one inline link two thirds of the way down the home page.
 *
 * A CLIENT COMPONENT ONLY SO IT KNOWS WHERE IT IS. `usePathname` is the whole reason; every
 * prop here is a string or a boolean and nothing in it or in Wordmark is server-only, so this
 * changes no call site. The alternative was passing the current path in from twelve pages,
 * which is twelve places to forget.
 *
 * `prefetch={false}` on every link, deliberately. /start renders dynamically and writes a
 * funnel row; next/link prefetching it from the home page is what produced 1030
 * wizard_started rows against 2 scans between 25 and 27 Aug 2026. Nothing in this bar points
 * at /start today, but the bar is the thing future links get added to, and the default is the
 * dangerous direction.
 */
export function SiteNav({
  /** The page's own caption, kept from the old masthead where it was doing real work. */
  issue,
  /**
   * The home page's strapline, which is a different job from a page label and now says so.
   *
   * `issue` renders "Pricing", "About", "Account" - a word telling you where you are. The home
   * page was pushing a whole value proposition through the same slot and getting the caption
   * treatment for it: grey, 12px, the quietest type on the page, directly under a bar that had
   * just been made loud. Two jobs, one class, and the more important one was losing.
   */
  tagline,
  /** Home page suppresses its own "Free scan" link - the scan is already the hero. */
  scanIsHere = false,
  sampleLive = false,
  reviewsLive = false,
}: {
  issue?: string;
  tagline?: string;
  scanIsHere?: boolean;
  /**
   * Whether /sample has a report behind it. A nav item pointing at a 404 is worse than a
   * missing one, and §3 calls this the highest-value link in the bar - it should not debut
   * as a dead end. Set SAMPLE_RUN_ID and it appears.
   */
  sampleLive?: boolean;
  /**
   * Whether /reviews has enough approved reviews to exist. Below the threshold that route calls
   * notFound(), so the link must follow the page rather than the other way round. Decided in
   * components/Nav.tsx, never at a call site.
   */
  reviewsLive?: boolean;
}) {
  const here = usePathname();
  // Exact match. Every nav target is a leaf today, and a startsWith would light up "How it
  // works" on any future /method/* page that is not the one being pointed at.
  const at = (href: string) => (here === href ? { className: 'sitenav-here', 'aria-current': 'page' as const } : {});

  return (
    <header className="sitenav">
      <div className="wrap sitenav-inner">
        <Link href="/" className="wordmark sitenav-brand" prefetch={false}>
          <Wordmark suffix=".ai" />
        </Link>

        <nav className="sitenav-links" aria-label="Main">
          <Link href="/method" prefetch={false} {...at('/method')}>
            How it works
          </Link>
          <Link href="/pricing" prefetch={false} {...at('/pricing')}>
            Pricing
          </Link>
          {sampleLive ? (
            <Link href="/sample" prefetch={false} {...at('/sample')}>
              Sample report
            </Link>
          ) : null}
          {reviewsLive ? (
            <Link href="/reviews" prefetch={false} {...at('/reviews')}>
              Reviews
            </Link>
          ) : null}
          {scanIsHere ? (
            <a className="button button-green" href="#scan">
              Free scan
            </a>
          ) : (
            <Link className="button button-green" href="/#scan" prefetch={false}>
              Free scan
            </Link>
          )}
        </nav>
      </div>
      {tagline || issue ? (
        <div className="wrap">
          <div className={tagline ? 'sitenav-tagline' : 'issue'}>{tagline ?? issue}</div>
        </div>
      ) : null}
    </header>
  );
}
