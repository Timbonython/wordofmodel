import type { Metadata } from 'next';
import Link from 'next/link';
import { isSupportedMarket } from '@/lib/geo';
import { iso2 } from '@/lib/domain';
import { getScan } from '@/lib/db';
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
  searchParams: Promise<{ scan?: string }>;
}) {
  const { scan: scanId } = await searchParams;

  let prefill: WizardProfileInput | null = null;
  let prefillEmail: string | null = null;

  if (scanId) {
    const scan = await getScan(scanId);
    if (scan) {
      prefill = {
        brand_name: scan.brand_name ?? '',
        what_they_sell: scan.what_they_sell ?? '',
        buyer: scan.buyer ?? '',
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
            Word of Model<span>.ai</span>
          </Link>
          <div className="issue">Setup</div>
        </div>
      </header>

      <main className="wrap">
        <Wizard
          prefill={prefill}
          prefillEmail={prefillEmail}
          foundingRemaining={founding?.remaining ?? null}
        />
      </main>
    </>
  );
}
