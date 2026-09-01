/**
 * Traffic, by Adelaide day, from our own rows.
 *
 *   npm run visits          the last 30 days
 *   npm run visits -- 7     the last 7
 *
 * FOUR NUMBERS, NEVER ONE, and they are printed side by side because they disagree on purpose:
 *
 *   visitors       every distinct visitor_hash. ERRS HIGH - every crawler is in it.
 *   bots           of those, user-agents that declare themselves. A blocklist. Directional.
 *   utm            any utm_source present. NOT PAID TRAFFIC. A crawler fetching an ad URL
 *                  inherits the whole query string; on 28 Aug 2026 that produced 22 landings
 *                  for an ad with no observed clicks.
 *   clicks         a click id present. ERRS LOW - privacy browsers strip them. THIS IS THE
 *                  LINE TO DECIDE ON. A number that errs low is one you can trust when it rises.
 *
 * WHY THIS IS NOT `npm run funnel`. That reads funnel_events, where a `landed` row requires a
 * click id and is therefore a count of paid clicks. Organic traffic is invisible there by
 * design. This table is the other half and the two are read together, never averaged.
 *
 * WHAT IT WILL NOT MATCH, and should not be expected to. Meta's "landing page views" have not
 * required a pixel since July 2025 - Meta models them from the outbound click and how long
 * before you came back to the app - so that figure can be large while this one is small, and
 * the gap is a finding rather than a discrepancy to reconcile away.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const { visitsByDay } = await import(join(here, '../lib/visits.ts'));

const days = Number(process.argv[2] ?? 30);
const rows = await visitsByDay(days);

if (!rows.length) {
  console.log(`\nNo visits recorded in the last ${days} days.`);
  console.log('');
  console.log('Empty means one of two things and they need different fixes:');
  console.log('  - 0025_visits.sql is applied but proxy.ts has not deployed since, so nothing');
  console.log('    has been written yet. Check the deploy, not the traffic.');
  console.log('  - IP_HASH_SALT is unset in the environment, in which case lib/visits.ts');
  console.log('    returns null before writing anything, quietly and on purpose.');
  console.log('');
  console.log('It does NOT mean nobody came. This table starts at the deploy that added it.');
  process.exit(0);
}

const head = ['day', 'visitors', 'bots', 'utm', 'clicks'];
const widths = [10, 8, 5, 5, 6];
const line = (cells) => cells.map((c, i) => String(c).padEnd(widths[i])).join('  ');

console.log(`\nvisits, last ${days} days, Adelaide days, one row per visitor per day\n`);
console.log(line(head));
console.log(widths.map((w) => '-'.repeat(w)).join('  '));

const totals = { visitors: 0, declared_bots: 0, with_utm: 0, with_click_id: 0 };
const ads = {};
for (const r of rows) {
  console.log(line([r.day, r.visitors, r.declared_bots, r.with_utm, r.with_click_id]));
  totals.visitors += r.visitors;
  totals.declared_bots += r.declared_bots;
  totals.with_utm += r.with_utm;
  totals.with_click_id += r.with_click_id;
  for (const [ad, n] of Object.entries(r.by_ad)) ads[ad] = (ads[ad] ?? 0) + n;
}

console.log(widths.map((w) => '-'.repeat(w)).join('  '));
// SUMMED VISITORS IS NOT UNIQUE VISITORS FOR THE PERIOD and the label says so rather than
// leaving it to be assumed. visitor_hash contains the day, so the same person on Monday and
// Tuesday is two unrelated hashes and there is no way to collapse them - which is the privacy
// design working, not a gap. Anyone wanting a monthly unique count needs a different table and
// should be made to ask for it out loud.
console.log(line(['total', totals.visitors, totals.declared_bots, totals.with_utm, totals.with_click_id]));
console.log('');
console.log('  "total visitors" is the sum of daily uniques, not unique people for the period.');
console.log('  visitor_hash includes the date, so the same person on two days cannot be joined.');
console.log('');

const paid = Object.entries(ads).sort((a, b) => b[1] - a[1]);
if (paid.length) {
  console.log('clicked visits by ad (utm_content, click-id rows only)\n');
  for (const [ad, n] of paid) console.log(`  ${String(ad).padEnd(22)} ${n}`);
  console.log('');
} else if (totals.with_click_id === 0 && totals.with_utm > 0) {
  // The exact shape of the 28 Aug over-count, worth naming when it recurs rather than leaving
  // somebody to notice that one column is full and the one beside it is empty.
  console.log(`  ${totals.with_utm} visits carried a utm and NONE carried a click id.`);
  console.log('  That is the signature of automated fetches of an ad URL, not of ad traffic.');
  console.log('  Read the user_agent column before concluding anything about the campaign.');
  console.log('');
}
