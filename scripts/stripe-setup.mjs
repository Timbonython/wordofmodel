/**
 * Creates the Stripe product, the two prices and the Customer Portal
 * configuration, then prints the environment variables to paste.
 *
 *   node --env-file=.env.local scripts/stripe-setup.mjs
 *
 * Idempotent. Prices are matched by lookup_key, so running it twice does not
 * create a second USD 149 price with a different id. A price whose amount no
 * longer matches is not edited, because Stripe prices are immutable: the script
 * says so and stops, and changing a price is a deliberate act of creating a new
 * one and moving the environment variable.
 *
 * Refuses to run against a live key unless STRIPE_MODE=live is set explicitly.
 */
import Stripe from 'stripe';

const API_VERSION = '2026-07-29.dahlia';
const PRODUCT_NAME = 'Word of Model - Monthly Report';
const MODE = process.env.STRIPE_MODE === 'live' ? 'live' : 'test';

const PRICES = [
  { lookup_key: 'founding_monthly', unit_amount: 14_900, nickname: 'Founding monthly (first 20)' },
  { lookup_key: 'standard_monthly', unit_amount: 24_900, nickname: 'Standard monthly' },
];

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error('Missing STRIPE_SECRET_KEY. Run with: node --env-file=.env.local scripts/stripe-setup.mjs');
  process.exit(1);
}

const isLive = key.startsWith('sk_live_') || key.startsWith('rk_live_');
if (isLive && MODE !== 'live') {
  console.error('Refusing to run: that is a live key and STRIPE_MODE is not "live".');
  process.exit(1);
}
if (!isLive && MODE === 'live') {
  console.error('Refusing to run: STRIPE_MODE is "live" and that is a test key.');
  process.exit(1);
}

const stripe = new Stripe(key, { apiVersion: API_VERSION });

console.log(`Stripe setup, ${MODE} mode.\n`);

// ------------------------------------------------------------------ product
const existingProducts = await stripe.products.search({
  query: `active:'true' AND name:'${PRODUCT_NAME}'`,
  limit: 1,
});

const product =
  existingProducts.data[0] ??
  (await stripe.products.create({
    name: PRODUCT_NAME,
    description:
      'Five questions your buyers actually ask, run across five AI surfaces every month. Verbatim answers, competitor leaderboard, and three ranked actions.',
  }));

console.log(`product  ${product.id}  ${product.name}`);

// ------------------------------------------------------------------- prices
const env = {};

for (const want of PRICES) {
  const found = await stripe.prices.list({
    lookup_keys: [want.lookup_key],
    active: true,
    limit: 1,
  });

  let price = found.data[0];

  if (price) {
    const wrong = [];
    if (price.unit_amount !== want.unit_amount) {
      wrong.push(`amount is ${price.unit_amount}, expected ${want.unit_amount}`);
    }
    if (price.currency !== 'usd') wrong.push(`currency is ${price.currency}`);
    if (price.recurring?.interval !== 'month') wrong.push('it is not monthly');
    if (wrong.length) {
      console.error(
        `\n${want.lookup_key} (${price.id}) does not match: ${wrong.join(', ')}.\n` +
          `Stripe prices are immutable. Archive it in the dashboard, free the lookup key, and run this again.`,
      );
      process.exit(1);
    }
  } else {
    price = await stripe.prices.create({
      product: product.id,
      lookup_key: want.lookup_key,
      nickname: want.nickname,
      currency: 'usd',
      unit_amount: want.unit_amount,
      // No trial. The free scan is the trial.
      recurring: { interval: 'month', interval_count: 1 },
    });
  }

  console.log(`price    ${price.id}  ${want.lookup_key}  USD ${(want.unit_amount / 100).toFixed(2)}/mo`);
  env[want.lookup_key === 'founding_monthly' ? 'STRIPE_PRICE_FOUNDING_MONTHLY' : 'STRIPE_PRICE_STANDARD_MONTHLY'] =
    price.id;
}

// ------------------------------------------------------- portal configuration
//
// subscription_update is off on purpose. The founding price is locked for twelve
// months by being a normal recurring price, and a portal that lets somebody
// switch plan is a portal that can move them off it, in either direction,
// without anybody deciding to.
//
// Cancellation is at period end: they get the report they paid for, and there
// are no pro rata refunds. It also has to be no harder than signing up, which is
// the July 2027 Unfair Trading Practices position and is simply the right way to
// sell a subscription.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://wordofmodel.ai';

const portal = await stripe.billingPortal.configurations.create({
  business_profile: {
    headline: 'Word of Model',
    privacy_policy_url: `${siteUrl}/privacy`,
    terms_of_service_url: `${siteUrl}/terms`,
  },
  default_return_url: `${siteUrl}/account`,
  features: {
    customer_update: { enabled: true, allowed_updates: ['email', 'address', 'name'] },
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: {
      enabled: true,
      mode: 'at_period_end',
      proration_behavior: 'none',
      cancellation_reason: {
        enabled: true,
        options: ['too_expensive', 'missing_features', 'unused', 'customer_service', 'other'],
      },
    },
    subscription_update: { enabled: false },
  },
});

console.log(`portal   ${portal.id}`);
env.STRIPE_PORTAL_CONFIGURATION_ID = portal.id;

// -------------------------------------------------------------------- output
console.log('\nPaste into .env.local, and into Vercel:\n');
for (const [k, v] of Object.entries(env)) console.log(`${k}=${v}`);

console.log(`
Still to do by hand:

  1. Stripe Tax: leave it OFF. Not GST registered, so no Australian GST is
     charged. That is a decision, not a default. The EU and UK VAT question on
     digital services to consumers is open and is for the accountant before the
     first overseas sale.
  2. Billing → Subscriptions: Smart Retries ON, four attempts, and set the
     end-of-retries behaviour to leave the subscription past_due rather than
     cancel it.
  3. Developers → Webhooks: point an endpoint at ${siteUrl}/api/stripe/webhook
     for checkout.session.completed, customer.subscription.created,
     customer.subscription.updated, customer.subscription.deleted and
     invoice.payment_failed. Put its signing secret in STRIPE_WEBHOOK_SECRET.

     Locally, instead:  stripe listen --forward-to localhost:3000/api/stripe/webhook
`);
