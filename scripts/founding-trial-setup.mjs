/**
 * The founding trial coupon and its one-per-person codes.
 *
 *   npm run trial:setup                 report only
 *   npm run trial:setup -- --create     create the coupon if missing
 *   npm run trial:setup -- --mint 5     mint 5 unused promotion codes
 *
 * A COUPON, WHERE THE FOUNDING RATE IS A PRICE. §3 of the pricing plan builds the founding
 * rate as a separate price precisely because a coupon's `duration` can be set wrong and
 * silently revert it, and permanence is what that offer promises. Here reversion IS the
 * promise. The rule: a PRICE when permanence is the promise, a COUPON when reversion is.
 *
 * SCOPED TO THE MONITORING PRODUCT, which is as far as Stripe goes - `applies_to[prices]` is
 * refused outright, "Received unknown parameter". Both Monitoring prices hang off that one
 * product, so the coupon alone would also cover main_annual: three months free against a
 * US$690 commitment. The price granularity is enforced in lib/discount.ts, where the offer
 * names main_monthly and createCheckout refuses any other.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const { stripe, PRODUCTS } = await import(join(here, '../lib/stripe.ts'));
const { FOUNDING_TRIAL_COUPON_ID, FOUNDING_TRIAL_MONTHS, FOUNDING_TRIAL_NAME, OFFERS } =
  await import(join(here, '../lib/discount.ts'));

const s = stripe();
const create = process.argv.includes('--create');
const mintIdx = process.argv.indexOf('--mint');
const mint = mintIdx >= 0 ? Number(process.argv[mintIdx + 1] ?? 0) : 0;

// Ninety days: long enough to hand out, short enough that an unclaimed code does not sit live
// for a year. §3's founding window closes 30 Sep 2026 and this is a different offer, so the
// expiry is its own rather than borrowed from that date.
const EXPIRES_DAYS = 90;

const monitoring = (await s.products.search({ query: `active:'true' AND metadata['wom_tier']:'main'`, limit: 1 })).data[0];
if (!monitoring) { console.error('No Monitoring product. Run npm run stripe:setup -- --create first.'); process.exit(1); }
console.log(`  Monitoring product: ${monitoring.id}  ${JSON.stringify(monitoring.name)}`);

let coupon = null;
try { coupon = await s.coupons.retrieve(FOUNDING_TRIAL_COUPON_ID, { expand: ['applies_to'] }); } catch { /* missing */ }

if (!coupon) {
  if (!create) { console.log(`  coupon ${FOUNDING_TRIAL_COUPON_ID}: MISSING. Re-run with --create.`); process.exit(1); }
  coupon = await s.coupons.create({
    id: FOUNDING_TRIAL_COUPON_ID,
    name: FOUNDING_TRIAL_NAME,
    percent_off: 100,
    duration: 'repeating',
    duration_in_months: FOUNDING_TRIAL_MONTHS,
    applies_to: { products: [monitoring.id] },
  });
  coupon = await s.coupons.retrieve(coupon.id, { expand: ['applies_to'] });
  console.log(`  coupon created: ${coupon.id}`);
} else {
  console.log(`  coupon exists: ${coupon.id}`);
}

// Checked every run, because a coupon edited in the dashboard is invisible until an invoice.
const want = OFFERS[FOUNDING_TRIAL_COUPON_ID].expect;
const problems = [];
if (coupon.percent_off !== want.percentOff) problems.push(`percent_off ${coupon.percent_off} != ${want.percentOff}`);
if (coupon.duration !== want.duration) problems.push(`duration ${coupon.duration} != ${want.duration}`);
if (coupon.duration_in_months !== want.durationInMonths) problems.push(`months ${coupon.duration_in_months} != ${want.durationInMonths}`);
const scoped = coupon.applies_to?.products ?? [];
if (scoped.length !== 1 || scoped[0] !== monitoring.id) problems.push(`applies_to is ${JSON.stringify(scoped)}, not [${monitoring.id}]`);
console.log(`  percent_off=${coupon.percent_off} duration=${coupon.duration} ${coupon.duration_in_months}mo applies_to=${JSON.stringify(scoped)}`);
if (problems.length) { console.error('\n  COUPON IS WRONG: ' + problems.join('; ')); process.exit(1); }

if (mint > 0) {
  console.log(`\n  minting ${mint} code(s), one redemption each, expiring in ${EXPIRES_DAYS} days:`);
  const expires = Math.floor(Date.now() / 1000) + EXPIRES_DAYS * 86_400;
  for (let i = 0; i < mint; i++) {
    const code = 'TRIAL-' + randomBytes(3).toString('hex').toUpperCase();
    const pc = await s.promotionCodes.create({
      // `promotion: { type, coupon }`, not a bare `coupon`. Changed in API version
      // 2026-07-29.dahlia, which lib/stripe.ts pins deliberately. The old form returns
      // "Received unknown parameter: coupon" - which is how this script first failed.
      promotion: { type: 'coupon', coupon: coupon.id },
      code,
      // One person, one code. A leaked code costs exactly one subscription.
      max_redemptions: 1,
      expires_at: expires,
    });
    console.log(`    ${pc.code.padEnd(14)} ${pc.id}  1 use, expires ${new Date(expires*1000).toISOString().slice(0,10)}`);
  }
}
console.log('\n  done.');
