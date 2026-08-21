/**
 * The report as a stored fact, and the rules for reading it back.
 *
 * 0008 exists because the diagnosis is produced by thresholds that are CHOSEN. Rendered
 * fresh every time, a revision at ten subscribers would silently re-label every report ever
 * sent: a subscriber opens last March and finds it saying something different from what
 * they read in March, with nothing to explain it. So the figures and the versions that
 * produced them are written down once, and the page is rendered from the record.
 *
 * THAT PROMISE IS KEPT HERE, not in the migration. saveReport writes the row once and
 * never overwrites it, and asIssued() puts the stored figures back into a freshly assembled
 * report before it is rendered. The evidence is re-read from captures every time - it is
 * immutable anyway, and 218KB of verbatim answers has no business being duplicated into a
 * jsonb column - but nothing a threshold touches is recomputed for a report that already
 * exists.
 *
 * WHEN THE TWO DISAGREE, THE RECORD WINS AND SOMEBODY IS TOLD. A rebuild that produces a
 * different Share of Model from the one on file means the evidence changed underneath a
 * report we have already sent, which is either a re-extraction or a bug and is never
 * nothing. The subscriber keeps reading what they were sent; Tim gets the alert.
 */

import 'server-only';
import { db } from './db';
import { describe, type Diagnosis } from './diagnosis';
import { sendOpsAlert } from './billing-mail';
import type { DeltaReport } from './delta';
import type { ReportData } from './report';
import type { RunRow } from './accounts';

export interface ReportRow {
  id: string;
  run_id: string;
  scope_id: string;
  threshold_version: number;
  extraction_version: number;
  presence: number | null;
  presence_pairs: number;
  recognised: number;
  endorsed: number;
  asked_directly: number;
  diagnosis: Diagnosis;
  delta: DeltaReport | null;
  generated_at: string;
  sent_at: string | null;
}

/** Numeric columns arrive as numbers or as strings depending on the driver. Pin it. */
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

function asRow(raw: Record<string, unknown>): ReportRow {
  return { ...(raw as unknown as ReportRow), presence: numOrNull(raw.presence) };
}

export async function getReportForRun(runId: string): Promise<ReportRow | null> {
  const { data, error } = await db().from('reports').select('*').eq('run_id', runId).maybeSingle();
  if (error) throw new Error(`Report lookup failed: ${error.message}`);
  return data ? asRow(data as Record<string, unknown>) : null;
}

/**
 * Write the report down, or return what was already written.
 *
 * NEVER AN UPSERT. A second report for the same run would be two different answers to the
 * same month, and the second one would be the one that arrived after we changed something.
 * The unique constraint on run_id is the guard; a conflict is the ordinary case on every
 * render after the first, not an error.
 */
export async function saveReport(report: ReportData, run: RunRow): Promise<ReportRow> {
  const existing = await getReportForRun(run.id);
  if (existing) return existing;

  const { data, error } = await db()
    .from('reports')
    .insert({
      run_id: run.id,
      scope_id: run.scope_id,
      threshold_version: report.versions.threshold,
      extraction_version: report.versions.extraction,
      presence: report.presence.shareOfModel,
      presence_pairs: report.presence.pairs,
      recognised: report.endorsement.recognised,
      endorsed: report.endorsement.endorsed,
      asked_directly: report.endorsement.askedDirectly,
      diagnosis: report.diagnosis.kind,
      delta: report.delta,
    })
    .select()
    .single();

  // Two renders of the same report at the same moment is an ordinary race - the subscriber
  // opening the page while the email job is building it. Whoever lost re-reads the winner's
  // row rather than failing, and the row they get is the one that will be sent.
  if (error) {
    const raced = await getReportForRun(run.id);
    if (raced) return raced;
    throw new Error(`Could not store the report for run ${run.id}: ${error.message}`);
  }
  return asRow(data as Record<string, unknown>);
}

/**
 * The report as it was first issued: stored figures, stored label, stored delta.
 *
 * Everything else on the page - the quotes, the grid, the evidence, the method note - comes
 * from captures, which do not move. What comes back from the record is exactly what a
 * threshold could otherwise change underneath a subscriber.
 */
