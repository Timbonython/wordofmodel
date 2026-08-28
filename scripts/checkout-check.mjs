/**
 * Does the price on the page equal the price Stripe would charge?
 *
 *   npm run checkout:check
 *
 * Two halves, because there are two ways for them to disagree.
 *
 * STATIC. Every amount the site prints comes from PRICE_USD in lib/scope.ts, and every amount
 * Stripe charges comes from PRICES in lib/stripe.ts. Those are compared against each other at
 * module load, so this half is really a check that the assertion is still wired up.
 *
 * LIVE. The constant is only half the story: the price ID in the environment could point at a
 * Stripe price with a different amount, and nothing on the page would know. So this creates a
 * real Checkout Session through the real createCheckout(), reads back the line item Stripe
 * actually attached, and compares it to what the page would have printed. That is the number a
 * customer sees on Stripe's page next to their card details.
 *
 * Runs in TEST MODE ONLY. It refuses a live key: creating sessions against live to check a
 * number is not worth the chance of one being paid.
 *
 * DISCOUNTED. Added 24 Aug 2026 with the local cohort, and DISCOUNT-CODES-BRIEF.md is wrong
 * about this half. It says the parity assertion "compares the displayed price to the line
 * item, so it still holds". It did not: the assertion compared PRICE_USD, a hardcoded
 * catalogue constant, to the line item, and a line item's amount_total is net of discounts.
 * The moment a coupon is applied the check fails, and the pressure is then to loosen the
 * assertion, which is how a guard dies. So the guard learns about codes instead: it computes
 * the number the wizard would have printed for this code and compares THAT to what Stripe
 * will charge.
 *
 * Cleans up: expires both sessions, releases the claim, deletes the throwaway promotion code,
 * the account and the scope.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const { db } = await import(join(here, '../lib/db.ts'));
const { PRICES, priceIdFor, stripe } = await import(join(here, '../lib/stripe.ts'));
const { PRICE_USD } = await import(join(here, '../lib/scope.ts'));
const { createCheckout } = await import(join(here, '../lib/checkout.ts'));
const { validateDiscount, DISCOUNT_OFF_CENTS, DISCOUNT_MONTHS } = await import(
  join(here, '../lib/discount.ts'),
);

if ((process.env.STRIPE_SECRET_KEY ?? '').startsWith('sk_live_')) {
  console.error('Refusing to run against a live key. Switch .env.local back to test.');
  process.exit(1);
}

/** Stripe returns either an id string or an expanded object. */
const idOf = (v) => (typeof v === 'string' ? v : (v?.id ?? null));

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures++;
};

console.log('static: printed dollars against charged cents\n');
for (const key of Object.keys(PRICES)) {
  check(key, PRICES[key].amount === PRICE_USD[key] * 100, `page USD ${PRICE_USD[key]}, stripe ${PRICES[key].amount}c`);
}

console.log('\nlive: the line item Stripe attaches to a real session\n');
const stamp = Date.now();
const { data: account, error: accErr } = await db()
  .from('accounts')
  .insert({ email: `checkout-check-${stamp}@example.invalid` })
  .select('*')
  .single();
if (accErr) throw new Error(`Could not create a test account: ${accErr.message}`);

const { data: scope, error: scopeErr } = await db()
  .from('scopes')
  .insert({
    account_id: account.id,
    brand_name: 'Checkout Check',
    category: 'price parity',
    market: 'United States',
    market_country: 'US',
    buyer: 'nobody',
    what_they_sell: 'nothing',
    website: 'https://example.invalid',
  })
  .select('*')
  .single();
if (scopeErr) throw new Error(`Could not create a test scope: ${scopeErr.message}`);

