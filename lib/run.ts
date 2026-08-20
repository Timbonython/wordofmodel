/**
 * A run: opening one, filling its queue, paying for it, and deciding it is finished.
 *
 * THE RULE THIS FILE EXISTS TO HOLD. No invocation that finishes a capture is allowed to
 * decide the run is complete. The tick that closes the fifty-fifth job closes its own job
 * and nothing else; settleRun counts rows and is the only thing that settles anything.
 *
 * That is the Session 2 lesson applied one level up. "Did I insert the row" was not "has
 * this person been told", and "I finished the last job" is not "this subscriber has a
 * complete report". Ask the real question, in one statement, against the data.
 */

import 'server-only';
import { db } from './db';
import { env } from './env';
import { sendOpsAlert } from './billing-mail';
import { capturesExpected, runnableMonthlySurfaces, samplesFor, samplingMap } from './engines';
import { SURFACES, type RunPeriod, type Surface } from './scope';
import type { QuestionRow, RunRow } from './accounts';

/**
 * A run only ever uses questions the subscriber approved.
 *
 * Fewer than five and the run does not start. Four questions across five surfaces is a
 * report that measures something else, computed on a smaller denominator, and it would be
 * comparable neither to last month nor to another subscriber. The offer sheet sells five
 * questions; a run that quietly ships four is the product not being delivered.
 */
export async function approvedQuestions(scopeId: string): Promise<QuestionRow[]> {
  const { data, error } = await db()
    .from('questions')
    .select('*')
    .eq('scope_id', scopeId)
    .not('approved_at', 'is', null);
  if (error) throw new Error(`Could not read questions for scope ${scopeId}: ${error.message}`);
  return (data ?? []) as QuestionRow[];
}

export interface StartRunInput {
  scopeId: string;
  period: RunPeriod;
  /** Which period, as a date. The idempotency key together with scope and cadence. */
  periodStart: string;
  triggerSource: 'baseline' | 'scheduled' | 'manual';
}

/**
 * Open a run and fill its queue. Safe to call twice.
 *
 * Idempotency is the unique index on (scope_id, period, period_start) from 0005, not a
 * check-then-insert. Two callers race, Postgres serialises them, one insert wins and the
 * loser reads the winner's row. Nothing anywhere asks "does a run already exist" and then
 * acts on the answer, because the gap between those two things is where the second run
 * and its fifty-five paid API calls come from.
 *
 * The queue is filled with `on conflict do nothing` for the same reason: the loser of the
 * run race still enqueues, and every insert either lands or is refused by the key.
 */
export async function startRun(input: StartRunInput): Promise<{ run: RunRow; created: boolean }> {
  const questions = await approvedQuestions(input.scopeId);
  if (questions.length !== 5) {
    throw new Error(
      `Scope ${input.scopeId} has ${questions.length} approved questions, not 5. Refusing to ` +
        `start a run: a report built on a different number of questions is comparable to ` +
        `nothing, including its own previous months.`,
    );
  }

  const surfaces =
    input.period === 'monthly'
      ? runnableMonthlySurfaces()
      : (Object.keys(SURFACES) as Surface[]);

  const expected = capturesExpected(questions.length, surfaces);

  const { data: inserted, error } = await db()
    .from('runs')
    .insert({
      scope_id: input.scopeId,
      period: input.period,
      period_start: input.periodStart,
      status: 'pending',
      trigger_source: input.triggerSource,
      captures_expected: expected,
      surfaces,
      samples: samplingMap(surfaces),
      cost_ceiling_usd: env.runCostCeilingUsd,
    })
    .select('*')
    .single();

  let run: RunRow;
  let created = true;

  if (error) {
    if (!/duplicate|unique/i.test(error.message)) {
      throw new Error(`Could not open a run for scope ${input.scopeId}: ${error.message}`);
    }
    // Somebody else opened this run. Theirs is the run; fall in behind it and still
    // enqueue, because we do not know how far they got before we arrived.
    const existing = await getRun(input.scopeId, input.period, input.periodStart);
    if (!existing) throw new Error(`Run conflict for scope ${input.scopeId} but no row to read.`);
    run = existing;
    created = false;
  } else {
    run = inserted as RunRow;
  }

  await enqueueJobs(run, questions, surfaces);
  return { run, created };
}

