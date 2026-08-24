/**
 * Create the cohort coupon and a batch of codes to hand out.
 *
 *   npm run discount:setup                 report what exists
 *   npm run discount:setup -- --create     create the coupon and ten codes
 *   npm run discount:setup -- --create 25  create the coupon and twenty five codes
 *   npm run discount:setup -- --create --live   the same, against a live key
 *
 * ONE COUPON, MANY PROMOTION CODES, AND THE DIFFERENCE MATTERS. The coupon is the discount:
 * USD 200 off, repeating, three months. A promotion code is a redeemable string pointing at
 * it, and it is the object that carries max_redemptions and expires_at. Handing out one code
 * to everybody means one cap for everybody and no way to know who used what. Handing out one
 * code each means a leak costs exactly one subscription and the row in `subscriptions` says
 * which conversation it came from.
 *
 * So every code here is capped at a SINGLE redemption. DISCOUNT-CODES-BRIEF.md worries about
 * a code reaching a deals site and a hundred people taking USD 49; a per-person code with
 * max_redemptions of one makes that arithmetic impossible rather than merely bounded.
 *
 * The codes are also the reason lib/checkout.ts applies `{ promotion_code }` and never
 * `{ coupon }`. Stripe accepts either, and passing the coupon applies the coupon's limits
 * and ignores everything set here.
 *
 * Idempotent on the coupon, which is looked up by id. Codes are always new: there is no
 * sensible way to "re-create" a code somebody may already be holding.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const { stripe } = await import(join(here, '../lib/stripe.ts'));
const { DISCOUNT_OFF_CENTS, DISCOUNT_MONTHS, COUPON_NAME, COHORT_PRICE_USD } = await import(
  join(here, '../lib/discount.ts')
);

/** Stable id, so re-running finds the same coupon rather than making a second one. */
const COUPON_ID = 'local_cohort_49_3mo';

/** Ninety days. Long enough for a slow conversation, short enough that a leak expires. */
const VALID_DAYS = 90;

const args = process.argv.slice(2);
const create = args.includes('--create');
const count = Number(args.find((a) => /^\d+$/.test(a)) ?? 10);

/**
 * Live codes are real money and this script is meant to mint them, so it does not refuse a
 * live key the way checkout:check does. It refuses to do it BY ACCIDENT.
 *
 * The failure to design against is running this against whichever key happens to be in
 * .env.local, in a terminal opened yesterday, and discovering later that ten USD 49 codes
 * exist in live mode and one has been redeemed. Reading the mode out loud and requiring
 * --live to write in it costs one flag.
 */
const key = process.env.STRIPE_SECRET_KEY ?? '';
const isLive = key.startsWith('sk_live_') || key.startsWith('rk_live_');
console.log(`Stripe mode: ${isLive ? 'LIVE' : 'test'}\n`);
if (isLive && create && !args.includes('--live')) {
  console.error('That key is live. Real codes, real discounts. Add --live if you mean it.');
  process.exit(1);
}

/**
 * No I, O, 0 or 1. These get read aloud on calls and typed off a phone screen, and every
 * character a person can misread is a support email about a code that does not work.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function suffix() {
  const bytes = randomBytes(4);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

let coupon = null;
try {
  coupon = await stripe().coupons.retrieve(COUPON_ID);
} catch {
  coupon = null;
}

if (!coupon) {
  if (!create) {
    console.log(`No coupon ${COUPON_ID} yet. Re-run with --create.`);
    process.exit(0);
  }
  coupon = await stripe().coupons.create({
    id: COUPON_ID,
    name: COUPON_NAME,
    amount_off: DISCOUNT_OFF_CENTS,
    currency: 'usd',
    duration: 'repeating',
    duration_in_months: DISCOUNT_MONTHS,
  });
  console.log(`created coupon ${coupon.id}`);
} else {
  console.log(`coupon ${coupon.id} exists: ${coupon.amount_off} off, ${coupon.duration} ${coupon.duration_in_months}mo`);
}

// The same assertions lib/discount.ts makes at the moment of use. Checked here too, because
// a coupon edited in the dashboard is invisible until an invoice goes out.
const problems = [];
if (coupon.amount_off !== DISCOUNT_OFF_CENTS) problems.push(`amount_off is ${coupon.amount_off}`);
if (coupon.currency !== 'usd') problems.push(`currency is ${coupon.currency}`);
if (coupon.duration !== 'repeating') problems.push(`duration is ${coupon.duration}`);
if (coupon.duration_in_months !== DISCOUNT_MONTHS) problems.push(`runs ${coupon.duration_in_months} months`);
if (problems.length) {
  console.error(`\nThe coupon is not what this build charges: ${problems.join(', ')}.`);
  console.error('Fix it in Stripe or delete it and re-run. Refusing to mint codes against it.');
  process.exit(1);
}

const existing = await stripe().promotionCodes.list({ coupon: coupon.id, limit: 100 });
console.log(`${existing.data.length} code(s) already minted against it.`);
for (const p of existing.data) {
  const used = p.max_redemptions === null ? `${p.times_redeemed} used` : `${p.times_redeemed}/${p.max_redemptions}`;
  console.log(`  ${p.code}  ${p.active ? 'active' : 'inactive'}  ${used}`);
}

if (!create) {
  console.log('\nReport only. Add --create to mint more.');
  process.exit(0);
}

const expiresAt = Math.floor(Date.now() / 1000) + VALID_DAYS * 86_400;
const minted = [];
for (let i = 0; i < count; i++) {
  const code = `LOCAL49-${suffix()}`;
  const promo = await stripe().promotionCodes.create({
    // `promotion: { type, coupon }`, not a bare `coupon`. Changed in API version
    // 2026-07-29.dahlia, which lib/stripe.ts pins deliberately so a package bump cannot
    // move it underneath us. The old form returns "Received unknown parameter: coupon".
    promotion: { type: 'coupon', coupon: coupon.id },
    code,
    // One person, one code. A leaked code costs exactly one subscription.
    max_redemptions: 1,
    expires_at: expiresAt,
  });
  minted.push(promo.code);
}

console.log(`\n${minted.length} codes, USD ${COHORT_PRICE_USD} a month for ${DISCOUNT_MONTHS} months,`);
console.log(`one redemption each, expiring ${new Date(expiresAt * 1000).toISOString().slice(0, 10)}:\n`);
for (const c of minted) console.log(`  ${c}`);
console.log('\nThe exchange is a reduced price for feedback and permission to reference the');
console.log('results. Put that in the email that carries the code, not in the checkout.');
