'use client';

import { useState } from 'react';
import { PriceCard } from '@/components/PriceCard';
import {
  MAIN_FEATURES,
  PREMIUM_ADDITIONS,
  PRICE_USD,
  priceLabel,
  type Tier,
} from '@/lib/scope';

/**
 * The two cards, the billing toggle and the location stepper. §5 of the brand brief.
 *
 * CLIENT ONLY BECAUSE OF THE TOGGLE AND THE STEPPER. Everything else on /pricing is server
 * rendered, including the founding block - which must never be decided in a browser, because
 * the browser cannot be trusted with a cap.
 */

type Billing = 'monthly' | 'annual';

const money = (usd: number) => `US$${usd.toLocaleString('en-US')}`;

export function PricingCards({ tiers }: { tiers: readonly Tier[] }) {
  const [billing, setBilling] = useState<Billing>('monthly');
  const [locations, setLocations] = useState(0);

  const annual = billing === 'annual';
  const perLocation = annual ? PRICE_USD.location_annual : PRICE_USD.location_monthly;
  const unit = annual ? 'a year' : 'a month';

  const priceFor = (tier: Tier) =>
    annual ? PRICE_USD[tier.key.replace(/_monthly$/, '_annual') as keyof typeof PRICE_USD] : PRICE_USD[tier.key];

  return (
    <>
      {/* THE ANNUAL FIGURE IS SHOWN, NOT CALCULATED BY THE READER. §5 is explicit about that:
          "two months free" with the number next to it, because an offer the reader has to do
          arithmetic to believe is an offer they do not believe. */}
      <div className="billing-toggle" role="group" aria-label="Billing period">
        <button
          type="button"
          className={billing === 'monthly' ? 'on' : ''}
          onClick={() => setBilling('monthly')}
          aria-pressed={billing === 'monthly'}
        >
          Monthly
        </button>
        <button
          type="button"
          className={billing === 'annual' ? 'on' : ''}
          onClick={() => setBilling('annual')}
          aria-pressed={billing === 'annual'}
        >
          Annual <span className="toggle-note">two months free</span>
        </button>
      </div>

      <div className="cards">
        {tiers.map((tier) => {
          const isPremium = tier.key === 'premium_monthly';
          const annualKey = tier.key.replace(/_monthly$/, '_annual') as keyof typeof PRICE_USD;
          return (
            <PriceCard
              key={tier.key}
              name={tier.name}
              amount={money(priceFor(tier))}
              unit={unit}
              variant="card"
              featured={isPremium}
              cta={{ label: `Start ${tier.name}`, plan: tier.tier }}
              sub={
                annual
                  ? `${money(PRICE_USD[tier.key])} a month, billed yearly. Two months free.`
                  : `${money(PRICE_USD[annualKey])} a year if you pay yearly, which is two months free.`
              }
            >
              {/* EVERY SHARED LINE REPEATED, not abbreviated to "everything in Monitoring".
                  Both cards map the same MAIN_FEATURES array, so they cannot diverge. */}
              <ul className="features">
                {MAIN_FEATURES.map((f) => (
                  <li key={f}>{f}</li>
                ))}
                {isPremium
                  ? PREMIUM_ADDITIONS.map((f) => (
                      <li className="feature-added" key={f}>
                        {f}
                      </li>
                    ))
                  : null}
              </ul>
            </PriceCard>
          );
        })}
      </div>

      {/* A QUANTITY ROW, NOT A THIRD CARD. §5. A fixed "two sites" plan has no answer for a
          five-clinic group, and a five-clinic group is the best customer on the list. */}
      {/* KNOWN GAP, and the price-door check surfaced it rather than anybody remembering.
          §0's own defect, in the section §5 of the brand brief asked for: this row renders
          US$30, and the stepper below renders a live total - US$189 for five clinics - and
          NOTHING CAN BUY EITHER. createCheckout builds one line item; location quantity is
          not in the checkout at all.

          Deliberately not given a button. A CTA here would open a session that charges the
          base tier and silently drops the locations, which is a price checkout cannot honour -
          the defect this whole brief exists to remove, reintroduced one level down.

          The fix is a quantity in createCheckout, not a link. Until then the number is
          honest about the rate and dishonest about being purchasable, and that is worth
          saying out loud rather than suppressing quietly. */}
      <section className="locations">
        <h3>More than one location?</h3>
        <p>
          {/* price-door: no purchase path - see the note above */}
          {money(PRICE_USD.location_monthly)} a month for each additional location, on either
          plan. Same questions, asked from each town.
        </p>
        <div className="stepper">
          <button
            type="button"
            onClick={() => setLocations((n) => Math.max(0, n - 1))}
            aria-label="One fewer location"
            disabled={locations === 0}
          >
            &minus;
          </button>
          <span className="stepper-count">
            {locations + 1} location{locations === 0 ? '' : 's'}
          </span>
          <button type="button" onClick={() => setLocations((n) => Math.min(50, n + 1))} aria-label="One more location">
            +
          </button>
        </div>
        <table className="totals">
          <tbody>
            {tiers.map((tier) => (
              <tr key={tier.key}>
                <th scope="row">{tier.name}</th>
                <td>
                  {/* price-door: no purchase path - see the note above */}
                  {money(priceFor(tier) + locations * perLocation)} {unit}
                  {locations > 0 ? (
                    <span className="totals-working">
                      {' '}
                      {/* price-door: no purchase path - see the note above */}
                      = {money(priceFor(tier))} + {locations} &times; {money(perLocation)}
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