/**
 * One job per question, per surface, per sample.
 *
 * Five questions across the five monthly surfaces at the approved sampling depth is
 * FIFTY-FIVE jobs, not twenty five: gemini, perplexity and google_aio are asked three
 * times each. The session brief said twenty five and that was right before we measured
 * how much the surfaces rewrite themselves between calls.
 */
async function enqueueJobs(run: RunRow, questions: QuestionRow[], surfaces: Surface[]): Promise<void> {
  const rows: Array<Record<string, unknown>> = [];
  for (const q of questions) {
    for (const surface of surfaces) {
      for (let sample = 1; sample <= samplesFor(surface); sample++) {
        rows.push({
          run_id: run.id,
          question_id: q.id,
          engine: surface,
          capture_method: SURFACES[surface].method,
          sample,
          status: 'pending',
        });
      }
    }
  }

  const { error } = await db()
    .from('capture_jobs')
    .upsert(rows, {
      onConflict: 'run_id,question_id,engine,capture_method,sample',
      ignoreDuplicates: true,
    });
  if (error) throw new Error(`Could not enqueue captures for run ${run.id}: ${error.message}`);
}

export async function getRun(scopeId: string, period: RunPeriod, periodStart: string): Promise<RunRow | null> {
  const { data, error } = await db()
    .from('runs')
    .select('*')
    .eq('scope_id', scopeId)
    .eq('period', period)
    .eq('period_start', periodStart)
    .limit(1);
  if (error) throw new Error(`Run lookup failed: ${error.message}`);
  return (data?.[0] as RunRow | undefined) ?? null;
}

export async function getRunById(runId: string): Promise<RunRow | null> {
  const { data, error } = await db().from('runs').select('*').eq('id', runId).limit(1);
  if (error) throw new Error(`Run lookup failed: ${error.message}`);
  return (data?.[0] as RunRow | undefined) ?? null;
}

/**
 * Add what a capture cost, atomically, and abort the run if that breaches the ceiling.
 *
 * The arithmetic and the abort both happen inside one SQL statement (0007). Doing either
 * in JavaScript loses increments across concurrent chains and leaves a gap in which
 * another capture gets claimed.
 */
export async function addRunCost(runId: string, usd: number | null): Promise<RunRow | null> {
  if (usd === null || !Number.isFinite(usd)) return null;
  const { data, error } = await db().rpc('add_run_cost', { p_run_id: runId, p_usd: usd });
  if (error) throw new Error(`Could not record run cost: ${error.message}`);

  // add_run_cost returns a composite rather than `setof`, so PostgREST renders a missing
  // run as {"id":null,...} - an object, therefore truthy. Same trap 0006 removed from
  // claim_capture_job and settle_run. Guarded here rather than in a migration because the
  // null case is defensive: this is only ever called with a run id we just claimed a job
  // from. If a third caller appears, widen it to `returns setof` and delete this comment.
  const row = data as (RunRow & { id: string | null }) | null;
  return row?.id ? (row as RunRow) : null;
}

/**
 * The only place a run is declared finished.
 *
 * Returns null when the run is not ready OR when another sweeper settled it first, and
 * those are deliberately the same answer: in both cases this caller has nothing to do and
 * must not alert. 0006 made it `returns setof` so "not ready" is an empty array rather
 * than an all-null object that reads as truthy.
 */
export async function settleRun(runId: string): Promise<RunRow | null> {
  const { data, error } = await db().rpc('settle_run', { p_run_id: runId });
  if (error) throw new Error(`Could not settle run ${runId}: ${error.message}`);
  const rows = (data ?? []) as RunRow[];
  return rows[0] ?? null;
}

/**
 * Tell somebody, once, when a run did not deliver.
 *
 * The alert claim is conditional on alerted_at being null, the same shape as
 * confirmation_sent_at in 0004: two overlapping sweeps both call this, Postgres
 * serialises them, exactly one sends. A failed send releases the claim so the next sweep
 * retries rather than the alert being lost the way the confirmation email was.
 *
 * BASELINE RUNS ARE THE LOUD CASE. A subscriber was promised a report within 24 hours of
 * paying, so there is no slack in which somebody might notice on their own. Anything other
 * than complete alerts immediately and the report holds rather than shipping short.
 */
