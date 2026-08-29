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
  // THE PREFIX MUST BE ONE THIS BUILD RECOGNISES. Before 28 Aug 2026 the check only asked "is
  // this live?", so in test mode a publishable key, or a truncated one, or an empty string,
  // all passed - and then failed later at the first API call with an authentication error
  // three layers from the cause. A secret or restricted key is the only thing that belongs in
  // STRIPE_SECRET_KEY, and saying so here costs one line.
  //
  // rk_ IS DELIBERATELY INCLUDED and always was. A restricted key scoped to products and
  // prices is the right credential for a catalogue run against live: it can create the eight
  // prices and read them back, and it cannot charge anybody, refund anybody or read a
  // customer. Widening nothing was required for that - this table just now says so out loud.
  const known = /^(sk|rk)_(test|live)_/.test(key);
  if (!known) {
    throw new Error(
      'Refusing to start: STRIPE_SECRET_KEY is not a secret or restricted key (sk_/rk_, test/live).',
    );
  }

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

/**
 * THE CATALOGUE. Three products, eight prices, §5 of the pricing plan.
 *
 * THE LOOKUP KEY IS THE IDENTITY, NOT THE price_... ID. Ids differ between test and live mode
 * and between one Stripe account and the next; the lookup key does not, which is why nothing
 * in this build hardcodes an id and why the two STRIPE_PRICE_* environment variables are gone.
 * One fewer thing that can be set to the wrong mode's value in a dashboard at midnight.
 *
 * ANNUAL IS TEN TIMES MONTHLY on every line, checked at load below and again in lib/scope.ts
 * against the printed dollars. Two months free, no rounding: the arithmetic being obvious is
 * part of the offer.
 */
export const PRICE_KEYS = [
  'main_monthly',
  'main_annual',
  'premium_monthly',
  'premium_annual',
  'premium_founding_monthly',
  'premium_founding_annual',
  'location_monthly',
  'location_annual',
] as const;
export type PriceKey = (typeof PRICE_KEYS)[number];

export type Interval = 'month' | 'year';
export type TierKey = 'main' | 'premium' | 'location';

/**
 * The three products. Names and descriptions print on Checkout and on every invoice, so they
 * are copy.
 *
 * A PRODUCT DESCRIPTION MUST NEVER NAME A PRICE, and that is enforced below rather than
 * remembered. Stripe renders the amount being charged directly above the description, and one
 * product carries several prices - monthly, annual, and for premium the founding rate. A
 * description that quoted "US$249 a month" therefore appeared under "US$149.00 per month" on
 * the founding checkout, and under "US$2,490.00 per year" on the annual one.
 *
 * Observed 28 Aug 2026 on a real cs_live_ session: FIVE of the eight prices rendered a
 * description quoting a different price than the one being charged, at the moment of payment.
 * The founding buyer - the person being asked to trust this most - saw the worst version.
 *
 * The description says what the thing IS. The price is Stripe's to render.
 */
export const PRODUCTS: Record<TierKey, { name: string; description: string }> = {
  main: {
    name: 'Word of Model - Monitoring',
    description:
      'What AI assistants say about your business, measured the same way every month. Five ' +
      'questions across five AI surfaces, twenty five answers captured word for word, with the ' +
      'competitor leaderboard, the sources and three ranked actions.',
  },
  premium: {
    name: 'Word of Model - Monitoring + Review',
    description:
      'Everything in Monitoring every month, unchanged, plus a quarterly deep read by hand from ' +
      'one of our experienced marketers, adding Claude and Microsoft Copilot - the two surfaces ' +
      'no API can honestly reach.',
  },
  location: {
    name: 'Word of Model - Additional location',
    description:
      'One further location on either plan. The same five questions, asked from each town.',
  },
};

/**
 * No product copy may contain a price. Checked at module load, so it fails the BUILD rather
 * than appearing on a stranger's checkout page.
 *
 * Matches a currency amount in any of the forms this codebase has used: US$69, $69, USD 69.
 */
