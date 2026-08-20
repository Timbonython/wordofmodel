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

export const maxDuration = 60;

/** Kick the extraction pass for a settled run. Fire and forget, like the tick chains. */
async function extractRun(runId: string): Promise<void> {
  await fetch(`${env.siteUrl}/api/run/extract`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.cronSecret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ runId }),
    signal: AbortSignal.timeout(2_000),
  }).catch(() => {
    // A timeout means it started and is working, which is the expected case.
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
    await alertOnRun(finished);

    // A complete run's captures are ready to interpret. Fired here rather than from the
    // tick that finished the last job, for the same reason nothing else settles a run: the
    // sweeper is the only thing that knows the run is done.
    //
    // Fire and forget, and never allowed to break the sweep. Extraction costs no engine
    // call and is safe to run twice, so the worst case of a lost trigger is that the next
    // sweep starts it - or somebody runs it by hand. The captures are already paid for.
    if (finished.status === 'complete') {
      void extractRun(finished.id).catch((err) =>
        console.error(`sweep: could not start extraction for run ${finished.id}`, err),
      );
    }
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
