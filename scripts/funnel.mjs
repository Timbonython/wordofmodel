/**
 * The funnel, by day and by source, from our own rows.
 *
 *   npm run funnel          the last 30 days
 *   npm run funnel -- 7     the last 7
 *
 * THIS IS THE SOURCE OF TRUTH AND META'S DASHBOARD IS NOT. Meta reports what it would like to
 * be paid for, cannot be audited, and will not match this. When the two disagree the honest
 * move is to say so and investigate, not to quote whichever number is kinder that week.
 *
 * WHAT THE SHAPE OF THE TABLE TELLS YOU, which is the whole reason it exists. The paid test is
 * a few hundred dollars, nowhere near significance on subscriptions, so the only useful
 * outputs are cost per completed scan and the rate from scan to wizard. Three failure modes,
 * three different repairs:
 *
 *   few scans completed per dollar        the ad hook is wrong
 *   scans complete, few start the wizard  the scan result page is wrong
 *   wizard starts, nobody pays            price or trust is wrong
 *
 * A funnel that cannot separate those is worthless at any budget, which is why the five steps
 * are recorded separately rather than inferred from one another.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const { funnelTable, LANDED_CUTOVER } = await import(join(here, '../lib/funnel.ts'));

const days = Number(process.argv[2] ?? 30);
const rows = await funnelTable(days);

if (!rows.length) {
  console.log(`No funnel events in the last ${days} days.`);
  console.log('If ads are running and this is empty, the events are not firing: check that');
  console.log('0014 is applied before assuming the traffic is not arriving.');
  process.exit(0);
}

// PRINTED ABOVE EVERY TABLE, not tucked in a footnote. `landed` changed meaning on the cutover
// date: before it, it counted attributed server renders including crawler fetches of ad URLs;
// after it, one row per ad click. A reader comparing across that line sees a step down and will
// reach for a traffic explanation unless this is in front of them. See 0020.
console.log('');
console.log(`  NOTE: "landed" changed meaning on ${LANDED_CUTOVER}. Before that date it counted`);
console.log('  attributed renders, crawler fetches of ad URLs included; from that date it counts');
console.log('  ad clicks, one row per click id. A step down at the boundary is a definition');
console.log('  change, not a drop in traffic. Do not compare across it. See migration 0020.');
console.log('');

// `landed` was computed by funnelTable() from the day it was added and never printed here, so
// the top of the funnel - the number the whole ad test is read from - was invisible in the tool
// built to read the funnel, and had to be counted out of the table by hand. That is how the
// 28 Aug over-count was read as a one-day figure when it was a cumulative one.
const head = ['day', 'source', 'clicks', 'scans', 'completed', 'wizard', 'checkout', 'paid'];
const widths = [10, 16, 6, 6, 10, 7, 9, 5];
const line = (cells) => cells.map((c, i) => String(c).padEnd(widths[i])).join(' ');

console.log(`\nlast ${days} days, from our own rows\n`);
console.log(line(head));
console.log(widths.map((w) => '-'.repeat(w)).join(' '));

const totals = { landed: 0, scan_started: 0, scan_completed: 0, wizard_started: 0, checkout_started: 0, subscription_active: 0 };
for (const r of rows) {
  console.log(
    line([r.day, r.source, r.landed, r.scan_started, r.scan_completed, r.wizard_started, r.checkout_started, r.subscription_active]),
  );
  for (const k of Object.keys(totals)) totals[k] += r[k];
}

console.log(widths.map((w) => '-'.repeat(w)).join(' '));
console.log(line(['total', '', totals.landed, totals.scan_started, totals.scan_completed, totals.wizard_started, totals.checkout_started, totals.subscription_active]));

const rate = (a, b) => (b ? `${((a / b) * 100).toFixed(0)}%` : 'n/a');
console.log(`\nclick -> scan started       ${rate(totals.scan_started, totals.landed)}`);
console.log(`scan started -> completed   ${rate(totals.scan_completed, totals.scan_started)}`);
console.log(`completed -> wizard         ${rate(totals.wizard_started, totals.scan_completed)}`);
console.log(`wizard -> checkout          ${rate(totals.checkout_started, totals.wizard_started)}`);
console.log(`checkout -> paid            ${rate(totals.subscription_active, totals.checkout_started)}`);

console.log(`\n"clicks" counts ad clicks that landed on /, one row per click id, and ONLY ad`);
console.log(`clicks: organic and direct arrivals record nothing and are invisible here by`);
console.log(`design. Rows below that with no click above them arrived by another road.`);

console.log(`\nA "direct" source is traffic that arrived with no utm tag, or a /start opened`);
console.log(`without a scan behind it. It is counted rather than hidden: a funnel that drops`);
console.log(`its unattributed traffic reports a better conversion rate than the business has.`);
