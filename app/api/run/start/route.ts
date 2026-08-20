/**
 * The manual trigger. Same code path as the cron, on purpose.
 *
 * The session brief asked for a way to run one on demand, and for both paths to go
 * through the same code. They do: this calls startRun exactly as the scheduler does, so a
 * run started by hand is indistinguishable from a scheduled one except for
 * trigger_source, which is recorded rather than inferred.
 *
 *   curl -X POST $SITE/api/run/start \
 *        -H "Authorization: Bearer $CRON_SECRET" \
 *        -H 'Content-Type: application/json' \
 *        -d '{"scopeId":"..."}'
 */

import { authorised, unauthorised, kickChains, CHAINS } from '@/lib/cron';
import { startRun } from '@/lib/run';
import { dueJobCount } from '@/lib/jobs';
import type { RunPeriod } from '@/lib/scope';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  if (!authorised(req)) return unauthorised();

  let body: { scopeId?: string; period?: RunPeriod; periodStart?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'expected a JSON body' }, { status: 400 });
  }

  if (!body.scopeId) return Response.json({ error: 'scopeId is required' }, { status: 400 });

  const period: RunPeriod = body.period ?? 'monthly';
  const periodStart = body.periodStart ?? new Date().toISOString().slice(0, 10);

  try {
    const { run, created } = await startRun({
      scopeId: body.scopeId,
      period,
      periodStart,
      triggerSource: 'manual',
    });

    const pending = await dueJobCount();
    const kicked = pending > 0 ? await kickChains(Math.min(CHAINS, pending)) : 0;

    // created:false is not an error. It means this run already existed and we have fallen
    // in behind it - which is what makes the trigger safe to hit twice.
    return Response.json({
      run: run.id,
      created,
      period: run.period,
      periodStart: run.period_start,
      capturesExpected: run.captures_expected,
      surfaces: run.surfaces,
      samples: run.samples,
      pending,
      kicked,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
