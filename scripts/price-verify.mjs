/**
 * §7 of the pricing plan, line one: complete a subscription on each of the eight prices and
 * record the actual invoice amount.
 *
 *   npm run price:verify
 *
 * TEST MODE ONLY, and it refuses to run otherwise. It creates a customer, attaches Stripe's
 * test card, subscribes, reads what the invoice ACTUALLY says, and then removes everything it
 * made. Reading the price object back would prove nothing: the question is what the customer
 * is charged, and that is on the invoice.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const { stripe, PRICES, PRICE_KEYS, priceIdFor } = await import(join(here, '../lib/stripe.ts'));
const { env } = await import(join(here, '../lib/env.ts'));

if (env.stripeMode !== 'test') {
  console.error('price:verify refuses to run outside test mode.');
  process.exit(1);
}

const s = stripe();
const rows = [];
const made = [];

for (const key of PRICE_KEYS) {
  const want = PRICES[key];
  const priceId = await priceIdFor(key);

  const customer = await s.customers.create({
    name: `verify ${key}`,
    email: `verify+${key}@example.com`,
    payment_method: 'pm_card_visa',
    invoice_settings: { default_payment_method: 'pm_card_visa' },
    metadata: { wom_verify: '1' },
  });
  made.push(customer.id);

  const sub = await s.subscriptions.create({
    customer: customer.id,
    items: [{ price: priceId, quantity: 1 }],
    metadata: { wom_verify: '1', price_key: key },
    expand: ['latest_invoice'],
  });

  const invoice = sub.latest_invoice;
  rows.push({
    key,
    priceId,
    expected: want.amount,
    invoiced: invoice?.amount_due ?? null,
    currency: invoice?.currency ?? null,
    interval: sub.items.data[0]?.price?.recurring?.interval ?? null,
    status: sub.status,
    lookup: sub.items.data[0]?.price?.lookup_key ?? null,
  });
}

console.log('key                        price id                        expected  invoiced  cur  interval  lookup_key                 status');
let bad = 0;
for (const r of rows) {
  const ok = r.invoiced === r.expected && r.currency === 'usd' && r.interval === PRICES[r.key].interval && r.lookup === r.key;
  if (!ok) bad++;
  console.log(
    `${r.key.padEnd(26)} ${r.priceId.padEnd(31)} ${String(r.expected).padStart(8)} ${String(r.invoiced).padStart(9)}  ${String(r.currency).padEnd(4)} ${String(r.interval).padEnd(9)} ${String(r.lookup).padEnd(26)} ${r.status}${ok ? '' : '   <-- MISMATCH'}`,
  );
}

console.log('\nannual is ten times monthly, as INVOICED rather than as configured:');
for (const r of rows) {
  if (!r.key.endsWith('_monthly')) continue;
  const annual = rows.find((x) => x.key === r.key.replace(/_monthly$/, '_annual'));
  const ok = annual && annual.invoiced === r.invoiced * 10;
  if (!ok) bad++;
  console.log(`  ${r.key.padEnd(26)} ${String(r.invoiced).padStart(7)} x10 = ${String(r.invoiced * 10).padStart(7)}   ${annual?.key.padEnd(26)} invoiced ${String(annual?.invoiced).padStart(7)}  ${ok ? 'ok' : 'MISMATCH'}`);
}

console.log('\ncleaning up:');
let removed = 0;
for (const id of made) {
  await s.customers.del(id);
  removed++;
}
console.log(`  deleted ${removed}/${made.length} test customers (their subscriptions go with them)`);

process.exit(bad ? 1 : 0);
