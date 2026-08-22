import Link from 'next/link';

/**
 * A scan that is not there, reported as not there.
 *
 * Co-located with the route and reached through notFound(), so the visitor gets this page AND
 * the response carries 404. It rendered as a 200 with friendly words in it first, which is the
 * same defect this build keeps finding in other clothes: a missing thing that does not report
 * as missing. A crawler, a monitor and a link checker all believe a 200.
 */
export default function ScanNotFound() {
  return (
    <>
      <header className="masthead">
        <div className="wrap">
          <Link href="/" className="wordmark">
            Word of Model<span>.ai</span>
          </Link>
          <div className="issue">Scan</div>
        </div>
      </header>

      <main className="wrap legal">
        <section>
          <div className="eyebrow">Scan</div>
          <h1>That scan has gone.</h1>
          <p className="lede">
            The link is wrong, or the scan was run long enough ago that we no longer hold it.
            Running another takes about a minute.
          </p>
          <p>
            <Link className="button" href="/#scan">
              Run a free scan
            </Link>
          </p>
        </section>
      </main>
    </>
  );
}
