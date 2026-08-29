/**
 * The daily scheduler. Opens the month's run for every subscriber due today.
 *
 * It does NOT deliver reports: that moved to the five minute sweep, so a subscriber who
 * pays at 07:00 does not wait until 06:00 the next morning for something that finished in
 * thirteen minutes. What is left here is the net under that - anything complete and unsent
 * for six hours gets an alert, because a delivery path that silently never fires is exactly
 * the failure the sweep's speed would otherwise buy.
 *
 * report_day is 1 to 28 by check constraint (0003), capped from the billing anchor in
 * reportDayFrom(). That cap is load bearing here and easy to "fix" into a bug: because no
 * report_day can be 29, 30 or 31, every possible value exists in every month including
 * February, and this route needs NO clamping logic at all. Comparing the day of the month
 * is the whole rule.
 *
 * Capping down also means the report always lands on or before the invoice. A subscriber
 * who signed up on the 31st reads their report on the 28th, three days before they are
 * charged. Nobody ever pays for a month whose report has not arrived.
 *
 * Everything is UTC, matching getUTCDate() in reportDayFrom.
 */

import { authorised, unauthorised, kickChains, CHAINS } from '@/lib/cron';
import { startRunsForScope, ensureBaselineRun, scopesAwaitingFirstRun } from '@/lib/run';
import { dueJobCount } from '@/lib/jobs';
import { runsStuckAwaitingReport } from '@/lib/reports';
import { sendOpsAlert } from '@/lib/billing-mail';
import { locationBillingMismatches } from '@/lib/location-billing';
import { LIVE_STATUSES } from '@/lib/billing';
import { db } from '@/lib/db';
import { proveStripeMode } from '@/lib/stripe';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

