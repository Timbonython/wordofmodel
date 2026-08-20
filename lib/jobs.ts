/**
 * The work queue: claiming a capture, finishing it, and failing it out loud.
 *
 * The claim itself is SQL, in 0005. It has to be one statement - update ... where id =
 * (select ... for update skip locked) - and supabase-js cannot express that. Doing it as
 * a read then a write in JavaScript is precisely the race that cost a subscriber their
 * confirmation email in Session 2, and it would cost API calls here instead of an email.
 *
 * What this module adds is everything around the claim: turning the RPC's empty array
 * into a null nobody can mistake for work, deciding how long a retryable failure waits,
 * and making sure a job that gives up says why.
 */

import 'server-only';
import { db } from './db';
import type { CaptureJobRow } from './accounts';
import { CaptureError, type ErrorKind } from './provenance';

/**
 * Claim one job, or nothing.
 *
 * 0006 made the function `returns setof` for exactly this reason: as a plain composite,
 * PostgREST rendered "no work" as {"id":null,"run_id":null,...} - an object, therefore
 * truthy, therefore a caller writing `if (!job) return` would sail past it and run a
 * capture against a null id. An empty array cannot be misread.
 */
export async function claimJob(workerId: string, methods: string[]): Promise<CaptureJobRow | null> {
  const { data, error } = await db().rpc('claim_capture_job', {
    p_worker_id: workerId,
    p_methods: methods,
  });
  if (error) throw new Error(`Could not claim a capture job: ${error.message}`);
  const rows = (data ?? []) as CaptureJobRow[];
  return rows[0] ?? null;
}

export async function completeJob(jobId: string): Promise<void> {
  const { error } = await db()
    .from('capture_jobs')
    .update({ status: 'done', completed_at: new Date().toISOString(), error: null, error_kind: null })
    .eq('id', jobId);
  if (error) throw new Error(`Could not close capture job ${jobId}: ${error.message}`);
}

/**
 * Backoff for a retryable failure.
 *
 * 30s, 2m, 8m, 32m - quadrupling, with jitter so a rate limit that hit four chains at
 * once does not release them in lockstep and hit it again. The first wait is short
 * because most retryable failures here are transient rather than sustained: DataForSEO's
 * Internal SE Server Error and SerpApi's occasional reference-less overview both clear on
 * the next call.
 *
 * The last wait is long on purpose. Nothing in a monthly run is urgent to the minute, and
 * a surface that is genuinely down is better waited out than hammered.
 */
export function backoffMs(attempts: number): number {
  const base = 30_000 * Math.pow(4, Math.max(0, attempts - 1));
  const jitter = 0.8 + Math.random() * 0.4;
  return Math.min(Math.round(base * jitter), 45 * 60_000);
}

/**
 * Fail a job, and decide whether it gets another go.
 *
 * A permanent failure stops immediately: an auth error, a bad request, or a provenance
 * failure. Retrying a provenance failure is the worst of the three - if Perplexity
 * answered with someone else's model, asking again does not make the first answer a
 * Perplexity answer, it just buys a second chance at a coin flip we should not be
 * tossing.
 *
 * A retryable failure that has burned its attempts becomes terminal and says so, rather
 * than sitting pending forever waiting for a worker that will never make it work.
 */
export async function failJob(
  job: CaptureJobRow,
  err: unknown,
): Promise<{ terminal: boolean; kind: ErrorKind; waitMs: number | null }> {
  const kind: ErrorKind = err instanceof CaptureError ? err.kind : 'retryable';
  const message = err instanceof Error ? err.message : String(err);

  const exhausted = job.attempts >= job.max_attempts;
  const terminal = kind === 'permanent' || exhausted;
  const waitMs = terminal ? null : backoffMs(job.attempts);

  const patch: Record<string, unknown> = {
    error: message.slice(0, 500),
    error_kind: kind,
    worker_id: null,
    claimed_at: null,
  };

  if (terminal) {
    patch.status = 'failed';
    patch.completed_at = new Date().toISOString();
    if (exhausted && kind === 'retryable') {
      patch.error = `gave up after ${job.attempts} attempts: ${message}`.slice(0, 500);
    }
  } else {
    patch.status = 'pending';
    patch.next_attempt_at = new Date(Date.now() + (waitMs ?? 0)).toISOString();
  }

  const { error } = await db().from('capture_jobs').update(patch).eq('id', job.id);
  if (error) throw new Error(`Could not record the failure of job ${job.id}: ${error.message}`);

  return { terminal, kind, waitMs };
}

/**
 * Put stale claims back.
 *
 * A worker that died mid-capture leaves a job claimed forever, and forever is how long a
 * subscriber would wait. Ten minutes is comfortably past the slowest measured capture
 * (ChatGPT at 120 seconds) without being so long that a dead invocation stalls a run for
 * an hour.
 */
export async function releaseStaleJobs(staleAfter = '10 minutes'): Promise<number> {
  const { data, error } = await db().rpc('release_stale_capture_jobs', { p_stale_after: staleAfter });
  if (error) throw new Error(`Could not release stale claims: ${error.message}`);
  return (data as number) ?? 0;
}

/** Whether a run still has work. The sweeper asks this before it asks anything else. */
export async function openJobCount(runId: string): Promise<number> {
  const { count, error } = await db()
    .from('capture_jobs')
    .select('*', { count: 'exact', head: true })
    .eq('run_id', runId)
    .in('status', ['pending', 'running']);
  if (error) throw new Error(`Could not count open jobs: ${error.message}`);
  return count ?? 0;
}

/** Jobs that are pending and due now, across all runs. Drives how many chains to start. */
export async function dueJobCount(): Promise<number> {
  const { count, error } = await db()
    .from('capture_jobs')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')
    .lte('next_attempt_at', new Date().toISOString());
  if (error) throw new Error(`Could not count due jobs: ${error.message}`);
  return count ?? 0;
}