for (const [tier, product] of Object.entries(PRODUCTS)) {
  const copy = `${product.name} ${product.description}`;
  const found = copy.match(/(?:US)?\$\s?\d|\bUSD\s?\d/g);
  if (found) {
    throw new Error(
      `Product copy for "${tier}" names a price (${found.join(', ')}). Stripe renders the amount ` +
        'being charged directly above this text, and one product carries several prices, so any ' +
        'price written here will contradict the one on screen. Say what the product is instead.',
    );
  }
}

export interface PriceSpec {
  amount: number;
  interval: Interval;
  tier: TierKey;
  /** Founding prices are counted and capped. Nothing else is. */
  founding: boolean;
  nickname: string;
}

export const PRICES: Record<PriceKey, PriceSpec> = {
  main_monthly: { amount: 6_900, interval: 'month', tier: 'main', founding: false, nickname: 'Monitoring monthly' },
  main_annual: { amount: 69_000, interval: 'year', tier: 'main', founding: false, nickname: 'Monitoring annual' },
  premium_monthly: { amount: 24_900, interval: 'month', tier: 'premium', founding: false, nickname: 'Monitoring + Review monthly' },
  premium_annual: { amount: 249_000, interval: 'year', tier: 'premium', founding: false, nickname: 'Monitoring + Review annual' },
  premium_founding_monthly: { amount: 14_900, interval: 'month', tier: 'premium', founding: true, nickname: 'Founding monthly (20 places)' },
  premium_founding_annual: { amount: 149_000, interval: 'year', tier: 'premium', founding: true, nickname: 'Founding annual (20 places)' },
  location_monthly: { amount: 3_000, interval: 'month', tier: 'location', founding: false, nickname: 'Additional location monthly' },
  location_annual: { amount: 30_000, interval: 'year', tier: 'location', founding: false, nickname: 'Additional location annual' },
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
      `Price mismatch for ${key}: Stripe charges ${price.amount} cents, the site prints US$${printed}.`,
    );
  }
}

/** Annual is ten times monthly, in cents, on the amounts that actually reach Stripe. */
for (const key of PRICE_KEYS) {
  if (!key.endsWith('_monthly')) continue;
  const annual = PRICES[key.replace(/_monthly$/, '_annual') as PriceKey];
  if (annual.amount !== PRICES[key].amount * 10) {
    throw new Error(`Annual is not ten times monthly for ${key}.`);
  }
}

/**
 * Every line on one subscription must bill on the same interval. §5 of the pricing plan.
 *
 * A monthly base with an annual add-on produces an invoice nobody can read, and a support
 * conversation nobody can win. Throws rather than returning false: this sits between deciding
 * and charging, and a boolean that a caller can forget to check is the guard that is not the
 * last word - which this codebase has now been bitten by four times.
 *
 * NOTHING CAN TRIGGER IT TODAY, and that is stated rather than hidden: createCheckout builds a
 * single line item, so there is no second interval to disagree with. It is placed in the path
 * now so that the day a location add-on or an annual toggle reaches checkout, the rule is
 * already in front of the charge rather than remembered by whoever writes that line.
 */
export function assertOneInterval(keys: readonly PriceKey[]): void {
  const intervals = [...new Set(keys.map((k) => PRICES[k].interval))];
  if (intervals.length > 1) {
    throw new Error(
      `Refusing to charge a mixed billing period: ${keys.join(' + ')} spans ${intervals.join(' and ')}. ` +
        'Every line on one subscription must bill on the same interval.',
    );
  }
}

/**
 * A price id that exists in ONE mode and not the other.
 *
 * WHY THIS EXISTS. "The founding count returned zero" cannot distinguish a correct zero from a
 * count pointed at the wrong Stripe mode, and those two have opposite consequences: one means
 * twenty places are open, the other means the cap is blind and every visitor is handed a
 * permanent discount. That ambiguity is the whole of 28 Aug 2026 - a stale string in
 * claim_founding_seat would have returned a confident zero forever.
 *
 * So the environment is proved rather than inferred. These are the real `main_monthly` price
 * ids in each mode. A live id does not resolve against a test key and vice versa, so a
 * successful retrieval is unambiguous in a way that any count is not.
 *
 * IF A PRICE IS EVER RECREATED, UPDATE THE ID HERE. The check failing after a legitimate
 * recreation is a false alarm, and a false alarm that nobody can silence gets ignored, which
 * costs more than the check is worth. `npm run stripe:mode` prints the current one.
 */
