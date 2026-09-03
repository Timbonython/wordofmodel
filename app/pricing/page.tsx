import type { Metadata } from 'next';
import Link from 'next/link';
import { Nav } from '@/components/Nav';
import { SiteFooter } from '@/components/SiteFooter';
import { PricingCards } from '@/components/PricingCards';
import { PriceCard } from '@/components/PriceCard';
import { ScanPanel } from '@/components/scan/ScanPanel';
import { foundingOfferOrNull } from '@/lib/billing';
import { JsonLd } from '@/components/reviews/JsonLd';
import { productSchema } from '@/lib/schema';
import { FOUNDING_SEATS_PUBLIC, TIERS, priceLabel } from '@/lib/scope';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Pricing - Word of Model',
  description:
    'Monitoring US$69 a month, Monitoring + Review US$249. Annual is two months free. ' +
    'Additional locations US$30 each. No free tier, no contract.',
  alternates: { canonical: '/pricing' },
};

/**
 * The pricing page. §5 of the brand brief, §1 of the pricing plan.
 *
 * THE FOUNDING BLOCK IS DECIDED ON THE SERVER, AND SINCE 3 SEP 2026 IT FAILS OPEN.
 * foundingOfferOrNull() returns null on the two things that genuinely close the offer - the
 * places are gone, or 30 September has passed - and nothing renders here. When the COUNT cannot
 * be read it now returns a state with countKnown false, and this block renders with the cap, the
 * reason, and no figure.
 *
 * Why that reversed: the count failed three times in five days from clock skew inside Supabase's
 * gateway, each failure switched the offer off for every visitor on a page that looked normal,
 * and demand across that window was two free scans and zero purchases. The guard cost more than
 * the risk. It was never carrying the cap on its own either - claim_founding_seat decides the
 * charge atomically at the moment of buying. See lib/billing.ts.
 *
 * It still alerts, with different wording. This changed what happens on failure, not whether the
 * failure is visible.
 */
export default async function PricingPage() {
  const founding = await foundingOfferOrNull();
  const wizardLive = env.wizardLive;

  return (
    <>
      {/* THE PRODUCT AND ITS REAL PRICES. No rating passed: /pricing is not where reviews are
          collected or shown, and the aggregate belongs on the one page that renders it. The
          prices come from the same PRICE_USD constant the cards render, so the structured data
          cannot quote a number the page does not. */}
      <JsonLd schema={productSchema(env.siteUrl)} />
      <Nav issue="Pricing" />

      <main className="wrap">
        <section className="hero pricing-hero">
          <div className="eyebrow">Pricing</div>
          <h1>Two ways to run it</h1>
          <p className="lede">
            Both are the same measurement, taken the same way every month. The difference is
            whether a person reads it with you once a quarter. All prices in US dollars.
          </p>
        </section>

        <PricingCards tiers={TIERS} />

        {/* §2, mirrored from the homepage. One copy, beneath the row. */}
        <p className="four-steps">
          Four steps, about five minutes. Your business, your competitors, your five questions,
          then payment. <span className="four-steps-lede">You approve the questions before anything is charged.</span>
        </p>

        {founding !== null && (
          <section className="founding-block">
            <div className="eyebrow">Founding places</div>
            <PriceCard
              name={`${FOUNDING_SEATS_PUBLIC} founding places`}
              amount={priceLabel('premium_founding_monthly')}
              unit="a month"
              variant="card"
              featured
              sub="Held at that price for as long as you stay."
              cta={{ label: 'Take a founding place', plan: 'premium_founding' }}
            >
              <p>
                {/* THE REASON IS CAPACITY, NOT A PERSON - see the note on the home page. */}
                Capped because each one includes a quarterly review done by hand, and{' '}
                {FOUNDING_SEATS_PUBLIC} is the most we can do properly. Open until 30 September
                2026, or until the {FOUNDING_SEATS_PUBLIC} are taken.
              </p>
              {/* A COUNT ONLY ONCE ONE IS TAKEN, §3. "All 20 are open" volunteers that nobody
                  has bought yet; "20 founding places" is already a complete statement. */}
              {/* AND ONLY WHEN A COUNT WAS ACTUALLY READ. Since the 3 Sep 2026 reversal a failed
                  count renders this block with the cap and no figure, and its remaining sits at
                  the cap so it reads as "none taken yet" - which is right on screen and wrong to
                  print a number from. countKnown is the difference. */}
              {founding.countKnown && founding.remaining < FOUNDING_SEATS_PUBLIC ? (
                <p className="founding-count">
                  {founding.remaining === 1 ? 'One place left.' : `${founding.remaining} places left.`}
                </p>
              ) : null}
            </PriceCard>
          </section>
        )}

        {/* §5: somebody reading pricing who is not ready should be able to run the scan from
            here rather than leaving. The free scan is untouched by any of this - no card, no
            account, and nothing on this page routes it through anything Stripe-aware. */}
        <section className="pricing-scan">
          <div className="eyebrow">Not ready</div>
          <h2>See what one answer says about you first</h2>
          <p className="lede">Free, about three minutes, no account and no card.</p>
          <div id="scan">
            <ScanPanel wizardLive={wizardLive} />
          </div>
        </section>

        {/* The /method link survived the free-tier section it used to live inside. It is the
            strongest page on the site and the one that earns the price above it. */}
        <p className="pricing-method-link">
          <Link href="/method" prefetch={false}>
            How we measure, including what we have not measured
          </Link>
        </p>
      </main>

      <SiteFooter sampleLive />
    </>
  );
}