let sessionId = null;
let discountSessionId = null;
let coupon = null;
let promo = null;
try {
  const { url, priceKey } = await createCheckout({ account, scope });
  check('a session was created', Boolean(url));

  // The session id comes out of the URL Stripe returned. Reading it back off the account row
  // would be reading a column createCheckout writes, which is the thing under test.
  sessionId = url.match(/\/c\/pay\/(cs_[^#?]+)/)?.[1] ?? null;
  check('the checkout URL carries a session id', Boolean(sessionId), sessionId ?? url.slice(0, 60));
  const session = await stripe().checkout.sessions.retrieve(sessionId);

  const items = await stripe().checkout.sessions.listLineItems(session.id, { limit: 1 });
  const line = items.data[0];

  check('line item price id is the one the key resolves to', line.price.id === (await priceIdFor(priceKey)), line.price.id);
  check(
    'line item amount equals the printed price',
    line.amount_total === PRICE_USD[priceKey] * 100,
    `stripe ${line.amount_total}c, page USD ${PRICE_USD[priceKey]}`,
  );
  check('currency is usd', line.price.currency === 'usd', line.price.currency);
  check('the session is a subscription', session.mode === 'subscription', session.mode);
  check('promotion codes cannot be entered on Stripe\'s page', session.allow_promotion_codes !== true);

  const { data: claim } = await db()
    .from('founding_claims')
    .select('id, outcome, checkout_session_id')
    .eq('account_id', account.id)
    .maybeSingle();
  if (priceKey === 'premium_founding_monthly') {
    check('a founding claim was taken', Boolean(claim), claim?.outcome);
    check('the claim carries the session id', claim?.checkout_session_id === session.id);
  } else {
    check('no founding claim for a standard price', !claim);
  }

  // ----------------------------------------------------------------- discounted
  console.log('\ndiscounted: what a cohort code actually charges\n');

  coupon = await stripe().coupons.create({
    name: 'checkout-check throwaway',
    amount_off: DISCOUNT_OFF_CENTS,
    currency: 'usd',
    duration: 'repeating',
    duration_in_months: DISCOUNT_MONTHS,
  });
  promo = await stripe().promotionCodes.create({
    promotion: { type: 'coupon', coupon: coupon.id },
    code: `CHECKCHECK${stamp.toString().slice(-6)}`,
    max_redemptions: 1,
  });

  // What the wizard would print. This is the whole point: the number under test is the one
  // the customer was shown, not a constant sitting in a file.
  const displayed = await validateDiscount(promo.code);
  check('the code validates', displayed.code === promo.code, displayed.code);
  check(
    'the cap is readable and unspent',
    displayed.remaining === 1,
    `${displayed.remaining} redemption(s) left`,
  );

  const second = await createCheckout({ account, scope, discountCode: promo.code });
  discountSessionId = second.url.match(/\/c\/pay\/(cs_[^#?]+)/)?.[1] ?? null;
  check('a discounted session was created', Boolean(discountSessionId));

  const dSession = await stripe().checkout.sessions.retrieve(discountSessionId, {
    expand: ['total_details.breakdown'],
  });
  const dItems = await stripe().checkout.sessions.listLineItems(dSession.id, { limit: 1 });
  const dLine = dItems.data[0];

  check(
    'a discounted checkout never takes the founding price',
    second.priceKey === 'premium_monthly',
    second.priceKey,
  );
  check(
    'the line item is still the standard catalogue price',
    dLine.price.id === (await priceIdFor('premium_monthly')),
    dLine.price.id,
  );
  check(
    'the subtotal is the catalogue price before the discount',
    dLine.amount_subtotal === PRICE_USD.premium_monthly * 100,
    `${dLine.amount_subtotal}c`,
  );
  // THE ASSERTION THE BRIEF THOUGHT WOULD HOLD UNCHANGED. Displayed against charged, with
  // the discount in both.
  check(
    'what Stripe charges equals what the wizard printed',
    dSession.amount_total === displayed.netCents,
    `stripe ${dSession.amount_total}c, page ${displayed.netCents}c`,
  );
  check(
    'the discount is the promotion code, not the bare coupon',
    (dSession.discounts ?? []).some((d) => idOf(d.promotion_code) === promo.id),
    JSON.stringify(dSession.discounts ?? []),
  );
  check(
    'no founding seat was consumed by the discounted session',
    !(await db()
      .from('founding_claims')
      .select('id')
      .eq('account_id', account.id)
      .eq('checkout_session_id', dSession.id)
      .maybeSingle()).data,
  );
  check(
    'the code is carried in metadata for month four',
    dSession.metadata?.discount_code === promo.code,
    dSession.metadata?.discount_code,
  );

  // A code that does not exist must be refused, not quietly ignored into full price.
  let refused = false;
  try {
    await createCheckout({ account, scope, discountCode: 'NOT-A-REAL-CODE' });
  } catch (err) {
    refused = err?.name === 'DiscountError';
  }
  check('an unknown code is refused rather than dropped to full price', refused);

} finally {
  if (sessionId) await stripe().checkout.sessions.expire(sessionId).catch(() => {});
  if (discountSessionId) await stripe().checkout.sessions.expire(discountSessionId).catch(() => {});
  // The promotion code has to go before the coupon: Stripe refuses to delete a coupon that
  // still has codes against it. Deactivated rather than deleted, because promotion codes
  // cannot be deleted at all - which is itself the reason this one is stamped unique.
  if (promo) await stripe().promotionCodes.update(promo.id, { active: false }).catch(() => {});
  if (coupon) await stripe().coupons.del(coupon.id).catch(() => {});
  await db().from('founding_claims').delete().eq('account_id', account.id);
  await db().from('scopes').delete().eq('id', scope.id);
  await db().from('accounts').delete().eq('id', account.id);
  console.log('\ncleaned up both sessions, the claim, the throwaway code, the scope and the account.');
}


console.log(failures ? `\n${failures} check(s) failed.` : '\nDisplayed price and charged price agree.');
process.exitCode = failures ? 1 : 0;