export async function alertOnRun(run: RunRow, scopeLabel?: string): Promise<void> {
  if (run.status === 'complete') return;

  const { data, error } = await db()
    .from('runs')
    .update({ alerted_at: new Date().toISOString() })
    .eq('id', run.id)
    .is('alerted_at', null)
    .select('id');
  if (error) throw new Error(`Could not claim the run alert: ${error.message}`);
  if (!data?.length) return;

  const urgent = run.trigger_source === 'baseline';
  try {
    await sendOpsAlert({
      subject: `${urgent ? 'URGENT: first report ' : 'Run '}${run.status}: ${scopeLabel ?? run.scope_id}`,
      lines: [
        urgent
          ? 'A NEW SUBSCRIBER WAS PROMISED A REPORT WITHIN 24 HOURS AND THIS RUN DID NOT COMPLETE.'
          : 'A monthly run did not complete.',
        '',
        `Run:        ${run.id}`,
        `Scope:      ${run.scope_id}`,
        `Period:     ${run.period} ${run.period_start}`,
        `Trigger:    ${run.trigger_source}`,
        `Status:     ${run.status}`,
        `Reason:     ${run.failure_reason ?? 'none recorded'}`,
        `Expected:   ${run.captures_expected} captures`,
        `Spent:      $${Number(run.cost_usd).toFixed(4)} of $${run.cost_ceiling_usd ?? 'no'} ceiling`,
        '',
        'The report is HELD, not sent. Captures already taken are kept, so re-running',
        'this run resumes rather than starting over and paying twice.',
        '',
        'Check capture_jobs for this run_id: status=failed rows carry error and error_kind.',
      ],
    });
  } catch (err) {
    await db().from('runs').update({ alerted_at: null }).eq('id', run.id);
    console.error('Run alert failed and the claim was released:', err);
  }
}

/**
 * The first report, promised within 24 hours of payment.
 *
 * ASKS THE REAL QUESTION: does this scope have any run at all? Not "did the webhook fire",
 * not "did checkout.session.completed arrive". Session 2 established that an event
 * arriving is not the same as the work being done, and this is the same shape - except
 * here the consequence is a subscriber who paid, was promised a report inside a day, and
 * silently got nothing.
 *
 * Called from two places on purpose:
 *   - the Stripe webhook, for the fast path, minutes after payment
 *   - the daily scheduler, as the net, so a lost or mis-ordered event costs hours rather
 *     than a month
 *
 * Neither is the only route. That is the point.
 */
export async function ensureBaselineRun(
  scopeId: string,
  today = new Date().toISOString().slice(0, 10),
): Promise<{ run: RunRow; created: boolean } | null> {
  const { data, error } = await db()
    .from('runs')
    .select('id')
    .eq('scope_id', scopeId)
    .limit(1);
  if (error) throw new Error(`Could not check for existing runs: ${error.message}`);
  if (data?.length) return null;

  return startRun({
    scopeId,
    period: 'monthly',
    // A real monthly run, not a special kind. period_start is today, so the subscriber's
    // report_day run next month is a different key and there is no double cost inside one
    // billing period.
    periodStart: today,
    triggerSource: 'baseline',
  });
}

/** Live subscriptions whose scope has never had a run. The scheduler's safety net. */
export async function scopesAwaitingFirstRun(): Promise<string[]> {
  const { data, error } = await db()
    .from('subscriptions')
    .select('scope_id, status')
    .in('status', ['active', 'trialing', 'past_due']);
  if (error) throw new Error(`Could not list live subscriptions: ${error.message}`);

  const scopeIds = [...new Set((data ?? []).map((r) => (r as { scope_id: string }).scope_id))];
  if (!scopeIds.length) return [];

  const { data: runs, error: runErr } = await db()
    .from('runs')
    .select('scope_id')
    .in('scope_id', scopeIds);
  if (runErr) throw new Error(`Could not list runs: ${runErr.message}`);

  const withRuns = new Set((runs ?? []).map((r) => (r as { scope_id: string }).scope_id));
  return scopeIds.filter((id) => !withRuns.has(id));
}
