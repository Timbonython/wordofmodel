import 'server-only';
import { Resend } from 'resend';
import { env } from './env';
import { priceLabel } from './scope';
import type { FreeResult } from './types';
import { BRAND, FONT } from './brand';

/**
 * The free scan email. Short, one idea, one thing to click.
 *
 * IT USED TO BE THE SCAN. Both answers in full, every brand named, every cited domain, the
 * verdict, the offer, and a footer explaining the method: an email nobody reached the end of,
 * duplicating a page that says the same thing better, ending in a link back to #pricing where
 * a returning visitor found a form they had already filled in.
 *
 * Same discipline as the report email, and for the same reason. Point at the thing, do not
 * copy it. The result now has a URL, so this is a short note that says what happened, gives
 * one reason to act, and links to the two places worth going: the full result, and the wizard
 * with their scan already loaded into it.
 *
 * The forwardable artefact is the link, not the message. A colleague opening a URL sees the
 * live result; a colleague reading a forwarded wall of quoted text sees a copy that was true
 * once.
 */

/** Read from lib/brand.ts, not typed out. An inbox needs inline hex; it does not need a copy. */
const PALETTE = {
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface ScanEmailInput {
  scanId: string;
  brandName: string;
  domain: string;
  question: string;
  free: FreeResult;
  runAt: string;
}

/** Where the result lives now that it has somewhere to live. */
function resultUrl(scanId: string): string {
  return `${env.siteUrl}/scan/${scanId}`;
}

/**
 * The wizard, with the scan already in it.
 *
 * NOT #pricing, which is where this link used to go: an anchor on a page whose form the
 * visitor had already filled in, so the state they landed on had nothing to click. /start?scan
 * loads the brand, the category and the market they already confirmed, so the first wizard
 * screen is a check rather than a form.
 */
function startUrl(scanId: string): string {
  return `${env.siteUrl}/start?scan=${scanId}`;
}

/** The question, short enough to sit in an email without becoming the email. */
function askedLine(question: string): string {
  const clean = question.replace(/\s+/g, ' ').trim();
  return clean.length > 160 ? `${clean.slice(0, 157)}...` : clean;
}

/**
 * The one sentence under the headline.
 *
 * It reads "we asked ChatGPT and Perplexity the question above", which was written for the
 * result page, where the question is printed at the top. So the question has to sit above it
 * here too, or the sentence points at nothing. Cheaper than rewording the verdict copy in two
 * places and letting the two drift.
 */
function firstLine(free: FreeResult): string {
  const line = free.lines[0] ?? '';
  return line.replace(/\*\*/g, '').trim();
}

export function buildScanEmail(input: ScanEmailInput): { subject: string; html: string; text: string } {
  const { brandName, free, scanId } = input;
  const result = resultUrl(scanId);
  const start = startUrl(scanId);

  const text = [
    `WORD OF MODEL`,
    ``,
    free.headline,
    ``,
    `We asked: ${askedLine(input.question)}`,
    ``,
    firstLine(free),
    ``,
    `That was two answers to one question, once. Your report is twenty five answers`,
    `to five questions, every month, with the companies that came up instead of you`,
    `ranked beside you and what to do about it, in order.`,
    ``,
    `START MY FIRST REPORT`,
    start,
    ``,
    `Your full scan result, with both answers word for word:`,
    result,
    ``,
    `${priceLabel('founding_monthly')}/mo founding rate. Scanned ${input.domain}.`,
    `Reply to this email and a person reads it.`,
  ].join('\n');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(free.headline)}</title>
</head>
<body style="margin:0;padding:0;background:${PALETTE.paper};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(firstLine(free))}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${PALETTE.paper};">
  <tr><td align="center" style="padding:26px 12px 44px 12px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:100%;background:${PALETTE.card};border:1px solid ${PALETTE.rule};">

      <tr><td style="padding:22px 30px 16px 30px;border-bottom:2px solid ${PALETTE.ink};">
        <div style="font-family:${SANS};font-weight:700;font-size:14px;letter-spacing:.16em;text-transform:uppercase;color:${PALETTE.ink};">Word of Model&trade;<span style="color:${PALETTE.inkFaint};">.ai</span></div>
        <div style="font-family:${MONO};font-size:11px;color:${PALETTE.inkSoft};padding-top:6px;">${escapeHtml(input.domain)} &middot; free scan</div>
      </td></tr>

      <tr><td style="padding:30px 30px 0 30px;">
        <h1 style="font-family:${SANS};font-weight:700;font-size:26px;line-height:1.22;letter-spacing:-.015em;color:${PALETTE.ink};margin:0 0 16px 0;">${escapeHtml(free.headline)}</h1>
        <p style="font-family:${MONO};font-size:14px;line-height:1.7;color:${PALETTE.ink};border-left:3px solid ${PALETTE.rule};padding-left:14px;margin:0 0 18px 0;">${escapeHtml(askedLine(input.question))}</p>
        <p style="font-family:${SANS};font-size:16px;line-height:1.6;color:${PALETTE.inkSoft};margin:0 0 22px 0;">${escapeHtml(firstLine(free))}</p>
        <p style="font-family:${SANS};font-size:16px;line-height:1.6;color:${PALETTE.ink};margin:0 0 24px 0;">
          That was two answers to one question, once. Your report is twenty five answers to five
          questions, every month, with the companies that came up instead of ${escapeHtml(brandName)}
          ranked beside you and what to do about it, in order.
        </p>
      </td></tr>

      <tr><td style="padding:0 30px 26px 30px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="background:${PALETTE.ink};">
            <a href="${escapeHtml(start)}" style="display:inline-block;font-family:${MONO};font-size:13px;letter-spacing:.06em;color:${PALETTE.paper};text-decoration:none;padding:14px 24px;">Start my first report</a>
          </td></tr>
        </table>
        <p style="font-family:${SANS};font-size:14px;line-height:1.6;color:${PALETTE.inkSoft};margin:18px 0 0 0;">
          Or read <a href="${escapeHtml(result)}" style="color:${PALETTE.ink};">your full scan result</a>, with both
          answers word for word and every company either engine named.
        </p>
      </td></tr>

      <tr><td style="padding:18px 30px 22px 30px;border-top:1px solid ${PALETTE.rule};">
        <p style="font-family:${MONO};font-size:11.5px;line-height:1.6;color:${PALETTE.inkFaint};margin:0;">
          ${escapeHtml(priceLabel('founding_monthly'))}/mo founding rate &middot; you asked for this scan for ${escapeHtml(input.domain)}<br>
          Reply to this email and a person reads it.
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;

  return { subject: `${brandName}: ${free.headline}`, html, text };
}

export async function sendScanEmail(input: ScanEmailInput & { to: string }): Promise<void> {
  const { subject, html, text } = buildScanEmail(input);

  const resend = new Resend(env.resendKey);
  const { error } = await resend.emails.send({
    from: env.resendFrom,
    to: input.to,
    replyTo: env.resendReplyTo,
    subject,
    html,
    text,
    headers: { 'X-Entity-Ref-ID': `scan-${input.scanId}` },
  });
  if (error) throw new Error(`Resend refused the message: ${error.message}`);
}
