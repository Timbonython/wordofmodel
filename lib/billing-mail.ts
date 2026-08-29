import 'server-only';
import { Resend } from 'resend';
import { env } from './env';
import { db } from './db';
import type { PriceKey } from './stripe';
import { MONTHLY_SURFACES, QUARTERLY_SURFACES, SURFACES } from './accounts';
import { BRAND } from './brand';
import { priceLabel } from './scope';

/**
 * The two emails the billing side sends: the receipt a new subscriber goes
 * looking for, and the alert that tells Tim a card failed.
 *
 * Kept apart from lib/mail.ts, which is the free scan report. Different
 * audience, different failure mode: a scan email that does not arrive costs a
 * lead, a confirmation that does not arrive costs a customer who has just paid
 * and has nothing to show for it.
 */

/** Read from lib/brand.ts, not typed out. See the note at the top of that file. */
const PALETTE = {
  paper: BRAND.paper,
  card: BRAND.card,
  ink: BRAND.ink,
  inkSoft: BRAND.soft,
  rule: BRAND.line,
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
  /**
   * REMOVED, deliberately: firstReportAt used to carry current_period_end, and the email
   * promised the first report at the end of the first billing period. The Stripe webhook
   * now opens a baseline run on the day of payment, so that date is a month too late.
   * The recurring date still comes from reportDay.
   */
  priceKey: PriceKey;
}

export function buildConfirmationEmail(input: ConfirmationInput): {
  subject: string;
  html: string;
  text: string;
} {
  // WITHIN 24 HOURS, not at the end of the first billing period.
  //
  // This used to read current_period_end, which was right when the first report was a
  // month away and became wrong in the opposite direction the moment the Stripe webhook
  // started opening a baseline run on the day of payment. A subscriber was being told to
  // wait a month for something arriving overnight.
  const when = 'within 24 hours';
  // FROM THE PRICE KEY, NOT FROM A PAIR OF LITERALS. This read "US$149 or else US$249", which
  // was true while premium was the only thing anybody could buy. Monitoring became purchasable
  // on 29 Aug 2026, and a US$69 subscriber would have been sent a receipt saying US$249.
  const price = priceLabel(input.priceKey);
  const foundingLine =
    input.priceKey === 'premium_founding_monthly'
      ? `You took a founding place, so that is ${price} a month, held at that price for as long as you stay.`
      : `That is ${price} a month. Cancel any time, no contract.`;

  const text = [
    `WORD OF MODEL`,
    ``,
    `You're in. Your first report lands within 24 hours.`,
    ``,
    `We'll run your five questions across ${monthlySurfaceList()}, and you'll have`,
    `the whole report - numbers, competitors, verbatim answers, and three ranked actions -`,
    `in your inbox ${when}. Then the ${ordinal(input.reportDay)} of every month after that.`,
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
    <h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;">You're in. Your first report lands within 24 hours.</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      We'll run your five questions for ${escapeHtml(input.brandName)} across ${escapeHtml(monthlySurfaceList())}, and you'll have the whole report, numbers, competitors, verbatim answers, and three ranked actions, in your inbox ${escapeHtml(when)}. Same date every month after that.
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

  return { subject: `You're in. Your first report lands within 24 hours.`, html, text };
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

export function ordinal(day: number): string {
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
 *
 * SWALLOWING THE EXCEPTION IS RIGHT. SWALLOWING IT SILENTLY WAS NOT. Until 0011 this
 * function left no trace of its own outcome, so an alert that reached nobody and an alert
 * that arrived looked identical from every side: same return, same absence of an error, a
 * console line in a serverless log nobody reads. Session 4 watched several of these fire
 * and called them verified, which was only ever a claim about the code path.
 *
 * It is not hypothetical. hello@wordofmodel.ai - ALERT_EMAIL and the reply-to on every
 * subscriber email - bounced 550 5.1.1 three times on 17 Aug 2026, rejected by Cloudflare's
 * own MX because no routing rule existed for it. Had that still been true, every alert in
 * this build would have gone into the ground quietly.
 *
 * So every attempt is written down, with Resend's message id when there is one. ACCEPTED IS
 * NOT DELIVERED: `sent` means Resend took it, and the id is how you ask them afterwards
 * whether it actually landed. scripts/alerts-check.mjs does that.
 *
 * The recording is inside its own try/catch. If the database is what is broken, the alert
 * still goes out; failing to write the receipt must never cost the alert itself.
 */
export async function sendOpsAlert(input: {
  subject: string;
  lines: string[];
}): Promise<void> {
  const text = input.lines.join('\n');
  console.error(`ALERT: ${input.subject}\n${text}`);

  if (!env.alertEmail) {
    console.error('ALERT_EMAIL is not set, so that alert went nowhere but here.');
    await recordAlert({ subject: input.subject, status: 'no_address', recipient: null, messageId: null, error: 'ALERT_EMAIL is not set' });
    return;
  }

  try {
    const resend = new Resend(env.resendKey);
    const { data, error } = await resend.emails.send({
      from: env.resendFrom,
      to: env.alertEmail,
      subject: input.subject,
      text,
    });
    if (error) throw new Error(error.message);
    await recordAlert({
      subject: input.subject,
      status: 'sent',
      recipient: env.alertEmail,
      messageId: data?.id ?? null,
      error: null,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error('The alert itself could not be sent:', reason);
    await recordAlert({
      subject: input.subject,
      status: 'failed',
      recipient: env.alertEmail,
      messageId: null,
      error: reason,
    });
  }
}

/** Writes the receipt. Never throws, for the same reason its caller never throws. */
async function recordAlert(row: {
  subject: string;
  status: 'sent' | 'failed' | 'no_address';
  recipient: string | null;
  messageId: string | null;
  error: string | null;
}): Promise<void> {
  try {
    const { error } = await db().from('ops_alerts').insert({
      subject: row.subject,
      status: row.status,
      recipient: row.recipient,
      provider_message_id: row.messageId,
      error: row.error,
    });
    if (error) throw new Error(error.message);
  } catch (err) {
    console.error('Could not record the alert attempt:', err instanceof Error ? err.message : err);
  }
}

/**
 * The last few alert attempts. "Did anybody hear about that" as a query.
 *
 * Still only what we attempted: a row saying `sent` means Resend accepted it. Take
 * provider_message_id to scripts/alerts-check.mjs for the delivery event itself.
 */
export async function recentOpsAlerts(limit = 10): Promise<Array<{
  subject: string;
  status: string;
  recipient: string | null;
  provider_message_id: string | null;
  error: string | null;
  created_at: string;
}>> {
  const { data, error } = await db()
    .from('ops_alerts')
    .select('subject, status, recipient, provider_message_id, error, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Could not read the alert log: ${error.message}`);
  return (data ?? []) as Array<{
    subject: string;
    status: string;
    recipient: string | null;
    provider_message_id: string | null;
    error: string | null;
    created_at: string;
  }>;
}
