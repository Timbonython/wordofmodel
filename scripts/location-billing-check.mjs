/**
 * Do the towns we RUN and the towns we CHARGE FOR agree, right now, in the live account?
 *
 * The same question the daily cron asks, runnable by hand after fixing either side. Reads
 * Stripe and Supabase and writes nothing.
 */
import { locationBillingMismatches } from '../lib/location-billing.ts';
import { proveStripeMode } from '../lib/stripe.ts';

// WHICH LEDGER IS THIS COUNTING? A clean result means nothing if it is reading the other
// mode's subscriptions - the same failure that let a founding count read healthy for a week.
const mode = await proveStripeMode();
console.log(`  mode: ${mode.mode}, ${mode.resolved ? 'proved' : `NOT PROVED - ${mode.detail}`}`);
if (!mode.resolved) process.exit(1);

const audit = await locationBillingMismatches();
const drift = audit.mismatches;

// A CLEAN RESULT OVER NOTHING IS NOT A CLEAN RESULT, and it must not print like one.
if (!audit.examined) {
  console.log('  location billing: NOTHING TO CHECK. No live subscription was readable in this');
  console.log('  mode, so this run proves nothing about whether billing and runs agree.');
  process.exit(audit.unreadable.length ? 1 : 0);
}
if (audit.unreadable.length) {
  console.log(`  ${audit.unreadable.length} subscription(s) could not be read from Stripe - UNKNOWN, not clean:`);
  for (const id of audit.unreadable) console.log(`    ${id}`);
}
if (!drift.length) {
  console.log(`  location billing: clean. ${audit.examined} live subscription(s) bill the towns they run.`);
  process.exit(audit.unreadable.length ? 1 : 0);
}
for (const d of drift) {
  const who = d.rows < d.billed ? 'PAYING FOR A TOWN THEY DO NOT GET' : 'running a town nobody pays for';
  console.log(`  scope ${d.scopeId}  rows ${d.rows}  billed ${d.billed}  ${who}  ${d.subscriptionId}`);
}
console.log(`\n  location billing: ${drift.length} MISMATCH${drift.length === 1 ? '' : 'ES'}`);
process.exit(1);
