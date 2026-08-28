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
 * different headline figure from the one on file means the evidence changed underneath a
 * report we have already sent, which is either a re-extraction or a bug and is never
 * nothing. The subscriber keeps reading what they were sent; Tim gets the alert.
 */

import 'server-only';
import { db } from './db';
import { describe, type Diagnosis } from './diagnosis';
import { sendOpsAlert } from './billing-mail';
import { LIVE_STATUSES } from './billing';
import type { DeltaReport } from './delta';
import type { ReportData } from './report';
import type { RunRow } from './accounts';

export interface ReportRow {
  id: string;
  run_id: string;
  scope_id: string;
  threshold_version: number;
  extraction_version: number;
  metric_version: number;
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
      metric_version: report.versions.metric,
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
  if (!drift.length) return renderFrom(report, row);

  // AN UNSENT REPORT IS PROVISIONAL, AND RE-ISSUING IT IS NOT A BREACH OF 0008.
  //
  // The promise is that a report somebody has READ keeps saying what it said. A row with a
  // null sent_at has been read by nobody: it is a draft this code wrote on its way past,
  // usually because a page render or a held partial run beat the send. Defending it would
  // pin a subscriber's first report to figures produced before a re-extraction, and it
  // would alert Tim on every page view for the rest of that run's life, which is how a real
  // alert gets muted. So it is rewritten quietly, and the alert is saved for the case it
  // exists for.
  //
  // The update is conditional on sent_at still being null, so a send claimed a millisecond
  // ago wins and the figures that went out are the ones that stand.
  if (!row.sent_at) {
    const reissued = await reissue(report, row);
    if (reissued) return renderFrom(report, reissued);
  }

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
  return renderFrom(report, row);
}

/**
 * Rewrite an unsent row to today's rebuild. Returns null when somebody claimed the send in
 * between, in which case what they sent is the record and this must not touch it.
 */
