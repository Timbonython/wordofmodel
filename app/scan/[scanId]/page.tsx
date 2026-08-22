import type { Metadata } from 'next';
import Link from 'next/link';
import { getScan } from '@/lib/db';
import { buildGated, buildVerdict } from '@/lib/verdict';
import { ScanResult } from '@/components/scan/ScanResult';
import { env } from '@/lib/env';
import type { Capture } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your scan - Word of Model',
  robots: { index: false, follow: false },
};

/**
 * A scan result with a URL.
 *
 * WHY THIS EXISTS. The scan email used to BE the result: the whole thing, every answer, every
 * domain, pasted into a message. That made the email long enough that nobody reached the end
 * of it, and it duplicated a page that already said the same thing better. The rule the report
 * email already follows is point at the thing, do not copy it - and pointing needs somewhere
 * to point.
 *
 * It is also the forwardable artefact the free scan spec promises. A link somebody sends to
 * their marketing lead is worth more than a wall of quoted text, and it stays correct.
 *
 * noindex, because it is somebody's brand being judged by a machine. Unguessable by uuid, and
 * deliberately not behind a login: the person forwarding it should not have to explain how to
 * get in.
 */
export default async function ScanPermalink({
  params,
}: {
  params: Promise<{ scanId: string }>;
}) {
  const { scanId } = await params;
  const scan = await getScan(scanId);

  if (!scan || !scan.captures) {
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

  const brandName = scan.brand_name || scan.domain;
  const captures = scan.captures as Capture[];

  return (
    <>
      <header className="masthead">
        <div className="wrap">
          <Link href="/" className="wordmark">
            Word of Model<span>.ai</span>
          </Link>
          <div className="issue">{brandName}</div>
        </div>
      </header>

      <main className="wrap">
        <ScanResult
          scanId={scan.id}
          domain={scan.domain}
          question={scan.question ?? ''}
          free={buildVerdict(brandName, captures)}
          cached={false}
          runAt={scan.created_at}
          wizardLive={env.wizardLive}
          initialGated={buildGated(brandName, captures)}
          initialBrandName={brandName}
        />
      </main>
    </>
  );
}
