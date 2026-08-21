/**
 * Getting one report to one subscriber, once.
 *
 * ONE FUNCTION, TWO CALLERS, AND THAT IS THE POINT. The daily scheduler sends the month's
 * reports and /api/report/send sends one by hand. Both have to hold the same three rules -
 * a partial run does not ship, the send is claimed before the email goes out, and a failed
 * send gives the claim back and says so out loud - and two copies of three rules is one
 * copy that will quietly lose one of them.
 */

import 'server-only';
import { sendOpsAlert } from './billing-mail';
import { reportUrl, sendReportEmail } from './report-mail';
import { attachDelta, buildReport } from './report';
import { asIssued, claimReportSend, releaseReportSend, reportRecipient, saveReport } from './reports';
import type { RunRow } from './accounts';

export type DeliveryOutcome =
  | { sent: true; to: string; reportId: string; url: string; forced: boolean }
  | { sent: false; reason: 'held'; status: string }
  | { sent: false; reason: 'already_sent'; reportId: string; url: string }
  | { sent: false; reason: 'failed'; error: string };

/**
 * A PARTIAL RUN DOES NOT SHIP. Session 3 settled it and this is where it bites, because
 * this is the only place a report becomes something a subscriber has seen. A run that lost
 * a capture scores over a smaller base than the month before, so it would show a movement
 * that is ours rather than their market's, and next month's delta would compare against it.
 * It holds, it alerts with what was missing, and a person decides. `force` overrides and
 * says so in the alert: sending an incomplete month is a decision, and it should leave a
 * trace.
 */
export async function deliverReport(run: RunRow, opts: { force?: boolean } = {}): Promise<DeliveryOutcome> {
  if (run.status !== 'complete' && !opts.force) {
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
        'Send it anyway with force: true against /api/report/send, or re-run the missing',
        'captures and let the scheduler pick it up.',
      ].filter(Boolean),
    });
    return { sent: false, reason: 'held', status: run.status };
  }

  const rebuilt = await attachDelta(await buildReport(run), run);
  const row = await saveReport(rebuilt, run);
  const report = await asIssued(rebuilt, row);
  const { email } = await reportRecipient(run.scope_id);

  // Claim first, send second. The other order sends twice when two callers race, and there
  // are now two callers.
  if (!(await claimReportSend(row.id))) {
    return { sent: false, reason: 'already_sent', reportId: row.id, url: reportUrl(run.id) };
  }

  try {
    await sendReportEmail({ to: email, report });
  } catch (err) {
    // Give the claim back so the next pass is a retry rather than a silence, then say so
    // loudly. A report nobody receives and nobody is told about is the failure this whole
    // path is arranged around.
    await releaseReportSend(row.id);
    const error = err instanceof Error ? err.message : String(err);
    await sendOpsAlert({
      subject: `Report send FAILED for ${email}`,
      lines: [
        `Run ${run.id}, scope ${run.scope_id}, period ${run.period_start}.`,
        `Report ${row.id}. The send claim has been released, so a retry will pick it up.`,
        '',
        error,
      ],
    });
    return { sent: false, reason: 'failed', error };
  }

  return {
    sent: true,
    to: email,
    reportId: row.id,
    url: reportUrl(run.id),
    forced: run.status !== 'complete',
  };
}
