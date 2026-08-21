/**
 * The daily scheduler. Opens the month's run for every subscriber due today, and sends the
 * reports for the runs that have finished since the last pass.
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
import { startRun, ensureBaselineRun, scopesAwaitingFirstRun } from '@/lib/run';
import { dueJobCount } from '@/lib/jobs';
import { deliverReport } from '@/lib/deliver';
import { runsAwaitingReport } from '@/lib/reports';
import { LIVE_STATUSES } from '@/lib/billing';
import { db } from '@/lib/db';

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
      const { run, created } = await startRun({
        scopeId: sub.scope_id,
        period: 'monthly',
        periodStart: today,
        triggerSource: 'scheduled',
      });
      opened.push({ scope: sub.scope_id, run: run.id, created });
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
      const started = await ensureBaselineRun(scopeId, today);
      if (started) baselines.push({ scope: scopeId, run: started.run.id });
    } catch (err) {
      failed.push({ scope: scopeId, reason: `baseline: ${err instanceof Error ? err.message : String(err)}` });
      console.error(`schedule: could not open a baseline run for scope ${scopeId}`, err);
    }
  }

  // AND THEN SEND WHAT IS FINISHED. Opening runs and delivering reports are separate
  // questions asked in the same pass: a run opened this morning is still capturing, so what
  // goes out here is whatever finished since the last pass - usually yesterday's, and for a
  // new subscriber the baseline run that completed minutes after they paid.
  //
  // Asked of the data rather than of a flag, so a missed cron or a deploy mid-send is a row
  // that still qualifies tomorrow rather than a report nobody ever sends. deliverReport
  // holds the rules: a partial run is held and alerted, the send is claimed before the
  // email, and a failure releases the claim so this pass retries it.
  const delivered: Array<{ run: string; to: string }> = [];
  const held: Array<{ run: string; status: string }> = [];
  for (const run of await runsAwaitingReport()) {
    try {
      const outcome = await deliverReport(run);
      if (outcome.sent) delivered.push({ run: run.id, to: outcome.to });
      else if (outcome.reason === 'held') held.push({ run: run.id, status: outcome.status });
      else if (outcome.reason === 'failed') failed.push({ scope: run.scope_id, reason: `send: ${outcome.error}` });
    } catch (err) {
      // One subscriber's report must not stop everybody else's, same as opening runs.
      failed.push({ scope: run.scope_id, reason: `send: ${err instanceof Error ? err.message : String(err)}` });
      console.error(`schedule: could not deliver the report for run ${run.id}`, err);
    }
  }

  const pending = await dueJobCount();
  const kicked = pending > 0 ? await kickChains(Math.min(CHAINS, pending)) : 0;

  return Response.json({
    date: today,
    day,
    due: due.length,
    opened,
    baselines,
    delivered,
    held,
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
