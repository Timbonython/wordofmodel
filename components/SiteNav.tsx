import Link from 'next/link';
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
 * `prefetch={false}` on every link, deliberately. /start renders dynamically and writes a
 * funnel row; next/link prefetching it from the home page is what produced 1030
 * wizard_started rows against 2 scans between 25 and 27 Aug 2026. Nothing in this bar points
 * at /start today, but the bar is the thing future links get added to, and the default is the
 * dangerous direction.
 */
export function SiteNav({
  /** The page's own caption, kept from the old masthead where it was doing real work. */
  issue,
  /** Home page suppresses its own "Free scan" link - the scan is already the hero. */
  scanIsHere = false,
  sampleLive = false,
}: {
  issue?: string;
  scanIsHere?: boolean;
  /**
   * Whether /sample has a report behind it. A nav item pointing at a 404 is worse than a
   * missing one, and §3 calls this the highest-value link in the bar - it should not debut
   * as a dead end. Set SAMPLE_RUN_ID and it appears.
   */
  sampleLive?: boolean;
}) {
  return (
    <header className="sitenav">
      <div className="wrap sitenav-inner">
        <Link href="/" className="wordmark sitenav-brand" prefetch={false}>
          <Wordmark suffix=".ai" />
        </Link>

        <nav className="sitenav-links" aria-label="Main">
          <Link href="/method" prefetch={false}>
            How it works
          </Link>
          <Link href="/pricing" prefetch={false}>
            Pricing
          </Link>
          {sampleLive ? (
            <Link href="/sample" prefetch={false}>
              Sample report
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
      {issue ? (
        <div className="wrap">
          <div className="issue">{issue}</div>
        </div>
      ) : null}
    </header>
  );
}
