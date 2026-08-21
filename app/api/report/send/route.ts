/**
 * Send one report, by hand.
 *
 *   curl -X POST $SITE/api/report/send \
 *        -H "Authorization: Bearer $CRON_SECRET" \
 *        -H 'Content-Type: application/json' \
 *        -d '{"runId":"...","force":false}'
 *
 * The daily scheduler sends the month's reports on its own; this is the override, and it is
 * the only way to ship a run that went `partial` after somebody has looked at why. Behind
 * the same shared secret as the run routes: it spends nothing on engines, but it is what
 * puts a document in a paying subscriber's inbox.
 *
 * Every rule lives in deliverReport, shared with the scheduler, so the two callers cannot
 * drift apart on which runs may ship and how the send is claimed.
 */

import { authorised, unauthorised } from '@/lib/cron';
import { getRunById } from '@/lib/run';
import { deliverReport } from '@/lib/deliver';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  if (!authorised(req)) return unauthorised();

  let body: { runId?: string; force?: boolean };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'expected a JSON body' }, { status: 400 });
  }
  if (!body.runId) return Response.json({ error: 'runId is required' }, { status: 400 });

  const run = await getRunById(body.runId);
  if (!run) return Response.json({ error: 'no such run' }, { status: 404 });

  const outcome = await deliverReport(run, { force: body.force });

  if (outcome.sent) return Response.json(outcome);
  if (outcome.reason === 'held') return Response.json(outcome, { status: 409 });
  if (outcome.reason === 'already_sent') return Response.json(outcome);
  return Response.json(outcome, { status: 502 });
}
