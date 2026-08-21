/**
 * The monthly report, in an inbox.
 *
 * THIS IS THE PRODUCT. The offer sheet sells a report that lands every month and gets
 * forwarded internally, and forwarding is the whole distribution model: the person who
 * subscribes is rarely the person who has to act on a 3.2-star Play Store rating. So the
 * email is the report itself rather than a notification that a report exists. A "your
 * report is ready, log in to read it" email would put a login between a subscriber and the
 * thing they bought, and would be forwarded to somebody who cannot open it.
 *
 * Kept apart from lib/mail.ts (the free scan) and lib/billing-mail.ts (receipts and
 * alerts), on the same reasoning those two are kept apart: different audience, different
 * failure mode. A scan email that does not arrive costs a lead. A receipt that does not
 * arrive costs a customer who has just paid. A report that does not arrive is the month's
 * delivery of a USD 149 subscription, and it is the one where silence is worst - nobody
 * complains about a missing report, they just stop paying.
 */

import 'server-only';
import { Resend } from 'resend';
import { env } from './env';
import { renderReport } from './report-html';
import { surfaceLabel } from './report';
import type { ReportData } from './report';

const monthName = (iso: string): string =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' });

const pct = (v: number | null): string => (v === null ? 'not measured this month' : `${(v * 100).toFixed(1)}%`);

/** The hosted report for one run. The only link in the email, and it needs a login. */
export function reportUrl(runId: string): string {
  return `${env.siteUrl}/report/${runId}`;
}

/**
 * THE SUBJECT LINE IS THE FINDING, NOT AN ANNOUNCEMENT.
 *
 * "Your August report is ready" is a line about us. The subscriber already knows a report
 * comes monthly; what they do not know is what it says, and a subject that tells them is
 * the difference between opening it on the day and opening it never. It also has to survive
 * being forwarded with no context, which is why the brand name leads.
 */
export function reportSubject(r: ReportData): string {
  const period = monthName(r.run.periodStart);
  const e = r.endorsement;
  if (e.askedDirectly > 0) {
    return `${r.scope.brandName}, ${period}: ${e.endorsed} of ${e.askedDirectly} AI surfaces recommend you`;
  }
  return `${r.scope.brandName}, ${period}: your Share of Model is ${pct(r.presence.shareOfModel)}`;
}

/**
 * The plain text alternative, and it is not a throwaway.
 *
 * Every real email has one, spam filters read it, and some people genuinely have HTML off.
 * It carries the diagnosis, the two numbers, and the quoted reasons - the actions are the
 * part somebody might act on from a phone - and then sends them to the full report.
 */
function plainText(r: ReportData, url: string): string {
  const period = monthName(r.run.periodStart);
  const lines: string[] = [
    `WORD OF MODEL`,
    `${r.scope.brandName} / ${r.scope.market} / ${period}`,
    ``,
    r.diagnosis.label.toUpperCase(),
    r.diagnosis.headline,
    ``,
    r.diagnosis.meaning,
    ``,
    `PRESENCE / SHARE OF MODEL: ${pct(r.presence.shareOfModel)}`,
    `Named in ${r.presence.numerator} of ${r.presence.pairs} readings across your four unbranded questions.`,
    ``,
    `ENDORSEMENT: ${r.endorsement.endorsed} of ${r.endorsement.askedDirectly} surfaces recommend you when asked about you by name.`,
    `${r.endorsement.recognised} of ${r.endorsement.askedDirectly} could describe you.`,
    ``,
  ];

  if (r.actions.length) {
    lines.push(`WHAT TO DO ABOUT IT`, ``);
    lines.push(
      `None of this is our advice. Each line is the reason a surface gave, in its own words,`,
      `for naming you without putting you forward.`,
      ``,
    );
    for (const a of r.actions) {
      lines.push(`${a.label}`, `  "${a.quote}"`, `  ${a.whatWouldChangeIt}`, ``);
    }
  }

  if (r.competitors.length) {
    lines.push(`NAMED ACROSS THE SAME ANSWERS AS YOU`, ``);
    lines.push(`  ${r.scope.brandName}: ${pct(r.presence.shareOfModel)}`);
    for (const c of r.competitors) lines.push(`  ${c.name}: ${pct(c.shareOfModel)}`);
    lines.push(``);
  }

  const evidenceCount = r.evidence.reduce((t, e) => t + e.answers.length, 0);
  lines.push(
    `THE EVIDENCE`,
    `All ${evidenceCount} answers, word for word, with what each surface cited:`,
    url,
    ``,
    `Measured across ${r.run.surfaces.map(surfaceLabel).join(', ')}.`,
    `Reply to this email if anything here does not match what you see.`,
  );

  return lines.join('\n');
}

export function buildReportEmail(r: ReportData): { subject: string; html: string; text: string } {
  const url = reportUrl(r.run.id);
  return {
    subject: reportSubject(r),
    html: renderReport(r, { omitEvidence: true, viewUrl: url }),
    text: plainText(r, url),
  };
}

/**
 * Send it, and throw if Resend refuses.
 *
 * THROWING IS DELIBERATE AND IS THE OPPOSITE OF WHAT sendOpsAlert DOES. The caller claimed
 * the send before calling this; a failure has to get back there so the claim can be
 * released and the next scheduler pass retries. Swallowing the error here would mark the
 * report sent, and the subscriber would never receive it and never know to ask.
 *
 * X-Entity-Ref-ID is per run, so a redelivery collapses into one thread rather than
 * arriving as a second copy of the same month.
 */
export async function sendReportEmail(input: { to: string; report: ReportData }): Promise<void> {
  const { subject, html, text } = buildReportEmail(input.report);
  const resend = new Resend(env.resendKey);
  const { error } = await resend.emails.send({
    from: env.resendFrom,
    to: input.to,
    replyTo: env.resendReplyTo,
    subject,
    html,
    text,
    headers: { 'X-Entity-Ref-ID': `report-${input.report.run.id}` },
  });
  if (error) throw new Error(`Resend refused the report: ${error.message}`);
}
