import 'server-only';
import { Resend } from 'resend';
import { env } from './env';
import type { PriceKey } from './stripe';
import { MONTHLY_SURFACES, QUARTERLY_SURFACES, SURFACES } from './accounts';

/**
 * The two emails the billing side sends: the receipt a new subscriber goes
 * looking for, and the alert that tells Tim a card failed.
 *
 * Kept apart from lib/mail.ts, which is the free scan report. Different
 * audience, different failure mode: a scan email that does not arrive costs a
 * lead, a confirmation that does not arrive costs a customer who has just paid
 * and has nothing to show for it.
 */

const PALETTE = {
  paper: '#F7F6F2',
  card: '#FFFFFF',
  ink: '#15171C',
  inkSoft: '#5C5F68',
  rule: '#DEDCD4',
};

/**
 * The surface list, generated from the locked set rather than typed out, so it
 * cannot drift from what actually runs. The old copy said "ChatGPT, Gemini,
 * Perplexity, Claude and Google's AI answers", which put Claude in the monthly
 * run. Claude is quarterly and hand read, and saying otherwise in a receipt is a
 * promise the pipeline does not keep.
 */
export function monthlySurfaceList(): string {
  const names = MONTHLY_SURFACES.map((s) => SURFACES[s].label);
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function quarterlySurfaceList(): string {
  const names = QUARTERLY_SURFACES.filter((s) => SURFACES[s].cadence === 'quarterly').map(
    (s) => SURFACES[s].label,
  );
  return names.join(' and ');
}

export function formatReportDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export interface ConfirmationInput {
  to: string;
  brandName: string;
  reportDay: number;
  firstReportAt: string | null;
  priceKey: PriceKey;
}

export function buildConfirmationEmail(input: ConfirmationInput): {
  subject: string;
  html: string;
  text: string;
} {
  const date = formatReportDate(input.firstReportAt);
  const when = date ? `on ${date}` : `on the ${ordinal(input.reportDay)} of next month`;
  const price = input.priceKey === 'founding_monthly' ? 'USD 149' : 'USD 249';
  const foundingLine =
    input.priceKey === 'founding_monthly'
      ? `You took a founding place, so that is USD 149 a month, locked for twelve months.`
      : `That is USD 249 a month. Cancel any time, no contract.`;

  const text = [
    `WORD OF MODEL`,
    ``,
    `You're in. First report lands ${date ?? `on the ${ordinal(input.reportDay)}`}.`,
    ``,
    `We'll run your five questions across ${monthlySurfaceList()}, and you'll have`,
    `the whole thing - numbers, competitors, verbatim answers, and three things to do -`,
    `in your inbox ${when}. Same date every month after that.`,
    ``,
    `Four times a year we also read ${quarterlySurfaceList()} by hand, because neither`,
    `can be captured any other way without substituting a different system and calling`,
    `it their answer.`,
    ``,
    foundingLine,
    ``,
    `Nothing needed from you in the meantime.`,
    ``,
    `Manage your card or cancel: ${env.siteUrl}/account`,
    ``,
    `Reply to this email if you need anything. A person reads it.`,
  ].join('\n');

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:${PALETTE.paper};font-family:'IBM Plex Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${PALETTE.ink};">
  <div style="max-width:560px;margin:0 auto;background:${PALETTE.card};border:1px solid ${PALETTE.rule};padding:32px;">
    <p style="margin:0 0 24px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${PALETTE.inkSoft};">Word of Model</p>
    <h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;">You're in. First report lands ${escapeHtml(date ?? `on the ${ordinal(input.reportDay)}`)}.</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      We'll run your five questions for ${escapeHtml(input.brandName)} across ${escapeHtml(monthlySurfaceList())}, and you'll have the whole thing, numbers, competitors, verbatim answers, and three things to do, in your inbox ${escapeHtml(when)}. Same date every month after that.
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      Four times a year we also read ${escapeHtml(quarterlySurfaceList())} by hand, because neither can be captured any other way without substituting a different system and calling it their answer.
    </p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;">${escapeHtml(foundingLine)}</p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;"><strong>Nothing needed from you in the meantime.</strong></p>
    <hr style="border:0;border-top:1px solid ${PALETTE.rule};margin:0 0 20px;">
    <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:${PALETTE.inkSoft};">
      Billed ${escapeHtml(price)} a month. Update your card or cancel any time at
      <a href="${env.siteUrl}/account" style="color:${PALETTE.ink};">${escapeHtml(env.siteUrl.replace(/^https?:\/\//, ''))}/account</a>.
    </p>
    <p style="margin:0;font-size:13px;line-height:1.6;color:${PALETTE.inkSoft};">Reply to this email if you need anything. A person reads it.</p>
  </div>
</body></html>`;

  return { subject: `You're in. First report lands ${date ?? `on the ${ordinal(input.reportDay)}`}.`, html, text };
}

export async function sendConfirmationEmail(input: ConfirmationInput): Promise<void> {
  const { subject, html, text } = buildConfirmationEmail(input);
  const resend = new Resend(env.resendKey);
  const { error } = await resend.emails.send({
    from: env.resendFrom,
    to: input.to,
    replyTo: env.resendReplyTo,
    subject,
    html,
    text,
    headers: { 'X-Entity-Ref-ID': `welcome-${input.to}` },
  });
  if (error) throw new Error(`Resend refused the confirmation: ${error.message}`);
}

/**
 * A failed payment goes to Tim, not to the subscriber. Stripe already emails the
 * customer about a declined card and is better at it, and two emails about the
 * same card from two senders is how a real payment problem gets ignored.
 *
 * Never throws. A failed alert must not take the webhook down with it: Stripe
 * would retry the whole event, and the subscription state matters more than the
 * notification.
 */
export async function sendPaymentFailedAlert(input: {
  customerId: string | null;
  email: string | null;
  amountDue: number | null;
  currency: string;
  attemptCount: number | null;
  hostedInvoiceUrl: string | null;
}): Promise<void> {
  if (!env.alertEmail) {
    console.warn('Payment failed and ALERT_EMAIL is not set:', input.customerId ?? input.email);
    return;
  }

  const amount =
    input.amountDue != null
      ? `${input.currency.toUpperCase()} ${(input.amountDue / 100).toFixed(2)}`
      : 'unknown amount';

  const text = [
    `Payment failed.`,
    ``,
    `Customer: ${input.email ?? 'unknown'} (${input.customerId ?? 'no id'})`,
    `Amount:   ${amount}`,
    `Attempt:  ${input.attemptCount ?? 'unknown'} of 4`,
    input.hostedInvoiceUrl ? `Invoice:  ${input.hostedInvoiceUrl}` : '',
    ``,
    `Smart Retries are still running. The subscription is past_due, not cancelled.`,
    `Report generation pauses after the fourth attempt.`,
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const resend = new Resend(env.resendKey);
    await resend.emails.send({
      from: env.resendFrom,
      to: env.alertEmail,
      subject: `Payment failed: ${input.email ?? input.customerId ?? 'unknown customer'}`,
      text,
    });
  } catch (err) {
    console.error('Could not send the payment failed alert:', err instanceof Error ? err.message : err);
  }
}

function ordinal(day: number): string {
  const suffix =
    day % 10 === 1 && day !== 11
      ? 'st'
      : day % 10 === 2 && day !== 12
        ? 'nd'
        : day % 10 === 3 && day !== 13
          ? 'rd'
          : 'th';
  return `${day}${suffix}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * An operational alert to whoever is on the hook, for a failure that a customer
 * will feel but no request will surface. A confirmation email that never sends
 * is the case this was written for: the webhook returns 200, the subscription is
 * correct, and the only sign anything is wrong is a subscriber who paid and
 * heard nothing.
 *
 * Never throws. An alert that takes down the handler it is reporting from turns
 * one silent failure into two loud ones. If Resend is the thing that is broken,
 * this fails too, and the console line is the last line of defence.
 */
export async function sendOpsAlert(input: {
  subject: string;
  lines: string[];
}): Promise<void> {
  const text = input.lines.join('\n');
  console.error(`ALERT: ${input.subject}\n${text}`);

  if (!env.alertEmail) {
    console.error('ALERT_EMAIL is not set, so that alert went nowhere but here.');
    return;
  }

  try {
    const resend = new Resend(env.resendKey);
    const { error } = await resend.emails.send({
      from: env.resendFrom,
      to: env.alertEmail,
      subject: input.subject,
      text,
    });
    if (error) throw new Error(error.message);
  } catch (err) {
    console.error('The alert itself could not be sent:', err instanceof Error ? err.message : err);
  }
}
