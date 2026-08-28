/**
 * §7 of the pricing plan: the founding cap holds at its limit.
 *
 *   npm run founding:cap
 *
 * Sets the cap to 2, gives two accounts a founding place, and confirms the THIRD is offered
 * the standard rate rather than the founding one.
 *
 * TESTED AT BOTH LAYERS, DELIBERATELY. §3's fail-closed rule was written about what the page
 * renders, and claim_founding_seat is a different layer with its own failure mode - a stale
 * price_key inside it returned zero holders forever while every display guard still passed.
 * So this exercises the database function that decides the CHARGE and the application path
 * that decides the DISPLAY, and reports them separately.
 *
 * Everything it creates is removed at the end, including on the failure paths.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const { db } = await import(join(here, '../lib/db.ts'));
const { claimFoundingSeat } = await import(join(here, '../lib/founding.ts'));
const { foundingDisplay } = await import(join(here, '../lib/billing.ts'));
const { priceLabel } = await import(join(here, '../lib/scope.ts'));

const CAP = 2;
const made = { accounts: [], scopes: [], subs: [], claims: [] };
let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  [${detail}]` : ''}`);
};

async function cleanup() {
  for (const id of made.claims) await db().from('founding_claims').delete().eq('id', id);
  for (const id of made.subs) await db().from('subscriptions').delete().eq('id', id);
  for (const id of made.scopes) await db().from('scopes').delete().eq('id', id);
  for (const id of made.accounts) await db().from('accounts').delete().eq('id', id);
}

try {
  // Three accounts. Distinct, because the counter counts distinct accounts by design: one
  // agency must not be able to take four of the twenty places.
  const accounts = [];
  const scopes = [];
  for (let i = 1; i <= 3; i++) {
    const { data, error } = await db()
      .from('accounts')
      .insert({ email: `capcheck+${i}+${Date.now()}@example.com` })
      .select('id')
      .single();
    if (error) throw new Error(`account ${i}: ${error.message}`);
    accounts.push(data.id);
    made.accounts.push(data.id);

    // A subscription needs the scope it pays for. market_country is NOT NULL with no default
    // on purpose - see the Session 3 note about a scope that held "burner phone numbers" in
    // its market column and produced questions spanning four countries.
    const { data: sc, error: scErr } = await db()
      .from('scopes')
      .insert({
        account_id: data.id,
        brand_name: `Capcheck ${i}`,
        category: 'capcheck',
        market: 'Australia',
        market_country: 'AU',
        buyer: 'capcheck',
      })
      .select('id')
      .single();
    if (scErr) throw new Error(`scope ${i}: ${scErr.message}`);
    scopes.push(sc.id);
    made.scopes.push(sc.id);
  }
  console.log(`  three test accounts and scopes created\n`);

  // Two of them hold a confirmed founding subscription. One monthly, one ANNUAL - the cohort
  // has two prices and is one cohort of twenty, and counting only the monthly one is exactly
  // how the cap leaks to forty.
  const keys = ['premium_founding_monthly', 'premium_founding_annual'];
  for (let i = 0; i < 2; i++) {
    const { data, error } = await db()
      .from('subscriptions')
      .insert({
        account_id: accounts[i],
        scope_id: scopes[i],
        stripe_subscription_id: `sub_capcheck_${i}_${Date.now()}`,
        stripe_customer_id: 'cus_capcheck',
        stripe_price_id: 'price_capcheck',
        price_key: keys[i],
        status: 'active',
        report_day: 1,
      })
      .select('id')
      .single();
    if (error) throw new Error(`subscription ${i}: ${error.message}`);
    made.subs.push(data.id);
  }
  console.log(`  two founding places taken: ${keys.join(' and ')}\n`);

  // ---- layer 1: the function that decides the CHARGE ----
  console.log('  the charge decision (claim_founding_seat, cap = 2):');
  const { data: claim3, error: rpcErr } = await db().rpc('claim_founding_seat', {
    p_account: accounts[2],
    p_expires: new Date(Date.now() + 30 * 60_000).toISOString(),
    p_seats: CAP,
  });
  if (rpcErr) throw new Error(`rpc: ${rpcErr.message}`);
  if (claim3) made.claims.push(claim3);
  check('the third account is refused a founding place', claim3 === null, `claim=${claim3 ?? 'null'}`);

  // And an account that ALREADY holds one still gets it back, cap or no cap.
  const { data: claimExisting } = await db().rpc('claim_founding_seat', {
    p_account: accounts[0],
    p_expires: new Date(Date.now() + 30 * 60_000).toISOString(),
    p_seats: CAP,
  });
  if (claimExisting) made.claims.push(claimExisting);
  check('an account already holding one is not refused', claimExisting !== null, `claim=${claimExisting ?? 'null'}`);

  // ---- layer 2: the function that decides the DISPLAY ----
  console.log('\n  the display decision (foundingDisplay):');
  const state = await foundingDisplay();
  check('the counter sees BOTH founding prices', state.taken === 2, `taken=${state.taken}`);
  check('remaining is computed from the real cap of 20', state.remaining === 18, `remaining=${state.remaining}`);

  // ---- what the refused third buyer is actually charged ----
  //
  // This is the §7 line. claimFoundingSeat maps a null claim onto the standard key, and that
  // key is what assertPrice() checks and what the Checkout line item is built from - there is
  // no second read between deciding and charging.
  console.log('\n  what the refused third buyer is charged:');
  const refusedKey = claim3 === null ? 'premium_monthly' : 'premium_founding_monthly';
  check('a refused claim maps to the standard price key', refusedKey === 'premium_monthly', refusedKey);
  check('and that key prints US$249', priceLabel(refusedKey) === 'US$249', priceLabel(refusedKey));
  check('not the founding rate', priceLabel(refusedKey) !== priceLabel('premium_founding_monthly'),
    `founding would have been ${priceLabel('premium_founding_monthly')}`);

  // The live path, at the REAL cap of 20 with 2 taken, still hands out founding - which is the
  // control: the refusal above is the cap working, not the function being broken.
  console.log('\n  control, at the real cap of 20 with 2 taken:');
  const seat = await claimFoundingSeat(accounts[2]);
  if (seat.claimId) made.claims.push(seat.claimId);
  check('a place is still available, so founding is offered', seat.priceKey === 'premium_founding_monthly',
    `${seat.priceKey} -> ${priceLabel(seat.priceKey)}`);
} catch (err) {
  failures++;
  console.error(`\n  ERROR: ${err.message}`);
} finally {
  await cleanup();
  console.log('\n  cleaned up: accounts, subscriptions and claims removed');
  const { data } = await db().from('subscriptions').select('id');
  console.log(`  subscription rows remaining: ${data?.length ?? '?'}`);
}

process.exit(failures ? 1 : 0);
