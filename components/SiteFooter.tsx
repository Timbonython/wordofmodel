import Link from 'next/link';

/**
 * §3 of the brand brief lists: How it works · Pricing · Sample report · Writing · Contact ·
 * Terms · Privacy.
 *
 * TWO OF THOSE DO NOT EXIST AND ARE NOT LINKED. There is no /writing and no /contact in this
 * repo. A footer link to a 404 is worse than a missing link, so Writing is left out until
 * there is something to point at, and Contact is the reply-to address that already receives
 * mail rather than a page that does not. Both are flagged rather than quietly invented.
 *
 */
export function SiteFooter({ sampleLive = false }: { sampleLive?: boolean }) {
  return (
    <footer className="sitefooter">
      <div className="wrap">
        <nav className="sitefooter-links" aria-label="Footer">
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
          <a href="mailto:hello@wordofmodel.ai">Contact</a>
          <Link href="/terms" prefetch={false}>
            Terms
          </Link>
          <Link href="/privacy" prefetch={false}>
            Privacy
          </Link>
        </nav>
        <p className="sitefooter-legal">
          Word of Model&trade; &mdash; what AI assistants actually say about your business,
          measured the same way every month.
        </p>
      </div>
    </footer>
  );
}
