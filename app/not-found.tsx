import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';

export const metadata: Metadata = {
  title: 'Not found - Word of Model',
  robots: { index: false, follow: false },
};

/**
 * The page for an address that is not here.
 *
 * IT DID NOT EXIST, so every unmatched URL got Next's own black-on-white default: correct in its
 * status code and completely mute about what to do next. That page is the last thing a
 * particular kind of visitor sees, and they are not random - almost everybody who lands here
 * arrived from a LINK SOMEBODY SENT THEM. A scan result and a monthly report are both built to
 * be forwarded, both carry a uuid, and a uuid is exactly what an email client truncates and a
 * chat app wraps.
 *
 * So this page guesses out loud rather than apologising. The two guesses are the two links that
 * exist in the wild, in the order they exist in: far more scans have been sent than reports.
 * Naming them lets somebody recognise their own situation without knowing anything about how
 * this site is put together.
 *
 * It carries the scan CTA because a stranger who followed a forwarded link is the warmest
 * traffic this site gets - they were sent it by somebody who thought it was worth sending - and
 * sending them to the home page to find the button again loses most of them.
 *
 * noindex, because a 404 that is indexable is a 404 that turns up in search results.
 */
export default function NotFound() {
  return (
    <>
      <SiteNav sampleLive issue="Not found" />

      <main className="wrap legal">
        <section>
          <div className="eyebrow">404</div>
          <h1>That address is not here.</h1>
          <p className="lede">
            Most people who land on this page followed a link that lost some of itself on the way.
            Scan results and monthly reports both end in a long string of letters and numbers, and
            that is the part an email client is most likely to cut in half.
          </p>

          <h2>If you were sent a scan</h2>
          <p>
            The link looks like <span className="urlbit">wordofmodel.ai/scan/</span> and then a long
            code. Check the whole thing came through, including anything after a line break. If it
            did and it still does not open, the scan was run long enough ago that we no longer hold
            it. Running another one is free and takes about three minutes.
          </p>

          <h2>If you were sent a report</h2>
          <p>
            Reports live at <span className="urlbit">wordofmodel.ai/report/</span> and a code, and
            they open only for the subscriber who is signed in. If you are the subscriber, sign in
            and open the link from the email again. If somebody forwarded it to you, ask them for a
            PDF instead - it is not you, and it is not the link.
          </p>

          <h2>If you were looking for something else</h2>
          <p>
            <Link href="/pricing">What it costs</Link>, <Link href="/sample">a real report</Link>,{' '}
            <Link href="/method">how the numbers are made</Link>, or{' '}
            <Link href="/faq">the obvious questions</Link>. If none of those is it, reply to any
            email we have sent you and a person will read it.
          </p>

          <p>
            <Link className="button" href="/#scan">
              Run a free scan
            </Link>
          </p>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
