/**
 * The safety net, and the only arbiter of whether a run is finished.
 *
 * Runs every five minutes and does three things nothing else does:
 *
 *   1. Puts stale claims back. A worker that died mid-capture leaves a job claimed
 *      forever, and forever is how long the subscriber waits.
 *   2. Restarts tick chains for runs with work still pending. A chain that failed to hand
 *      on is invisible to everything except this.
 *   3. Asks the real question of every open run - are all its jobs terminal, and how many
 *      captures actually landed - and settles it.
 *
 * Point 3 is the one that matters. No tick settles a run. If the sweeper did not exist, a
 * run whose last chain died would sit "running" indefinitely and nobody would be told.
 */

import { authorised, unauthorised, kickChains, CHAINS } from '@/lib/cron';
import { releaseStaleJobs, openJobCount, dueJobCount } from '@/lib/jobs';
import { settleRun, alertOnRun } from '@/lib/run';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import type { RunRow } from '@/lib/accounts';

// 300, not 60. A run that did not deliver waits for its extraction to finish before the
// alert goes out, so the email carries the numbers rather than telling somebody to go and
// look. Extraction over 55 captures at concurrency 4 took 29 seconds measured.
export const maxDuration = 300;

/** Kick the extraction pass for a settled run. Fire and forget, like the tick chains. */
async function extractRun(runId: string, wait: boolean): Promise<void> {
  await fetch(`${env.siteUrl}/api/run/extract`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.cronSecret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ runId }),
    // A complete run does not need waiting on: nobody is blocked and the report is built
    // later. A run that did not deliver is waited for, because the alert about it is
    // supposed to say what landed, and it cannot until the captures are interpreted.
    signal: AbortSignal.timeout(wait ? 120_000 : 2_000),
  }).catch(() => {
    // Fire and forget: a timeout on the short path means it started and is working. On the
    // wait path it means extraction is slow, and the alert goes out with capture counts and
    // no score rather than not going out at all.
  });
}
export const dynamic = 'force-dynamic';

async function handle(req: Request): Promise<Response> {
  if (!authorised(req)) return unauthorised();

  const released = await releaseStaleJobs();

  const { data, error } = await db()
    .from('runs')
    .select('*')
    .in('status', ['pending', 'running']);
  if (error) throw new Error(`Could not list open runs: ${error.message}`);
  const open = (data ?? []) as RunRow[];

  const settled: Array<{ run: string; status: string; reason: string | null }> = [];
  let stillWorking = 0;

  for (const run of open) {
    if ((await openJobCount(run.id)) > 0) {
      stillWorking++;
      continue;
    }
    // Every job is terminal. Count the captures, not the jobs.
    const finished = await settleRun(run.id);
    // null means another sweep settled it first and holds the alert claim. Say nothing.
    if (!finished) continue;
    settled.push({ run: finished.id, status: finished.status, reason: finished.failure_reason });

    // EXTRACT EVERY SETTLED RUN, NOT JUST THE COMPLETE ONES.
    //
    // This used to fire only on 'complete', which left a partial run holding paid-for
    // captures with no interpretation - and the person deciding whether to ship it or
    // re-run it could not see what they had. Found the first time a run actually went
    // partial, on 20 Aug 2026, when xAI was at capacity.
    //
    // Holding is about not SHIPPING. Interpretation costs no engine call, is re-runnable,
    // and is precisely what the decision needs. A partial run that cannot be read is a
    // partial run nobody can act on.
    //
    // Never allowed to break the sweep: extraction is safe to run twice, so a lost trigger
    // costs one cycle. The captures are already paid for either way.
    const needsAlert = finished.status !== 'complete';
    await extractRun(finished.id, needsAlert).catch((err) =>
      console.error(`sweep: could not start extraction for run ${finished.id}`, err),
    );

    // Alerted AFTER extraction so the email carries the numbers. The claim inside
    // alertOnRun is still atomic, so two overlapping sweeps cannot both send.
    await alertOnRun(finished);
  }

  // One kick covers every run with work: the claim is global and takes whatever is next.
  const due = await dueJobCount();
  const kicked = due > 0 ? await kickChains(Math.min(CHAINS, due)) : 0;

  return Response.json({ released, open: open.length, stillWorking, settled, due, kicked });
}

export async function GET(req: Request): Promise<Response> {
  return handle(req);
}

export async function POST(req: Request): Promise<Response> {
  return handle(req);
}
