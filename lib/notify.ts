import 'server-only';
import { db } from './db';
import { sendOpsAlert } from './billing-mail';
import { foundingDisplay } from './billing';
import { priceLabel } from './scope';
import { FOUNDING_SEATS, type PriceKey } from './stripe';

/**
 * Telling Tim what happened. NOT the record of what happened.
 *
 * Everything here is best effort and nothing may depend on it. A subscriber exists because
 * there is a row in `subscriptions`; a scan happened because there is a row in `scans`. These
 * are emails about those facts, so every function swallows its own failures the way
 * sendOpsAlert already does, and no caller branches on the result.
 *
 * They go to ALERT_EMAIL, which is deliberately off the sending domain - see lib/env.ts. An
 * address on wordofmodel.ai would put the notification about a subscriber and the address that
 * subscriber replies to behind the same routing rule.
 */

/** Off without a deploy. Unset means on: a notification nobody asked to silence should arrive. */
export function scanNotificationsEnabled(): boolean {
  const raw = process.env.NOTIFY_SCAN_COMPLETED;
  if (raw === undefined || raw.trim() === '') return true;
  return !['false', '0', 'no', 'off'].includes(raw.trim().toLowerCase());
}

/**
 * Send once, keyed on the subject.
 *
 * Stripe redelivers, and a subscriber announced three times reads as three subscribers at the
 * exact moment the number matters most. ops_alerts is already the record of every attempt, so
 * it is also the dedup key; no new table for something this small.
 *
 * Best effort by design. If the lookup fails we send, because a duplicate notification is a
 * smaller problem than a silent one, and this is the file where that trade is always made in
 * that direction.
 */
async function sendOnce(subject: string, lines: string[]): Promise<void> {
  try {
    const { data } = await db().from('ops_alerts').select('id').eq('subject', subject).limit(1);
    if (data && data.length) return;
  } catch {
    /* fall through and send */
  }
  await sendOpsAlert({ subject, lines });
}

/** What the ad was, for the scan this subscriber came from. */
async function creativeFor(scanId: string | null): Promise<string> {
  if (!scanId) return 'no scan on the session, so no attribution';
  try {
    const { data } = await db()
      .from('scans')
      .select('utm_source, utm_campaign, utm_content')
      .eq('id', scanId)
      .maybeSingle();
    const s = data as { utm_source: string | null; utm_campaign: string | null; utm_content: string | null } | null;
    if (!s) return `scan ${scanId} not found`;
    if (!s.utm_content && !s.utm_source) return 'scan carried no utm parameters (direct, or an untagged link)';
    return [s.utm_content ?? 'no utm_content', s.utm_campaign ?? 'no campaign', s.utm_source ?? 'no source'].join('  ·  ');
  } catch {
    return 'could not be read';
  }
}

/**
 * Somebody paid.
 *
 * TRIGGERED ON MONEY, NOT ON INTENT. The caller fires this only from the paid branch of
 * checkout.session.completed, where payment_status is not 'unpaid' and Stripe has the first
 * invoice settled. customer.subscription.created is the tempting event and it is the wrong
 * one: it arrives with status 'incomplete' when the first charge has not cleared, so it would
 * announce subscribers who never pay.
 */
/**
 * What to call each plan in an ops alert. "Founding or else Standard" was true while premium
 * was the only purchasable thing; a Monitoring subscriber would have been reported as
 * "Standard" at US$69, which reads like a mispriced premium rather than a different plan.
 */
const PLAN_LABEL: Partial<Record<PriceKey, string>> = {
  main_monthly: 'Monitoring',
  main_annual: 'Monitoring, annual',
  premium_monthly: 'Monitoring + Review',
  premium_annual: 'Monitoring + Review, annual',
  premium_founding_monthly: 'Founding',
  premium_founding_annual: 'Founding, annual',
};

