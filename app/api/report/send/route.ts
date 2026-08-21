/**
 * Generate the report for a run, write it down, and send it once.
 *
 *   curl -X POST $SITE/api/report/send \
 *        -H "Authorization: Bearer $CRON_SECRET" \
 *        -H 'Content-Type: application/json' \
 *        -d '{"runId":"...","force":false}'
 *
 * Behind the same shared secret as the run routes: it spends nothing on engines, but it is
 * the thing that puts a document in a paying subscriber's inbox, and that is not a URL to
 * leave open.
 *
 * A PARTIAL RUN DOES NOT SHIP. It is the rule Session 3 settled and it lives here, because
 * this route is the only place a report becomes something a subscriber has seen. A run that
 * lost a capture has a Share of Model computed over a smaller base than the month before,
 * and shipping it produces a movement nobody can explain and a delta next month comparing
 * against it. It holds, it alerts, and somebody decides. `force` overrides and says so in
 * the alert, because the decision to send an incomplete month is a person's to make and
 * should leave a trace.
 *
 * SAFE TO CALL TWICE, and it will be: the daily scheduler, a retry, and Tim with curl. The
 * send is claimed with a conditional update, so exactly one of them sends.
 */

import { authorised, unauthorised } from '@/lib/cron';
import { getRunById } from '@/lib/run';
import { attachDelta, buildReport } from '@/lib/report';
import { asIssued, claimReportSend, releaseReportSend, reportRecipient, saveReport } from '@/lib/reports';
import { reportUrl, sendReportEmail } from '@/lib/report-mail';
import { sendOpsAlert } from '@/lib/billing-mail';

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

  if (run.status !== 'complete' && !body.force) {
    await sendOpsAlert({
      subject: `Report held: run ${run.id.slice(0, 8)} is ${run.status}`,
      lines: [
        `Scope ${run.scope_id}, period ${run.period_start}.`,
        `Expected ${run.captures_expected} captures. Status ${run.status}.`,
        run.failure_reason ? `Reason: ${run.failure_reason}` : '',
        '',
        'Nothing was sent. A run that lost a capture scores over a smaller base than last',
        'month, so it would show a movement that is ours rather than theirs.',
        '',
        `Send it anyway with force: true against /api/report/send, or re-run the missing`,
        `captures and let the scheduler pick it up.`,
      ].filter(Boolean),
    });
    return Response.json({ sent: false, held: true, status: run.status }, { status: 409 });
  }

  const rebuilt = await attachDelta(await buildReport(run), run);
  const row = await saveReport(rebuilt, run);
  const report = await asIssued(rebuilt, row);
  const { email } = await reportRecipient(run.scope_id);

  // Claim first, send second. The other order sends twice when two callers race.
  const claimed = await claimReportSend(row.id);
  if (!claimed) {
    return Response.json({ sent: false, alreadySent: true, reportId: row.id, url: reportUrl(run.id) });
  }

  try {
    await sendReportEmail({ to: email, report });
  } catch (err) {
    // Give the claim back so the next pass is a retry rather than a silence, then say so
    // loudly. A report nobody receives and nobody is told about is the failure mode this
    // whole route is arranged around.
    await releaseReportSend(row.id);
    const reason = err instanceof Error ? err.message : String(err);
    await sendOpsAlert({
      subject: `Report send FAILED for ${email}`,
      lines: [
        `Run ${run.id}, scope ${run.scope_id}, period ${run.period_start}.`,
        `Report ${row.id}. The send claim has been released, so a retry will pick it up.`,
        '',
        reason,
      ],
    });
    return Response.json({ sent: false, error: reason }, { status: 502 });
  }

  return Response.json({
    sent: true,
    to: email,
    reportId: row.id,
    forced: run.status !== 'complete',
    url: reportUrl(run.id),
  });
}