export const MODE_SENTINEL: Record<'test' | 'live', string> = {
  test: 'price_1U9IM0C3Vj3RIMHVVKFdZTQP',
  live: 'price_1U9IzxCLkfCMEERfZCuX56Gp',
};

export interface ModeProof {
  mode: 'test' | 'live';
  sentinel: string;
  resolved: boolean;
  livemode: boolean | null;
  lookupKey: string | null;
  amount: number | null;
  detail: string;
}

/**
 * Retrieve the sentinel for the mode this process thinks it is in.
 *
 * Returns rather than throws, so a caller can alert on it without the check itself being the
 * thing that takes a page down. Nothing about this decides a charge.
 */
export async function proveStripeMode(): Promise<ModeProof> {
  const mode = env.stripeMode;
  const sentinel = MODE_SENTINEL[mode];
  try {
    const price = await stripe().prices.retrieve(sentinel);
    // `livemode` on the object is Stripe's own answer, and it must agree with the id resolving.
    const agrees = price.livemode === (mode === 'live');
    return {
      mode,
      sentinel,
      resolved: agrees,
      livemode: price.livemode,
      lookupKey: price.lookup_key ?? null,
      amount: price.unit_amount ?? null,
      detail: agrees
        ? `resolved ${sentinel} in ${mode} mode, livemode=${price.livemode}, lookup_key=${price.lookup_key}`
        : `RESOLVED BUT DISAGREES: mode is ${mode} and the price says livemode=${price.livemode}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      mode,
      sentinel,
      resolved: false,
      livemode: null,
      lookupKey: null,
      amount: null,
      detail: `could not retrieve ${sentinel} in ${mode} mode: ${message}`,
    };
  }
}

/**
 * price_... id for a lookup key, resolved from Stripe and cached for the process.
 *
 * CACHED BUT NOT TRUSTED. assertPrice re-reads the price before every Checkout Session, so a
 * cached id that has been edited in the dashboard is caught at the moment it would be charged
 * rather than at the moment it was first read.
 */
const idCache = new Map<PriceKey, string>();

export async function priceIdFor(key: PriceKey): Promise<string> {
  const hit = idCache.get(key);
  if (hit) return hit;
  const found = await stripe().prices.list({ lookup_keys: [key], active: true, limit: 1 });
  const price = found.data[0];
  if (!price) {
    throw new Error(`No active Stripe price with lookup_key "${key}". Run npm run stripe:setup -- --create.`);
  }
  idCache.set(key, price.id);
  return price.id;
}

/**
 * Fetches the price and refuses it unless it is exactly what this build thinks
 * it is charging. Called before every Checkout Session, not once at boot: an id
 * pointing at the wrong price is a configuration mistake, and configuration is
 * what changes between the moment it was checked and the moment it is used.
 */
export async function assertPrice(key: PriceKey): Promise<Stripe.Price> {
  const id = await priceIdFor(key);
  const price = await stripe().prices.retrieve(id);
  const want = PRICES[key];

  const problems: string[] = [];
  if (!price.active) problems.push('it is not active');
  if (price.currency !== 'usd') problems.push(`currency is ${price.currency}, not usd`);
  if (price.unit_amount !== want.amount) {
    problems.push(`amount is ${price.unit_amount}, not ${want.amount}`);
  }
  if (price.recurring?.interval !== want.interval || price.recurring?.interval_count !== 1) {
    problems.push(`its interval is not one ${want.interval}`);
  }
  if (price.lookup_key !== key) {
    problems.push(`its lookup_key is ${price.lookup_key ?? 'unset'}, not ${key}`);
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