export async function notifyNewSubscriber(input: {
  subscriptionId: string;
  accountId: string;
  scopeId: string;
  priceKey: PriceKey;
  email: string | null;
  scanId: string | null;
  reportDay: number | null;
}): Promise<void> {
  try {
    const { data: scopeRow } = await db()
      .from('scopes')
      .select('brand_name, category, what_they_sell, website, market, market_country, locality, locality_canonical')
      .eq('id', input.scopeId)
      .maybeSingle();
    const scope = scopeRow as Record<string, string | null> | null;

    // Which founding place this is. Read after the subscription row is written, so a founding
    // subscriber is the Nth including themselves.
    let cohort = 'not a founding subscription';
    if (input.priceKey === 'premium_founding_monthly') {
      try {
        const { taken } = await foundingDisplay();
        cohort = `${taken} of ${FOUNDING_SEATS}`;
      } catch {
        cohort = 'founding, number could not be read';
      }
    }

    const locality = scope?.locality_canonical || scope?.locality || 'whole country';
    const market = [scope?.market, scope?.market_country].filter(Boolean).join(' / ') || 'unknown';

    await sendOnce(`New subscriber: ${scope?.brand_name ?? input.scopeId}`, [
      `${scope?.brand_name ?? 'A subscriber'} has paid and is live.`,
      '',
      `Business:     ${scope?.brand_name ?? 'unknown'}`,
      `Sells:        ${scope?.what_they_sell ?? 'unknown'}`,
      `Website:      ${scope?.website ?? 'unknown'}`,
      `Contact:      ${input.email ?? 'no address on the Stripe session'}`,
      `Category:     ${scope?.category ?? 'unknown'}`,
      `Market:       ${market}`,
      `Locality:     ${locality}`,
      '',
      `Plan:         ${PLAN_LABEL[input.priceKey] ?? input.priceKey}, ${priceLabel(input.priceKey)}/mo`,
      `Founding no:  ${cohort}`,
      '',
      `Scope:        ${input.scopeId}`,
      `Account:      ${input.accountId}`,
      `Subscription: ${input.subscriptionId}`,
      '',
      `First report: due within 24 hours of now. The run is opened by the webhook, and`,
      `              independently by the daily scheduler if that fails.`,
      `Then monthly: day ${input.reportDay ?? 'not set'} of the month.`,
      '',
      `Came from:    ${await creativeFor(input.scanId)}`,
      input.scanId ? `Scan:         ${input.scanId}` : '',
      '',
      'This is a notification. The subscription row is the record.',
    ]);
  } catch (err) {
    // Never throws. A webhook that fails because a notification failed would have Stripe
    // redeliver the whole event and put the receipt at risk, which is the Session 2 lesson.
    console.error('notifyNewSubscriber failed', err instanceof Error ? err.message : err);
  }
}

/** A free scan finished. Volume is the point of this one, so it is the one behind a flag. */
export async function notifyScanCompleted(input: {
  scanId: string;
  domain: string;
  brandName: string | null;
  categoryTerm: string | null;
  country: string | null;
  verdictKind: string;
  competitorCount: number;
  topRecommendation: string | null;
  utmSource: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
}): Promise<void> {
  if (!scanNotificationsEnabled()) return;
  try {
    const attribution =
      input.utmContent || input.utmSource
        ? [input.utmContent ?? 'no utm_content', input.utmCampaign ?? 'no campaign', input.utmSource ?? 'no source'].join('  ·  ')
        : 'no utm parameters (direct, or an untagged link)';

    // Not sendOnce: a domain can legitimately be scanned again once the 24 hour cache expires,
    // and each of those is a real prospect rather than a duplicate to suppress. Two scans of
    // the same domain therefore share a subject and both arrive, which is intended.
    await sendOpsAlert({
      subject: `Free scan: ${input.brandName ?? input.domain}`,
      lines: [
        `${input.brandName ?? input.domain} ran a free scan.`,
        '',
        `Domain:       ${input.domain}`,
        `Category:     ${input.categoryTerm ?? 'unknown'}`,
        `Market:       ${input.country ?? 'unknown'}`,
        '',
        `Result:       ${input.verdictKind}`,
        `Competitors:  ${input.competitorCount} named`,
        `Top pick:     ${input.topRecommendation ?? 'none'}`,
        '',
        `Came from:    ${attribution}`,
        `Scan:         ${input.scanId}`,
        '',
        'No address captured yet at this point: the email gate is a separate step, and a scan',
        'that never reveals is still a prospect worth seeing.',
        '',
        'Switch these off with NOTIFY_SCAN_COMPLETED=false in Vercel, no deploy needed.',
      ],
    });
  } catch (err) {
    console.error('notifyScanCompleted failed', err instanceof Error ? err.message : err);
  }
}
