/**
 * The monthly email. A note that points at the report, and deliberately not the report.
 *
 * IT USED TO BE THE WHOLE REPORT WITH THE VERBATIM ANSWERS REMOVED. That was wrong in three
 * ways, and the first is the one that matters.
 *
 * A SECOND COPY OF NUMBERS WE HAVE GONE TO SOME LENGTH TO MAKE AUTHORITATIVE. reports stores
 * the figures, threshold_version and extraction_version pin what they mean, and asIssued
 * refuses to rewrite anything after sent_at - all so a subscriber's numbers still mean what
 * they meant on the day they read them. An email carrying the full set of figures is a copy
 * outside every one of those guarantees: it cannot be corrected, it cannot be versioned, and
 * it is the copy somebody forwards or quotes back at us in March. The page is the record.
 * The email is the thing that makes them open it.
 *
 * LENGTH BURIES THE FINDING. Three thousand words of tables in an inbox means the one
 * sentence worth acting on - three surfaces, asked separately, naming the same cause - sits
 * under a leaderboard nobody scrolls to.
 *
 * AND IT WOULD NOT SURVIVE THE CLIENTS. Outlook renders HTML through Word: no flexbox, no
 * grid, and no dependable support for an embedded stylesheet. The question grid needs all
 * three, and the two cell marks this build spent a session learning to tell apart - a
 * surface that showed nothing, a reading we failed to take - would arrive as two identical
 * boxes. Sending the version of a thing that lies is worse than not sending it.
 *
 * So: about four hundred words, inline styles on tables, no stylesheet, no images, no grid.
 * Headline, diagnosis, the convergence sentence, the reasons as plain lines, and a link.
 * Anything with a figure on it stays in the report.
 */

import 'server-only';
import { Resend } from 'resend';
import { env } from './env';
import { BRAND, FONT } from './brand';
import { surfaceLabel } from './report';
import type { ReportData } from './report';

/**
 * The report's palette, inlined. A stylesheet is not dependable in an inbox, so the hex has to
 * reach the markup - but it is READ from lib/brand.ts rather than typed out here, which is the
 * one thing that stopped this from being a ninth copy.
 */
const C = {
  paper: BRAND.paper,
  card: BRAND.card,
  ink: BRAND.ink,
  inkSoft: BRAND.soft,
  inkFaint: BRAND.faint,
  rule: BRAND.line,
  pen: BRAND.pen,
};

const SANS = FONT.sans;
const MONO = FONT.mono;

const monthName = (iso: string): string =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' });

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

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
  return `${r.scope.brandName}, ${period}: your report is ready`;
}

/**
 * The line an inbox shows after the subject. Without one, clients take the first words of
 * the body, which here is the wordmark.
 */
function preheader(r: ReportData): string {
  const convergence = r.actions.convergence;
  return convergence ? `${convergence.split('. ')[0]}.` : r.diagnosis.headline;
}

export function buildReportEmail(r: ReportData): { subject: string; html: string; text: string } {
  const url = reportUrl(r.run.id);
  return { subject: reportSubject(r), html: htmlBody(r, url), text: textBody(r, url) };
}

