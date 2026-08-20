/**
 * One capture, then hand on.
 *
 * ONE CAPTURE PER INVOCATION, deliberately. A single capture is bounded by the engine
 * timeout (240s at worst) against a 300s function limit, so there is no wall-clock
 * arithmetic to get wrong and no invocation can be killed mid-call. Batching several
 * captures per invocation would cut the invocation count and introduce a budget
 * calculation that is wrong exactly when ChatGPT is slow - which is the case that matters.
 *
 * THIS ROUTE NEVER DECIDES A RUN IS FINISHED. It closes its own job. The sweeper counts
 * rows and settles. "I finished the last job" is not "this subscriber has a complete
 * report", in the same way "did I insert the row" was not "has this person been told".
 */

import { after } from 'next/server';
import { authorised, unauthorised, kickChains } from '@/lib/cron';
import { claimJob } from '@/lib/jobs';
import { runCaptureJob } from '@/lib/capture';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  if (!authorised(req)) return unauthorised();

  const workerId = `tick-${crypto.randomUUID().slice(0, 8)}`;

  // An empty array from claim_capture_job is unambiguous; before 0006 it was an object
  // full of nulls, which is truthy, and this early return would never have fired.
  const job = await claimJob(workerId, ['api', 'serp']);
  if (!job) return Response.json({ idle: true, worker: workerId });

  const outcome = await runCaptureJob(job);

  // Hand the chain on after the response. The successor claims whatever is next, or
  // finds nothing and stops - one spare invocation per chain, which is cheaper than
  // asking the database whether it is worth continuing.
  //
  // If this never fires, the five-minute sweeper restarts the chains. Nothing here is
  // the only route to the work getting done.
  after(async () => {
    try {
      await kickChains(1);
    } catch (err) {
      console.error('tick: could not hand the chain on', err);
    }
  });

  return Response.json({ worker: workerId, ...outcome });
}
