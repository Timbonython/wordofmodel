import 'server-only';
import Stripe from 'stripe';
import { env } from './env';
import { PRICE_USD, FOUNDING_SEATS_PUBLIC } from './scope';

/**
 * The Stripe client, and the guards around it.
 *
 * Two things in here exist because getting them wrong costs real money rather
 * than a stack trace:
 *
 *   assertTestMode  refuses to start against a live key while STRIPE_MODE says
 *                   test, and refuses a test key in production. A live charge
 *                   made from a laptop is not something you can take back.
 *   assertPrice     checks the currency, the amount and the interval of the
 *                   price about to be charged, every time, before a Checkout
 *                   Session is created. A price id is an opaque string and a
 *                   wrong one is invisible until an invoice goes out.
 *
 * Same shape as assertSonar in lib/env.ts, and for the same reason: the thing
 * the product cannot afford to get wrong is checked, not remembered.
 */

/**
 * Pinned rather than left to the SDK default, so upgrading the stripe package
 * cannot change API behaviour underneath the webhook handlers. This is the
 * version lib/billing.ts was written against, and it is the one where
 * current_period_end lives on the subscription item rather than the
 * subscription. Bump it deliberately, and read the changelog when you do.
 */
export const STRIPE_API_VERSION = '2026-07-29.dahlia';

let client: Stripe | null = null;

export function stripe(): Stripe {
  if (!client) {
    const key = env.stripeSecretKey;
    assertTestMode(key);
    client = new Stripe(key, {
      apiVersion: STRIPE_API_VERSION,
      appInfo: { name: 'wordofmodel', version: '1.0' },
      maxNetworkRetries: 2,
    });
  }
  return client;
}

/**
 * The key prefix is the only thing that says which mode you are in, and it is
 * one character different. Never include the key itself in the message.
 */
export function assertTestMode(key: string): void {
  const live = key.startsWith('sk_live_') || key.startsWith('rk_live_');
  if (env.stripeMode === 'test' && live) {
    throw new Error(
      'Refusing to start: STRIPE_MODE is "test" and STRIPE_SECRET_KEY is a live key.',
    );
  }
  if (env.stripeMode === 'live' && !live) {
    throw new Error(
      'Refusing to start: STRIPE_MODE is "live" and STRIPE_SECRET_KEY is a test key.',
    );
  }
}

/** The two prices, by the key the application reasons about. */
export const PRICE_KEYS = ['founding_monthly', 'standard_monthly'] as const;
export type PriceKey = (typeof PRICE_KEYS)[number];

/**
 * What each price must be. The Stripe price id changes between test and live
 * mode and the lookup key does not, so this is keyed by the lookup key and the
 * shape is asserted against whatever id the environment points at.
 *
 * USD, monthly, no trial. The founding rate is locked for twelve months by
 * virtue of being a normal recurring price: nothing expires it, and the rollover
 * is a diarised email at month eleven rather than a silent reprice.
 */
export const PRICES: Record<PriceKey, { amount: number; label: string }> = {
  founding_monthly: { amount: 14_900, label: 'Founding rate' },
  standard_monthly: { amount: 24_900, label: 'Standard' },
};

export const FOUNDING_SEATS = FOUNDING_SEATS_PUBLIC;

/**
 * The cents Stripe charges and the dollars the site prints must be the same number.
 *
 * Checked at module load rather than in a test, because a test only fails when somebody runs
 * it and this fails the build. A page saying 149 while Stripe charges 249 is a chargeback and
 * the end of the brand's credibility; it is worth three lines to make it unrepresentable.
 */
for (const [key, price] of Object.entries(PRICES)) {
  const printed = PRICE_USD[key as PriceKey];
  if (price.amount !== printed * 100) {
    throw new Error(
      `Price mismatch for ${key}: Stripe charges ${price.amount} cents, the site prints USD ${printed}.`,
    );
  }
}

/** The product name. Prints on Checkout and on every invoice, so it is copy. */
export const PRODUCT_NAME = 'Word of Model - Monthly Report';

export function priceIdFor(key: PriceKey): string {
  return key === 'founding_monthly' ? env.stripeFoundingPriceId : env.stripeStandardPriceId;
}

/**
 * Fetches the price and refuses it unless it is exactly what this build thinks
 * it is charging. Called before every Checkout Session, not once at boot: an id
 * pointing at the wrong price is a configuration mistake, and configuration is
 * what changes between the moment it was checked and the moment it is used.
 */
export async function assertPrice(key: PriceKey): Promise<Stripe.Price> {
  const id = priceIdFor(key);
  const price = await stripe().prices.retrieve(id);
  const want = PRICES[key];

  const problems: string[] = [];
  if (!price.active) problems.push('it is not active');
  if (price.currency !== 'usd') problems.push(`currency is ${price.currency}, not usd`);
  if (price.unit_amount !== want.amount) {
    problems.push(`amount is ${price.unit_amount}, not ${want.amount}`);
  }
  if (price.recurring?.interval !== 'month' || price.recurring?.interval_count !== 1) {
    problems.push('it is not a monthly recurring price');
  }
  if (price.recurring?.trial_period_days) {
    problems.push('it has a trial. The free scan is the trial');
  }

  if (problems.length) {
    throw new Error(`Refusing to charge ${key} (${id}): ${problems.join(', ')}.`);
  }
  return price;
}

/**
 * Stripe's period end moved onto the subscription item in the 2025 basil
 * release and is not on the subscription itself in this API version. Reading it
 * from the wrong place returns undefined, writes null, and takes the renewal
 * date off the confirmation screen without failing anything.
 */
export function periodEnd(sub: Stripe.Subscription): Date | null {
  const seconds = sub.items?.data?.[0]?.current_period_end;
  return seconds ? new Date(seconds * 1000) : null;
}

export function periodStart(sub: Stripe.Subscription): Date {
  const seconds = sub.items?.data?.[0]?.current_period_start ?? sub.start_date;
  return new Date(seconds * 1000);
}

/** Whichever id is present, as a string. Stripe expands these inconsistently. */
export function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}