function htmlBody(r: ReportData, url: string): string {
  const period = monthName(r.run.periodStart);
  const answers = r.evidence.reduce((t, e) => t + e.answers.length, 0);

  const quotes = r.actions.items
    .map(
      (a) => `
              <tr><td style="padding:0 0 16px 0;">
                <div style="font-family:${MONO};font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:${C.inkFaint};padding-bottom:5px;">${esc(a.label)}</div>
                <div style="font-family:${MONO};font-size:13.5px;line-height:1.65;color:${C.ink};border-left:3px solid ${C.rule};padding-left:14px;">${esc(a.quote)}</div>
              </td></tr>`,
    )
    .join('');

  const convergence = r.actions.convergence
    ? `
      <tr><td style="padding:0 30px 6px 30px;">
        <div style="font-family:${SANS};font-size:16px;line-height:1.6;color:${C.ink};border-left:3px solid ${C.ink};padding:2px 0 2px 16px;">${esc(r.actions.convergence)}</div>
      </td></tr>`
    : '';

  const said = r.actions.items.length
    ? `
      <tr><td style="padding:26px 30px 0 30px;">
        <div style="font-family:${MONO};font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${C.inkFaint};padding-bottom:14px;">In their own words</div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${quotes}
        </table>
      </td></tr>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(reportSubject(r))}</title>
</head>
<body style="margin:0;padding:0;background:${C.paper};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader(r))}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${C.paper};">
  <tr><td align="center" style="padding:26px 12px 44px 12px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:100%;background:${C.card};border:1px solid ${C.rule};">

      <tr><td style="padding:22px 30px 16px 30px;border-bottom:2px solid ${C.ink};">
        <div style="font-family:${SANS};font-weight:700;font-size:14px;letter-spacing:.16em;text-transform:uppercase;color:${C.ink};">Word of Model&trade;<span style="color:${C.inkFaint};">.ai</span></div>
        <div style="font-family:${MONO};font-size:11px;color:${C.inkSoft};padding-top:6px;">${esc(r.scope.brandName)} &middot; ${esc(r.scope.market)} &middot; ${esc(period)}</div>
      </td></tr>

      <tr><td style="padding:30px 30px 0 30px;">
        <div style="font-family:${MONO};font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${C.pen};border:1px solid ${C.pen};display:inline-block;padding:5px 9px;">${esc(r.diagnosis.label)}</div>
        <h1 style="font-family:${SANS};font-weight:700;font-size:26px;line-height:1.22;letter-spacing:-.015em;color:${C.ink};margin:18px 0 14px 0;">${esc(r.diagnosis.headline)}</h1>
        <p style="font-family:${SANS};font-size:16px;line-height:1.6;color:${C.inkSoft};margin:0 0 22px 0;">${esc(r.diagnosis.meaning)}</p>
      </td></tr>
${convergence}${said}

      <tr><td style="padding:26px 30px 30px 30px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="background:${C.ink};">
            <a href="${esc(url)}" style="display:inline-block;font-family:${MONO};font-size:13px;letter-spacing:.06em;color:${C.paper};text-decoration:none;padding:14px 24px;">Read the full report</a>
          </td></tr>
        </table>
        <p style="font-family:${SANS};font-size:14px;line-height:1.6;color:${C.inkSoft};margin:18px 0 0 0;">How many surfaces recommend you, how often you are named at all, where you sit against your competitor set, what each surface said question by question, all ${answers} answers word for word, and how every figure was measured are in the report. That page is the record, and it is the version to quote.</p>
      </td></tr>

      <tr><td style="padding:18px 30px 22px 30px;border-top:1px solid ${C.rule};">
        <p style="font-family:${MONO};font-size:11.5px;line-height:1.6;color:${C.inkFaint};margin:0;">Measured across ${esc(r.run.surfaces.map(surfaceLabel).join(', '))} &middot; ${esc(period)}<br>Reply to this email and it reaches a person.</p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

/**
 * The plain text alternative, and it is not a throwaway. Every real email has one, spam
 * filters read it, and some people genuinely have HTML off. Same shape as the HTML.
 */
function textBody(r: ReportData, url: string): string {
  const answers = r.evidence.reduce((t, e) => t + e.answers.length, 0);
  const lines: string[] = [
    `WORD OF MODEL`,
    `${r.scope.brandName} / ${r.scope.market} / ${monthName(r.run.periodStart)}`,
    ``,
    r.diagnosis.label.toUpperCase(),
    wrap(r.diagnosis.headline),
    ``,
    wrap(r.diagnosis.meaning),
    ``,
  ];

  if (r.actions.convergence) lines.push(wrap(r.actions.convergence), ``);

  if (r.actions.items.length) {
    lines.push(`IN THEIR OWN WORDS`, ``);
    for (const a of r.actions.items) lines.push(a.label, wrap(`"${a.quote}"`, 74, '  '), ``);
  }

  lines.push(
    `READ THE FULL REPORT`,
    url,
    ``,
    wrap(
      `How many surfaces recommend you, how often you are named at all, where you sit against ` +
        `your competitor set, all ${answers} answers word for word, and how every figure was ` +
        `measured are in the report. That page is the record, and it is the version to quote.`,
    ),
    ``,
    `Measured across ${r.run.surfaces.map(surfaceLabel).join(', ')}.`,
    `Reply to this email and it reaches a person.`,
  );

  return lines.join('\n');
}

/** Hard wrapped, because a text part is read in a monospace window of unknown width. */
function wrap(s: string, width = 76, indent = ''): string {
  const out: string[] = [];
  let line = '';
  for (const word of s.split(/\s+/)) {
    if (line && `${indent}${line} ${word}`.length > width) {
      out.push(indent + line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) out.push(indent + line);
  return out.join('\n');
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