async function handle(req: Request): Promise<Response> {
  if (!authorised(req)) return unauthorised();

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const day = now.getUTCDate();

  // past_due is in LIVE_STATUSES on purpose: Smart Retries are still running, and
  // treating a first failed card as a cancellation is how you lose a customer to an
  // expired card. They keep getting reports while Stripe keeps trying.
  const { data, error } = await db()
    .from('subscriptions')
    .select('id, scope_id, status, report_day')
    .eq('report_day', day)
    .in('status', LIVE_STATUSES);
  if (error) throw new Error(`Could not list subscriptions due today: ${error.message}`);

  const due = (data ?? []) as Array<{ id: string; scope_id: string }>;
  const opened: Array<{ scope: string; run: string; created: boolean }> = [];
  const failed: Array<{ scope: string; reason: string }> = [];

  for (const sub of due) {
    try {
      // period_start is today's date, so this is idempotent by the unique index rather
      // than by asking whether a run exists. Re-running the cron opens nothing new.
      const runs = await startRunsForScope({
        scopeId: sub.scope_id,
        period: 'monthly',
        periodStart: today,
        triggerSource: 'scheduled',
      });
      for (const { run, created } of runs) opened.push({ scope: sub.scope_id, run: run.id, created });
    } catch (err) {
      // One subscriber's bad configuration must not stop everybody else's report.
      failed.push({ scope: sub.scope_id, reason: err instanceof Error ? err.message : String(err) });
      console.error(`schedule: could not open a run for scope ${sub.scope_id}`, err);
    }
  }

  // THE NET UNDER THE 24 HOUR PROMISE. The Stripe webhook opens the first run minutes
  // after payment, but a lost, delayed or mis-ordered event would leave a paying
  // subscriber with nothing and nothing saying so - the exact failure Session 2 found.
  // So this asks the real question independently: is there a live subscription whose
  // scope has never had a run? Two routes to the same outcome, neither depending on the
  // other having worked.
  const awaiting = await scopesAwaitingFirstRun();
  const baselines: Array<{ scope: string; run: string }> = [];
  for (const scopeId of awaiting) {
    try {
      // One entry per town. A two-location subscriber whose scope has never run gets two.
      for (const started of await ensureBaselineRun(scopeId, today)) {
        baselines.push({ scope: scopeId, run: started.run.id });
      }
    } catch (err) {
      failed.push({ scope: scopeId, reason: `baseline: ${err instanceof Error ? err.message : String(err)}` });
      console.error(`schedule: could not open a baseline run for scope ${scopeId}`, err);
    }
  }

  // DELIVERY MOVED TO THE FIVE MINUTE SWEEP, and what is left here is the net under it.
  //
  // The sweep sends a report a few minutes after the run finishes, which is what makes a
  // first report arrive while the subscriber still remembers paying. The cost of that is a
  // quiet failure mode: a run whose extraction never completes is never ready to deliver,
  // so it is never delivered and nothing says so. A subscriber waiting for a report that
  // will never arrive is the silence this build keeps refusing.
  //
  // So the daily pass notices instead of delivering. Complete, unsent, and older than six
  // hours is not a timing quirk, it is stuck.
  const stuck = await runsStuckAwaitingReport();
  if (stuck.length) {
    await sendOpsAlert({
      subject: `${stuck.length} report${stuck.length === 1 ? '' : 's'} finished but never sent`,
      lines: [
        'These runs are complete, their reports have not gone out, and the five minute',
        'sweep has had at least six hours to send them.',
        '',
        ...stuck.map((r) => `  run ${r.id} scope ${r.scope_id} period ${r.period_start}`),
        '',
        'Most likely the extraction pass never finished, which is what holds delivery back:',
        'check for captures with a null extracted_at, then POST /api/run/extract.',
      ],
    });
  }

  // DO THE TOWNS WE RUN AND THE TOWNS WE CHARGE FOR AGREE?
  //
  // THE MISMATCH IS SILENT IN BOTH DIRECTIONS, which is the whole reason it is asked out loud
  // on a schedule rather than trusted to the two writes that maintain it. `scope_locations`
  // decides what runs; the Stripe subscription item quantity decides what is charged. Nothing
  // reconciles them, neither side errors when they disagree, and neither number appears on any
  // page the subscriber or we would look at.
  //
  //   fewer rows than billed   they pay US$30 a month for a town that is never measured, which
  //                            is exactly the defect the whole feature was built to remove
  //   more rows than billed    we measure and pay for a town nobody is charged for
  //
  // Daily, alongside the mode proof, and for the same reason: this is a configuration fact, not
  // an event, and an alert channel that fires every five minutes gets muted.
  try {
    const audit = await locationBillingMismatches();
    const drift = audit.mismatches;
    if (drift.length || audit.unreadable.length) {
      await sendOpsAlert({
        subject: drift.length
          ? `${drift.length} subscription${drift.length === 1 ? '' : 's'} bill a different number of towns than we run`
          : `${audit.unreadable.length} subscription${audit.unreadable.length === 1 ? '' : 's'} could not be reconciled`,
        lines: [
          'scope_locations decides what runs. The Stripe quantity decides what is charged.',
          'These disagree, which no error and no page would ever show:',
          '',
          ...drift.map(
            (d) =>
              `  scope ${d.scopeId}  rows ${d.rows}  billed ${d.billed}  ` +
              `(${d.rows < d.billed ? 'PAYING FOR A TOWN THEY DO NOT GET' : 'running a town nobody pays for'})  ${d.subscriptionId}`,
          ),
          '',
          ...(audit.unreadable.length
            ? [
                'And these could not be read from Stripe at all, so they are UNKNOWN rather than',
                'clean:',
                ...audit.unreadable.map((id) => `  ${id}`),
                '',
              ]
            : []),
          `${audit.examined} live subscription${audit.examined === 1 ? ' was' : 's were'} compared.`,
          'Fix the side that is wrong, then run npm run locations:billing to confirm.',
        ],
      });
    }
  } catch (err) {
    // Never takes the scheduler down. Opening runs is what subscribers are paying for; a
    // reconciliation that cannot read Stripe is a thing to report, not a reason to skip
    // everybody's report.
    console.error('schedule: location billing reconciliation failed', err);
  }

  // WHICH STRIPE MODE IS THIS ACTUALLY TALKING TO?
  //
  // A COUNT CANNOT ANSWER THAT QUESTION ABOUT ITSELF. "Zero founding places taken" reads
  // identically whether it is a correct zero or a query pointed at the other mode's data, and
  // the two have opposite consequences: one means twenty places are open, the other means the
  // cap is blind and every visitor is being handed a permanent discount nobody is counting.
  //
  // Written after 28 Aug 2026, when production had been running STRIPE_MODE=live for over a
  // week while the build session assumed test throughout. Nothing was wrong; nothing said so
  // either, and every check that existed would have read the same in both cases.
  //
  // So the environment is proved rather than inferred, by retrieving a price id that exists in
  // one mode and not the other. Daily, not on the five minute sweep - this is a configuration
  // fact, and 288 alerts a day is how an alert channel gets muted.
  const mode = await proveStripeMode();
  if (!mode.resolved) {
    await sendOpsAlert({
      subject: `Stripe mode could not be proved: STRIPE_MODE says ${mode.mode}`,
      lines: [
        `This build believes it is in ${mode.mode} mode, and could not confirm it.`,
        '',
        mode.detail,
        '',
        'Three things do this, and they are not equally bad:',
        '',
        '  1. STRIPE_MODE and STRIPE_SECRET_KEY point at a different account than expected.',
        '     Anything counting subscriptions is then counting the wrong ledger, silently.',
        '     This is the one that costs money. Check both in Vercel.',
        '',
        `  2. The sentinel price ${mode.sentinel} was recreated or archived. A price's`,
        '     amount cannot be edited, so replacing one makes a new id. If that is what',
        '     happened, update MODE_SENTINEL in lib/stripe.ts - a false alarm nobody can',
        '     silence is an alert that gets ignored.',
        '',
        '  3. Stripe was unreachable when the cron ran. Harmless, and it will clear itself',
        '     tomorrow. If this alert does not repeat, it was this.',
        '',
        'Run `npm run stripe:mode` against the environment in question to see it directly.',
      ],
    });
  }

  const pending = await dueJobCount();
  const kicked = pending > 0 ? await kickChains(Math.min(CHAINS, pending)) : 0;

  return Response.json({
    date: today,
    day,
    due: due.length,
    opened,
    baselines,
    stuck: stuck.map((r) => r.id),
    // Reported on every run, not only on failure: a manual GET of this route is the quickest
    // way to ask production which Stripe ledger it is on, and the answer should not require
    // something to be broken first.
    stripe: { mode: mode.mode, proved: mode.resolved, livemode: mode.livemode, detail: mode.detail },
    failed,
    pending,
    kicked,
  });
}

export async function GET(req: Request): Promise<Response> {
  return handle(req);
}

export async function POST(req: Request): Promise<Response> {
  return handle(req);
}
