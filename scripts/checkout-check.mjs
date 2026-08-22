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
 * Cleans up: expires the session, releases the claim, deletes the throwaway account and scope.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const { db } = await import(join(here, '../lib/db.ts'));
const { PRICES, priceIdFor, stripe } = await import(join(here, '../lib/stripe.ts'));
const { PRICE_USD } = await import(join(here, '../lib/scope.ts'));
const { createCheckout } = await import(join(here, '../lib/checkout.ts'));

if ((process.env.STRIPE_SECRET_KEY ?? '').startsWith('sk_live_')) {
  console.error('Refusing to run against a live key. Switch .env.local back to test.');
  process.exit(1);
}

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
try {
  const { url, priceKey } = await createCheckout({ account, scope });
  check('a session was created', Boolean(url));

  const sessions = await stripe().checkout.sessions.list({ customer: account.stripe_customer_id, limit: 1 });
  const session = sessions.data[0];
  sessionId = session?.id ?? null;

  const items = await stripe().checkout.sessions.listLineItems(session.id, { limit: 1 });
  const line = items.data[0];

  check('line item price id is the one the key resolves to', line.price.id === priceIdFor(priceKey), line.price.id);
  check(
    'line item amount equals the printed price',
    line.amount_total === PRICE_USD[priceKey] * 100,
    `stripe ${line.amount_total}c, page USD ${PRICE_USD[priceKey]}`,
  );
  check('currency is usd', line.price.currency === 'usd', line.price.currency);
  check('no trial on the session', !session.subscription_data?.trial_period_days);

  const { data: claim } = await db()
    .from('founding_claims')
    .select('id, outcome, checkout_session_id')
    .eq('account_id', account.id)
    .maybeSingle();
  if (priceKey === 'founding_monthly') {
    check('a founding claim was taken', Boolean(claim), claim?.outcome);
    check('the claim carries the session id', claim?.checkout_session_id === session.id);
  } else {
    check('no founding claim for a standard price', !claim);
  }
} finally {
  if (sessionId) await stripe().checkout.sessions.expire(sessionId).catch(() => {});
  await db().from('founding_claims').delete().eq('account_id', account.id);
  await db().from('scopes').delete().eq('id', scope.id);
  await db().from('accounts').delete().eq('id', account.id);
  console.log('\ncleaned up the session, the claim, the scope and the account.');
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nDisplayed price and charged price agree.');
process.exitCode = failures ? 1 : 0;
