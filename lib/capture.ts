/**
 * Running one claimed job: ask the surface, store the evidence, pay for it.
 *
 * The unit of work is deliberately tiny. One capture per invocation, because ChatGPT
 * alone averaged 83 seconds and peaked at 120 across real scans, and fifty five of those
 * serially is half an hour that no serverless platform will hold open. Small units also
 * mean an invocation dying costs one capture, not a run.
 */

import 'server-only';
import { db } from './db';
import { env } from './env';
import { engineFor } from './engines';
import { CaptureError } from './provenance';
import { completeJob, failJob } from './jobs';
import { addRunCost } from './run';
import type { CaptureJobRow } from './accounts';
import type { Locality } from './geo';

interface JobContext {
  questionText: string;
  marketCountry: string;
  /** Null on a country scope, which is most of them. */
  locality: Locality | null;
}

/**
 * Rebuild the resolved locality from the four scope columns.
 *
 * Read from the scope on every job rather than resolved here, because resolution happens
 * once at approval against SerpApi's gazetteer and a capture must never re-derive it: two
 * captures in the same run resolving differently would be one report measured against two
 * towns. The columns are the record of what was decided.
 */
function localityOf(row: {
  locality: string | null;
  locality_canonical: string | null;
  locality_city: string | null;
  locality_region: string | null;
}): Locality | null {
  if (!row.locality) return null;
  return {
    input: row.locality,
    canonical: row.locality_canonical,
    city: row.locality_city,
    region: row.locality_region,
  };
}

/**
 * The question and the market this job is for.
 *
 * market_country, never scopes.market. The free-text market column held "burner phone
 * numbers" on the only scope that ever existed, because the wizard field was labelled
 * "Primary market" and validated as eighty characters of anything. Every geo parameter
 * derives from the ISO column and nothing else.
 */
async function contextFor(job: CaptureJobRow): Promise<JobContext> {
  const { data, error } = await db()
    .from('questions')
    .select(
      'text, scopes!inner(market_country, locality, locality_canonical, locality_city, locality_region)',
    )
    .eq('id', job.question_id)
    .single();
  if (error || !data) throw new Error(`Could not read question ${job.question_id}: ${error?.message}`);

  const row = data as unknown as {
    text: string;
    scopes: {
      market_country: string;
      locality: string | null;
      locality_canonical: string | null;
      locality_city: string | null;
      locality_region: string | null;
    };
  };
  return {
    questionText: row.text,
    marketCountry: row.scopes.market_country,
    locality: localityOf(row.scopes),
  };
}

/**
 * Has this exact capture already been taken?
 *
 * THE IDEMPOTENCY GUARANTEE, and it is about money rather than tidiness. The dangerous
 * sequence is: engine answers, capture row written, completeJob fails, job goes back to
 * pending, worker claims it again. Without this check the surface is asked a second time
 * and we pay twice for evidence we already hold, and the unique index refuses the write
 * afterwards so the second payment buys nothing at all.
 *
 * Checked BEFORE the engine call, which is the only place the check is worth anything.
 */
async function alreadyCaptured(job: CaptureJobRow): Promise<boolean> {
  const { data, error } = await db()
    .from('captures')
    .select('id')
    .eq('run_id', job.run_id)
    .eq('question_id', job.question_id)
    .eq('engine', job.engine)
    .eq('capture_method', job.capture_method)
    .eq('sample', job.sample)
    .limit(1);
  if (error) throw new Error(`Could not check for an existing capture: ${error.message}`);
  return Boolean(data?.length);
}

export interface CaptureOutcome {
  jobId: string;
  status: 'captured' | 'already_captured' | 'retrying' | 'failed';
  detail?: string;
  costUsd?: number | null;
  aborted?: boolean;
}

/**
 * Run one job to a terminal state. Never throws for an engine failure: a failure is a
 * recorded outcome with a reason, and a tick that threw would lose the classification
 * that decides whether the job is retried.
 */
export async function runCaptureJob(job: CaptureJobRow): Promise<CaptureOutcome> {
  if (await alreadyCaptured(job)) {
    await completeJob(job.id);
    return { jobId: job.id, status: 'already_captured' };
  }

  let ctx: JobContext;
  try {
    ctx = await contextFor(job);
  } catch (err) {
    const r = await failJob(job, new CaptureError(String(err), 'permanent'));
    return { jobId: job.id, status: 'failed', detail: `context: ${String(err)}`, ...r };
  }

  try {
    const engine = engineFor(job.engine);
    const result = await engine.run({
      question: ctx.questionText,
      country: ctx.marketCountry,
      locality: ctx.locality,
    });

    const { error } = await db()
      .from('captures')
      .insert({
        run_id: job.run_id,
        question_id: job.question_id,
        engine: job.engine,
        capture_method: job.capture_method,
        sample: job.sample,
        outcome: result.outcome,
        answer_text: result.answerText,
        model_used: result.modelUsed,
        provider: result.provider,
        grounded: result.grounded,
        search_calls: result.searchCalls,
        // The response only. Never the request: it carries our credentials, and 0005
        // grants subscribers read access to this column because it is their evidence.
        raw_response: result.raw,
        citations: result.citations,
        geo_sent: result.geoSent,
        vercel_region: env.vercelRegion,
        tokens_in: result.tokensIn,
        tokens_out: result.tokensOut,
        tokens: result.tokensTotal,
        cost_usd: result.costUsd,
        cost_source: result.costSource,
        latency_ms: result.latencyMs,
      });

    // A duplicate here means another worker captured it between our check and our write.
    // Their row is the evidence; ours would have been identical and is not worth a
    // failure. The money is already spent either way.
    if (error && !/duplicate|unique/i.test(error.message)) {
      throw new CaptureError(`could not store the capture: ${error.message}`, 'retryable');
    }

    await completeJob(job.id);

    // Cost is added AFTER the capture is stored. If this fails, the run under-reports its
    // spend, which is recoverable by summing captures.cost_usd. Adding it first and then
    // failing to store would charge a run for evidence it does not have.
    const run = await addRunCost(job.run_id, result.costUsd);

    return {
      jobId: job.id,
      status: 'captured',
      detail: `${job.engine} sample ${job.sample}: ${result.outcome}`,
      costUsd: result.costUsd,
      aborted: run?.status === 'aborted',
    };
  } catch (err) {
    const r = await failJob(job, err);
    return {
      jobId: job.id,
      status: r.terminal ? 'failed' : 'retrying',
      detail: `${job.engine} sample ${job.sample}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