async function reissue(report: ReportData, row: ReportRow): Promise<ReportRow | null> {
  const { data, error } = await db()
    .from('reports')
    .update({
      threshold_version: report.versions.threshold,
      extraction_version: report.versions.extraction,
      metric_version: report.versions.metric,
      presence: report.presence.shareOfModel,
      presence_pairs: report.presence.pairs,
      recognised: report.endorsement.recognised,
      endorsed: report.endorsement.endorsed,
      asked_directly: report.endorsement.askedDirectly,
      diagnosis: report.diagnosis.kind,
      delta: report.delta,
      generated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .is('sent_at', null)
    .select()
    .maybeSingle();
  if (error) throw new Error(`Could not re-issue the unsent report ${row.id}: ${error.message}`);
  return data ? asRow(data as Record<string, unknown>) : null;
}

/**
 * The report as the record has it: stored figures, stored label, stored delta.
 *
 * Everything else on the page - the quotes, the grid, the evidence, the method note - comes
 * from captures, which do not move. What comes back from the record is exactly what a
 * threshold could otherwise change underneath a subscriber.
 */
function renderFrom(report: ReportData, row: ReportRow): ReportData {
  return {
    ...report,
    versions: {
      threshold: row.threshold_version,
      extraction: row.extraction_version,
      metric: row.metric_version,
    },
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
    out.push(`Naming rate on file ${row.presence}, rebuilds to ${rebuilt}.`);
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
  if (report.versions.metric !== row.metric_version) {
    out.push(
      `Issued under headline definition v${row.metric_version}, today's code computes v${report.versions.metric}. ` +
        `The stored figures are the ones that were sent.`,
    );
  }
  return out;
}

/**
 * Complete runs whose report has not gone out, newest first.
 *
 * THE SCHEDULER'S QUESTION, ASKED OF THE DATA RATHER THAN OF A FLAG. Same discipline as
 * scopesAwaitingFirstRun: "is there a live subscriber holding a finished run nobody has
 * been sent" is answerable from the tables, so nothing depends on a previous pass having
 * set something. A missed cron, a deploy mid-run, a send that threw - all of them are just
 * a row that still qualifies tomorrow.
 *
 * Bounded two ways. Only runs inside `withinDays`, so a run marked complete after months in
 * a drawer does not surprise somebody with an ancient month. Only scopes with a live
 * subscription, so a cancelled account stops receiving reports the way they expect it to.
 */
export async function runsAwaitingReport(withinDays = 45, limit = 25): Promise<RunRow[]> {
  const since = new Date(Date.now() - withinDays * 86_400_000).toISOString().slice(0, 10);

  const { data: subs, error: subErr } = await db()
    .from('subscriptions')
    .select('scope_id')
    .in('status', LIVE_STATUSES);
  if (subErr) throw new Error(`Could not list live subscriptions: ${subErr.message}`);
  const live = new Set((subs ?? []).map((s) => (s as { scope_id: string }).scope_id));
  if (!live.size) return [];

  const { data: runs, error: runErr } = await db()
    .from('runs')
    .select('*')
    .eq('status', 'complete')
    .gte('period_start', since)
    .in('scope_id', [...live])
    .order('period_start', { ascending: false })
    .limit(limit * 2);
  if (runErr) throw new Error(`Could not list complete runs: ${runErr.message}`);

  const candidates = (runs ?? []) as RunRow[];
  if (!candidates.length) return [];

  const unsent = await withoutSentReport(candidates);
  if (!unsent.length) return [];

  // AND ONLY ONCE EVERY CAPTURE HAS BEEN READ. The sweep settles a run and then fires the
  // extraction pass without waiting for it, so for a minute or so a complete run holds
  // captures with a null extracted_at. Those are excluded from the score everywhere, by
  // design - which means a report built in that window is not incomplete, it is WRONG: a
  // a naming rate over a smaller denominator, stored as the record and emailed. Waiting
  // costs one sweep cycle. Extraction over 55 captures measured 29 seconds.
  const { data: pending, error: capErr } = await db()
    .from('captures')
    .select('run_id')
    .in('run_id', unsent.map((r) => r.id))
    .is('extracted_at', null);
  if (capErr) throw new Error(`Could not check extraction state: ${capErr.message}`);
  const stillReading = new Set((pending ?? []).map((c) => (c as { run_id: string }).run_id));

  return unsent.filter((r) => !stillReading.has(r.id)).slice(0, limit);
}

/**
 * Complete runs whose report has been sitting undelivered for too long.
 *
 * THE NET UNDER THE SWEEP. Delivery lives in the five-minute sweep so a new subscriber has
 * their first report about twenty minutes after paying, rather than at the next 06:00. The
 * cost of that speed is a quiet failure mode: a run whose extraction never finishes is
 * never ready, so it is never delivered, and nothing says so. Waiting for a report that
 * will never come is exactly the silence this build keeps refusing.
 *
 * So the daily pass stops delivering and starts noticing. Anything complete, unsent, older
 * than `hours` AND belonging to somebody who is waiting for it is something a person should
 * look at.
 *
 * ONLY RUNS SOMEBODY IS WAITING FOR, and that qualifier was added on 28 Aug 2026 after this
 * check spent a day flagging a run that was working exactly as intended.
 *
 * The original asked "is there a complete run whose report has not gone out?" and never asked
 * WHO IS WAITING. The promise it protects is to a paying subscriber - "your first report lands
 * within 24 hours" - so a run on a scope with no live subscription has nobody to disappoint.
 * The Zapme run from Session 3 is a test run on Tim's own account with no subscription behind
 * it, and it would have raised this alert every day forever.
 *
 * That is not a harmless false positive. It is how a real one gets missed: you learn the daily
 * alert is the test run and stop reading it. Same failure as the founding-count alert firing
 * once per page render, on a slower clock.
 *
 * THE NARROWING IS REAL AND WORTH SAYING. A subscriber who cancels while a run is mid-flight
 * is no longer flagged. That is the intended reading - they have cancelled, nobody is waiting -
 * but it does mean this alert answers "is a CUSTOMER waiting" rather than "is a run stuck".
 * Anything wanting the second question has to ask it separately.
 */
export async function runsStuckAwaitingReport(hours = 6): Promise<RunRow[]> {
  const cutoff = new Date(Date.now() - hours * 3_600_000).toISOString();

  const { data: runs, error } = await db()
    .from('runs')
    .select('*')
    .eq('status', 'complete')
    .lt('completed_at', cutoff)
    .order('completed_at', { ascending: true })
    .limit(50);
  if (error) throw new Error(`Could not list complete runs: ${error.message}`);

  const candidates = (runs ?? []) as RunRow[];
  if (!candidates.length) return [];

  const awaited = await onScopesWithALiveSubscriber(candidates);
  return awaited.length ? withoutSentReport(awaited) : [];
}

/**
 * The runs among these whose scope has somebody paying for it right now.
 *
 * past_due counts, for the same reason it counts in LIVE_STATUSES: Smart Retries are still
 * running and a first failed card is not a cancellation. Somebody in that state is still
 * waiting for their report and would still be let down by a stuck one.
 */
async function onScopesWithALiveSubscriber(candidates: RunRow[]): Promise<RunRow[]> {
  const scopeIds = [...new Set(candidates.map((r) => r.scope_id))];
  const { data, error } = await db()
    .from('subscriptions')
    .select('scope_id')
    .in('scope_id', scopeIds)
    .in('status', LIVE_STATUSES);
  if (error) throw new Error(`Could not list live subscriptions: ${error.message}`);

  const live = new Set((data ?? []).map((r) => (r as { scope_id: string }).scope_id));
  return candidates.filter((r) => live.has(r.scope_id));
}

/** The runs among these whose report has not gone out. */
async function withoutSentReport(candidates: RunRow[]): Promise<RunRow[]> {
  const { data: sent, error } = await db()
    .from('reports')
    .select('run_id')
    .in('run_id', candidates.map((r) => r.id))
    .not('sent_at', 'is', null);
  if (error) throw new Error(`Could not list sent reports: ${error.message}`);
  const done = new Set((sent ?? []).map((r) => (r as { run_id: string }).run_id));
  return candidates.filter((r) => !done.has(r.id));
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
