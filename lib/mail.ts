import 'server-only';
import { Resend } from 'resend';
import { env } from './env';
import { highlight, stripMarkdown } from './markup';
import type { FreeResult, GatedResult } from './types';

const PALETTE = {
  paper: '#F7F6F2',
  card: '#FFFFFF',
  ink: '#15171C',
  inkSoft: '#5C5F68',
  inkFaint: '#8E9199',
  rule: '#DEDCD4',
  mark: '#FFE566',
  markYou: '#9BDBFF',
  pen: '#C8332B',
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Same markup device as the report and the site, inlined for email clients. */
function answerHtml(answer: string, you: string, competitors: string[]): string {
  const segments = highlight(stripMarkdown(answer), you, competitors);
  return segments
    .map((s) => {
      const text = escapeHtml(s.text).replace(/\n/g, '<br>');
      if (s.kind === 'you') {
        return `<span style="background:${PALETTE.markYou};padding:1px 3px;">${text}</span>`;
      }
      if (s.kind === 'competitor') {
        return `<span style="background:${PALETTE.mark};padding:1px 3px;">${text}</span>`;
      }
      return text;
    })
    .join('');
}

function plainText(input: {
  brandName: string;
  question: string;
  free: FreeResult;
  gated: GatedResult;
  runAt: string;
}): string {
  const lines: string[] = [
    `WORD OF MODEL / YOUR FREE SCAN`,
    ``,
    input.free.headline,
    ...input.free.lines.map((l) => l.replace(/\*\*/g, '')),
    ``,
    `THE QUESTION`,
    input.question,
    ``,
  ];
  for (const c of input.gated.captures) {
    lines.push(
      `${c.engine_label.toUpperCase()}: ${c.mentioned ? (c.recommended ? 'recommended you' : 'named you, did not recommend you') : `${input.brandName}: not mentioned`}`,
      ``,
      stripMarkdown(c.answer),
      ``,
      `--`,
      ``,
    );
  }
  lines.push(
    `EVERY BRAND NAMED (${input.gated.brands_named.length})`,
    input.gated.brands_named.join(', ') || 'none',
    ``,
    `DOMAINS THE ENGINES CITED`,
    input.gated.domains_cited.map((d) => `${d.domain} (${d.count})`).join('\n') || 'none',
    ``,
    `That was one question and two engines. Word of Model runs five questions your`,
    `buyers actually ask, across five AI platforms, every month.`,
    `USD 249/mo. Founding rate USD 149/mo, first 20 subscribers, locked for 12 months.`,
    `${env.siteUrl}`,
  );
  return lines.join('\n');
}

export interface ScanEmailInput {
  brandName: string;
  domain: string;
  question: string;
  free: FreeResult;
  gated: GatedResult;
  runAt: string;
}

/** Built separately from sending, so the email can be looked at without posting one. */
export function buildScanEmail(input: ScanEmailInput): { subject: string; html: string; text: string } {
  const { brandName, question, free, gated } = input;
  const competitors = gated.brands_named;
  const runDate = new Date(input.runAt).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const capturesHtml = gated.captures
    .map(
      (c) => `
      <div style="background:${PALETTE.card};border:1px solid ${PALETTE.rule};padding:24px;margin:0 0 16px;">
        <div style="font-family:'IBM Plex Mono',Consolas,monospace;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${PALETTE.inkFaint};margin-bottom:14px;">
          ${escapeHtml(c.engine_label)} &middot; ${escapeHtml(runDate)} &middot; ${escapeHtml(c.model)}
        </div>
        <div style="font-family:'IBM Plex Mono',Consolas,monospace;font-size:14px;line-height:1.8;color:${PALETTE.ink};">
          ${answerHtml(c.answer, brandName, competitors)}
        </div>
        <div style="margin-top:20px;padding-top:10px;border-top:2px solid ${PALETTE.pen};font-family:'IBM Plex Mono',Consolas,monospace;font-size:13px;color:${PALETTE.pen};">
          ${
            c.recommended
              ? `${escapeHtml(brandName)}: recommended`
              : c.mentioned
                ? `${escapeHtml(brandName)}: named, not recommended`
                : `${escapeHtml(brandName)}: not mentioned`
          }
        </div>
        ${
          c.citations.length
            ? `<div style="margin-top:16px;font-family:'IBM Plex Mono',Consolas,monospace;font-size:12px;color:${PALETTE.inkSoft};">
                 Cited: ${c.citations
                   .slice(0, 12)
                   .map((cite) => escapeHtml(cite.domain))
                   .join(' &middot; ')}
               </div>`
            : ''
        }
      </div>`,
    )
    .join('');

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Your Word of Model scan</title></head>
<body style="margin:0;padding:0;background:${PALETTE.paper};">
<div style="display:none;font-size:1px;color:${PALETTE.paper};max-height:0;overflow:hidden;">${escapeHtml(free.headline)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PALETTE.paper};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;font-family:'IBM Plex Sans',-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:${PALETTE.ink};">

  <tr><td style="border-bottom:2px solid ${PALETTE.ink};padding-bottom:12px;">
    <span style="font-family:'IBM Plex Sans Condensed','IBM Plex Sans',Arial,sans-serif;font-weight:700;font-size:15px;letter-spacing:2.4px;text-transform:uppercase;">
      Word of Model <span style="color:${PALETTE.inkFaint};">/ free scan</span>
    </span>
  </td></tr>

  <tr><td style="padding:36px 0 0;">
    <h1 style="font-family:'IBM Plex Sans Condensed','IBM Plex Sans',Arial,sans-serif;font-weight:700;font-size:34px;line-height:1.05;margin:0 0 16px;letter-spacing:-0.5px;">
      ${escapeHtml(free.headline)}
    </h1>
    ${free.lines
      .map(
        (l) =>
          `<p style="margin:0 0 10px;font-size:16px;line-height:1.55;color:${PALETTE.inkSoft};">${escapeHtml(
            l,
          ).replace(/\*\*(.+?)\*\*/g, `<strong style="color:${PALETTE.ink};">$1</strong>`)}</p>`,
      )
      .join('')}
  </td></tr>

  <tr><td style="padding:32px 0 0;">
    <div style="font-family:'IBM Plex Mono',Consolas,monospace;font-size:11px;letter-spacing:1.8px;text-transform:uppercase;color:${PALETTE.inkFaint};margin-bottom:12px;">The question we asked</div>
    <p style="margin:0;font-size:18px;line-height:1.5;font-weight:600;">${escapeHtml(question)}</p>
  </td></tr>

  <tr><td style="padding:36px 0 0;">
    <div style="font-family:'IBM Plex Mono',Consolas,monospace;font-size:11px;letter-spacing:1.8px;text-transform:uppercase;color:${PALETTE.inkFaint};margin-bottom:12px;">The answers, word for word</div>
    ${capturesHtml}
  </td></tr>

  <tr><td style="padding:20px 0 0;">
    <div style="font-family:'IBM Plex Mono',Consolas,monospace;font-size:11px;letter-spacing:1.8px;text-transform:uppercase;color:${PALETTE.inkFaint};margin-bottom:12px;">Every brand named</div>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.7;">
      ${
        competitors.length
          ? competitors
              .map(
                (b) =>
                  `<span style="background:${PALETTE.mark};padding:2px 5px;margin-right:4px;display:inline-block;">${escapeHtml(b)}</span>`,
              )
              .join(' ')
          : 'None besides you.'
      }
    </p>
    <div style="font-family:'IBM Plex Mono',Consolas,monospace;font-size:11px;letter-spacing:1.8px;text-transform:uppercase;color:${PALETTE.inkFaint};margin-bottom:12px;">Where the answers came from</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${PALETTE.rule};">
      ${
        gated.domains_cited.length
          ? gated.domains_cited
              .map(
                (d) =>
                  `<tr><td style="padding:9px 0;border-bottom:1px solid ${PALETTE.rule};font-family:'IBM Plex Mono',Consolas,monospace;font-size:14px;">${escapeHtml(d.domain)}</td><td align="right" style="padding:9px 0;border-bottom:1px solid ${PALETTE.rule};font-family:'IBM Plex Mono',Consolas,monospace;font-size:13px;color:${PALETTE.inkSoft};">${d.count}</td></tr>`,
              )
              .join('')
          : `<tr><td style="padding:9px 0;font-family:'IBM Plex Mono',Consolas,monospace;font-size:13px;color:${PALETTE.inkSoft};">Neither engine cited a source.</td></tr>`
      }
    </table>
  </td></tr>

  ${
    gated.beaten_by
      ? `<tr><td style="padding:28px 0 0;">
           <div style="border-left:3px solid ${PALETTE.ink};background:${PALETTE.card};border-top:1px solid ${PALETTE.rule};border-right:1px solid ${PALETTE.rule};border-bottom:1px solid ${PALETTE.rule};padding:20px 24px;">
             <div style="font-family:'IBM Plex Mono',Consolas,monospace;font-size:11px;letter-spacing:1.8px;text-transform:uppercase;color:${PALETTE.inkFaint};margin-bottom:8px;">Who beat you</div>
             <p style="margin:0;font-size:17px;font-weight:600;">${escapeHtml(gated.beaten_by)}</p>
           </div>
         </td></tr>`
      : ''
  }

  <tr><td style="padding:36px 0 0;">
    <div style="border-top:2px solid ${PALETTE.ink};padding-top:24px;">
      <p style="margin:0 0 10px;font-size:16px;line-height:1.55;">That was one question and two engines.</p>
      <p style="margin:0 0 10px;font-size:16px;line-height:1.55;color:${PALETTE.inkSoft};">
        <strong style="color:${PALETTE.ink};">Word of Model</strong> runs five questions your buyers actually ask, across five AI platforms, every month, with the competitors ranked next to you and the three things to fix, in order.
      </p>
      <p style="margin:0 0 20px;font-size:16px;line-height:1.55;">
        <strong>USD 249/mo.</strong> Founding rate USD 149/mo, first 20 subscribers, locked for 12 months.
      </p>
      <a href="${env.siteUrl}/#pricing" style="display:inline-block;background:${PALETTE.ink};color:${PALETTE.paper};text-decoration:none;padding:14px 22px;font-weight:600;font-size:15px;">Start my first report</a>
    </div>
  </td></tr>

  <tr><td style="padding:40px 0 0;">
    <p style="margin:0;font-family:'IBM Plex Mono',Consolas,monospace;font-size:11.5px;line-height:1.6;color:${PALETTE.inkFaint};border-top:1px solid ${PALETTE.rule};padding-top:18px;">
      One question, written for ${escapeHtml(brandName)} and asked on ${escapeHtml(runDate)} from
      ${gated.captures.map((c) => `${escapeHtml(c.engine_label)} (${escapeHtml(c.model)})`).join(' and ')},
      with web search enabled and no conversation history. Answers captured in full and scored on two things:
      whether you were named, and whether you were recommended. Nothing here is estimated or modelled.
      <br><br>
      Word of Model &middot; wordofmodel.ai &middot; you asked for this scan for ${escapeHtml(input.domain)}.
    </p>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;

  return {
    subject: `${brandName}: ${free.headline}`,
    html,
    text: plainText({ brandName, question, free, gated, runAt: input.runAt }),
  };
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
    headers: { 'X-Entity-Ref-ID': `scan-${input.domain}` },
  });
  if (error) throw new Error(`Resend refused the message: ${error.message}`);
}
