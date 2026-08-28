/**
 * Creates the three products and eight prices in Stripe, idempotently.
 *
 *   npm run stripe:setup              report only, changes nothing
 *   npm run stripe:setup -- --create  create anything missing
 *
 * §5 of the pricing plan. EVERY PRICE CARRIES A lookup_key, and the application resolves ids
 * through those keys rather than storing them: an id differs between test and live mode and a
 * lookup key does not, so there is nothing left to set to the wrong mode's value at midnight.
 *
 * WHY IT ONLY EVER CREATES. A Stripe price is immutable in the ways that matter - unit_amount
 * and interval cannot be edited after creation - so "fixing" a wrong price means creating a new
 * one and moving the lookup key. This script refuses to pretend otherwise: it reports a
 * mismatch loudly and makes the operator decide, because silently minting a second price at a
 * different amount is how a customer ends up on a rate nobody chose.
 *
 * Product NAMES and DESCRIPTIONS are updated in place, because those are copy, they print on
 * Checkout and on every invoice, and they are safe to change.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const { stripe, PRICES, PRICE_KEYS, PRODUCTS, STRIPE_API_VERSION } = await import(join(here, '../lib/stripe.ts'));

const create = process.argv.includes('--create');
const s = stripe();

console.log(`Stripe ${STRIPE_API_VERSION}, ${create ? 'CREATE' : 'report only'}\n`);

// ---------------------------------------------------------------- products, by metadata key
//
// Matched on metadata.wom_tier rather than on the name, because the name is copy and copy
// changes. Searching by name is how a renamed product becomes a second product.
const productIds = {};
for (const [tier, want] of Object.entries(PRODUCTS)) {
  const found = await s.products.search({ query: `active:'true' AND metadata['wom_tier']:'${tier}'`, limit: 1 });
  let product = found.data[0];

  if (!product) {
    if (!create) {
      console.log(`  product ${tier}: MISSING (${want.name})`);
      continue;
    }
    product = await s.products.create({ name: want.name, description: want.description, metadata: { wom_tier: tier } });
    console.log(`  product ${tier}: created ${product.id}`);
  } else if (product.name !== want.name || product.description !== want.description) {
    if (create) {
      product = await s.products.update(product.id, { name: want.name, description: want.description });
      console.log(`  product ${tier}: ${product.id} copy updated`);
    } else {
      console.log(`  product ${tier}: ${product.id} copy DIFFERS from the build`);
    }
  } else {
    console.log(`  product ${tier}: ${product.id} ok`);
  }
  if (product) productIds[tier] = product.id;
}

// ------------------------------------------------------------------- prices, by lookup key
console.log('');
let missing = 0;
let wrong = 0;

for (const key of PRICE_KEYS) {
  const want = PRICES[key];
  const found = await s.prices.list({ lookup_keys: [key], active: true, limit: 1 });
  const price = found.data[0];

  if (price) {
    const problems = [];
    if (price.unit_amount !== want.amount) problems.push(`amount ${price.unit_amount} != ${want.amount}`);
    if (price.currency !== 'usd') problems.push(`currency ${price.currency} != usd`);
    if (price.recurring?.interval !== want.interval) problems.push(`interval ${price.recurring?.interval} != ${want.interval}`);
    if (price.recurring?.trial_period_days) problems.push('it has a trial');
    if (problems.length) {
      wrong++;
      console.log(`  ${key.padEnd(26)} ${price.id}  WRONG: ${problems.join(', ')}`);
      console.log(`  ${''.padEnd(26)} a price's amount and interval cannot be edited. Create a new`);
      console.log(`  ${''.padEnd(26)} price, move the lookup key onto it, and deactivate this one.`);
    } else {
      console.log(`  ${key.padEnd(26)} ${price.id}  ${String(want.amount).padStart(6)} usd / ${want.interval}  ok`);
    }
    continue;
  }

  missing++;
  if (!create) { console.log(`  ${key.padEnd(26)} MISSING  ${want.amount} usd / ${want.interval}`); continue; }

  const productId = productIds[want.tier];
  if (!productId) { console.log(`  ${key.padEnd(26)} SKIPPED, product ${want.tier} does not exist`); continue; }

  const made = await s.prices.create({
    product: productId,
    lookup_key: key,
    // A key already on another price is transferred rather than refused. Without this the
    // second run after a corrected amount fails with a duplicate-key error and no explanation.
    transfer_lookup_key: true,
    currency: 'usd',
    unit_amount: want.amount,
    recurring: { interval: want.interval, interval_count: 1 },
    nickname: want.nickname,
    // §5: reporting reads these rather than parsing lookup keys.
    metadata: { tier: want.tier, founding: String(want.founding), wom_price_key: key },
  });
  console.log(`  ${key.padEnd(26)} ${made.id}  created  ${want.amount} usd / ${want.interval}`);
}

console.log('');
if (!create && (missing || wrong)) {
  console.log(`${missing} missing, ${wrong} wrong. Re-run with --create to make the missing ones.`);
  process.exit(1);
}
if (wrong) { console.log(`${wrong} price(s) do not match the build. Nothing was changed for those.`); process.exit(1); }
console.log('Catalogue matches the build.');