export async function asIssued(report: ReportData, row: ReportRow): Promise<ReportData> {
  const drift = driftBetween(report, row);
  if (drift.length) {
    await sendOpsAlert({
      subject: `Report ${row.id.slice(0, 8)} no longer rebuilds to what was sent`,
      lines: [
        `Run ${row.run_id}, scope ${row.scope_id}.`,
        `Issued ${row.generated_at}${row.sent_at ? `, sent ${row.sent_at}` : ', never sent'}.`,
        '',
        ...drift,
        '',
        'The subscriber is being shown the stored figures, which is what they were sent.',
        'A re-extraction explains this; anything else is a bug worth finding.',
      ],
    });
  }

  return {
    ...report,
    versions: { threshold: row.threshold_version, extraction: row.extraction_version },
    presence: { ...report.presence, shareOfModel: row.presence, pairs: row.presence_pairs },
    endorsement: {
      recognised: row.recognised,
      endorsed: row.endorsed,
      askedDirectly: row.asked_directly,
    },
    diagnosis: describe(row.diagnosis, {
      presence: row.presence,
      recognised: row.recognised,
      endorsed: row.endorsed,
      askedDirectly: row.asked_directly,
    }),
    delta: row.delta,
  };
}

/**
 * PRECISION MATTERS HERE AND IS NOT A COINCIDENCE. reports.presence is numeric(6,4) and
 * shareOfModel() rounds to four decimals, so a stored 0.0926 and a rebuilt 0.0926 compare
 * equal. If either side ever changes precision this comparison starts failing on every
 * render and alerts Tim once per page view, which is how a useful alert gets muted.
 */
function driftBetween(report: ReportData, row: ReportRow): string[] {
  const out: string[] = [];
  const rebuilt = report.presence.shareOfModel;
  if (numOrNull(rebuilt) !== numOrNull(row.presence)) {
    out.push(`Share of Model on file ${row.presence}, rebuilds to ${rebuilt}.`);
  }
  if (report.endorsement.endorsed !== row.endorsed) {
    out.push(`Endorsement on file ${row.endorsed}, rebuilds to ${report.endorsement.endorsed}.`);
  }
  if (report.endorsement.recognised !== row.recognised) {
    out.push(`Recognition on file ${row.recognised}, rebuilds to ${report.endorsement.recognised}.`);
  }
  if (report.diagnosis.kind !== row.diagnosis) {
    out.push(`Diagnosis on file ${row.diagnosis}, rebuilds to ${report.diagnosis.kind}.`);
  }
  if (report.versions.extraction !== row.extraction_version) {
    out.push(`Read at version ${row.extraction_version}, captures now read at ${report.versions.extraction}.`);
  }
  return out;
}

/**
 * Who this report goes to.
 *
 * THROWS RATHER THAN RETURNING NULL, and that is the Session 2 lesson in its other half.
 * The confirmation email had `if (email && scope)` around its send, so a missing address
 * produced no email and no error and no way to find out. A report with nowhere to go is a
 * subscriber's month silently not delivered; it belongs in the failure path where the alert
 * lives, not in an if that quietly does nothing.
 */
export async function reportRecipient(scopeId: string): Promise<{ email: string; accountId: string }> {
  const { data: scope, error: scopeErr } = await db()
    .from('scopes')
    .select('account_id')
    .eq('id', scopeId)
    .maybeSingle();
  if (scopeErr) throw new Error(`Scope lookup failed for ${scopeId}: ${scopeErr.message}`);
  if (!scope) throw new Error(`Scope ${scopeId} does not exist, so its report has nobody to go to.`);
  const accountId = (scope as { account_id: string }).account_id;

  const { data: account, error: accErr } = await db()
    .from('accounts')
    .select('email')
    .eq('id', accountId)
    .maybeSingle();
  if (accErr) throw new Error(`Account lookup failed for ${accountId}: ${accErr.message}`);
  const email = (account as { email: string } | null)?.email?.trim();
  if (!email) throw new Error(`Account ${accountId} has no email address, so its report cannot be sent.`);

  return { email, accountId };
}

/**
 * Claim the send, atomically.
 *
 * THE SESSION 2 LESSON, APPLIED BEFORE IT COSTS ANYTHING THIS TIME. The confirmation email
 * was gated on "did this handler insert the row", two deliveries raced, and a subscriber
 * paid and was never told. "Have we generated this report" is not "has this report been
 * sent". So the send is claimed with a conditional update and Postgres decides the winner:
 * a scheduler retry, a manual trigger and a redelivery can all run at once and exactly one
 * email goes out.
 */
export async function claimReportSend(reportId: string): Promise<boolean> {
  const { data, error } = await db()
    .from('reports')
    .update({ sent_at: new Date().toISOString() })
    .eq('id', reportId)
    .is('sent_at', null)
    .select('id');
  if (error) throw new Error(`Could not claim the report send: ${error.message}`);
  return (data ?? []).length > 0;
}

/** A failed send gives the claim back, so the next attempt is a retry and not a silence. */
export async function releaseReportSend(reportId: string): Promise<void> {
  const { error } = await db().from('reports').update({ sent_at: null }).eq('id', reportId);
  if (error) console.error(`Could not release the report send claim for ${reportId}: ${error.message}`);
}
