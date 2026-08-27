import type { Metadata } from 'next';
import Link from 'next/link';
import { isSupportedMarket } from '@/lib/geo';
import { iso2 } from '@/lib/domain';
import { getScan } from '@/lib/db';
import { recordFunnel, touchFrom } from '@/lib/funnel';
import { foundingDisplayOrNull } from '@/lib/billing';
import Wizard, { type WizardProfileInput } from '@/components/wizard/Wizard';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Start - Word of Model',
  description: 'Confirm your business, approve your five questions, then pay.',
  robots: { index: false, follow: false },
};

/**
 * The wizard.
 *
 * Prefilled from a free scan when there is one, and openable cold when there is
 * not. The spec is explicit that the scan is never compulsory but is always
 * offered, so the empty case starts at the same screen with an empty domain
 * field and runs the detection there.
 */
export default async function StartPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const scanId = typeof params.scan === 'string' ? params.scan : undefined;

  // Reaching /start is the step between a scan and a card, and it is the one that tells the
  // difference between a bad ad and a bad result page.
  //
  // DEDUPLICATED ONLY WHEN A SCAN ID IS PRESENT. 0014's unique index is
  // `where scan_id is not null`, so a cold open - no ?scan= - inserts a row every time, and
  // that is most of this traffic rather than an edge case. Between 25 and 27 Aug 2026 it
  // reached 1030 rows against 2 scans, because next/link prefetched /start from the home page
  // and force-dynamic turned each prefetch into a real render and a real insert. The link now
  // carries prefetch={false}; this comment no longer claims a guarantee the schema does not
  // make. Read wizard_started as page renders, not as people, unless it carries a scan id.
  await recordFunnel({
    event: 'wizard_started',
    scanId: scanId ?? null,
    // The whole set, so a step can be attributed to a creative and not just to a channel.
    // A cold open with no scan behind it has nothing to inherit, so the URL is the only
    // place this can come from.
    touch: touchFrom(params as Record<string, unknown>),
  });

  let prefill: WizardProfileInput | null = null;
  let prefillEmail: string | null = null;

  if (scanId) {
    const scan = await getScan(scanId);
    if (scan) {
      prefill = {
        brand_name: scan.brand_name ?? '',
        what_they_sell: scan.what_they_sell ?? '',
        buyer: scan.buyer ?? '',
        // Never prefilled from a scan. A town read off a website is a town nobody chose,
        // and it would arrive already written into five questions.
        locality: '',
        // scans.country is a country NAME from the detector. Map it, and fall back to the
        // default rather than prefilling a market we cannot build geo parameters for.
        market_country: (() => {
          const code = iso2(scan.country ?? null);
          return code && isSupportedMarket(code) ? code : 'US';
        })(),
        category_term: scan.category_term ?? '',
        website: scan.domain,
      };
      prefillEmail = scan.email;
    }
  }

  const founding = await foundingDisplayOrNull();

  return (
    <>
      <header className="masthead">
        <div className="wrap">
          <Link href="/" className="wordmark">
            Word of Model&trade;<span>.ai</span>
          </Link>
          <div className="issue">Setup</div>
        </div>
      </header>

      <main className="wrap">
        <Wizard
          prefill={prefill}
          prefillEmail={prefillEmail}
          foundingRemaining={founding?.remaining ?? null}
          scanId={scanId ?? null}
        />
      </main>
    </>
  );
}
