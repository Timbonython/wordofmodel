/**
 * Our own record of who arrived, how far they got, and which ad produced them.
 *
 * MEASURED SERVER SIDE, ON PURPOSE. Meta's dashboard is a bidding tool: it reports what it
 * would like to be paid for, it cannot be audited, and it will not match this. When the two
 * disagree the difference is worth saying out loud rather than quietly picking the flattering
 * one, which is the same standard the report holds itself to.
 *
 * THE SCAN ID IS THE JOIN KEY, and it is the only thing here that survives real behaviour.
 * People scan on a phone and pay on a laptop; a cookie does not cross that gap, and neither
 * does a cleared browser or an ad blocker. The id travels in the URL, into the Checkout
 * session metadata, and onto the subscription row.
 *
 * NOTHING HERE MAY BREAK A REQUEST. Every write is wrapped and swallowed: a funnel row that
 * fails to insert costs a number on an internal page, and a scan that fails because a funnel
 * row would not insert costs a customer. The console line is the fallback, and the same
 * reasoning governs sendOpsAlert.
 */

import 'server-only';
import { db } from './db';

export type FunnelEvent =
  | 'scan_started'
  | 'scan_completed'
  | 'wizard_started'
  | 'checkout_started'
  | 'subscription_active';

/** First-touch parameters, exactly the ones Meta needs and nothing else. */
export interface TouchParams {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  fbclid: string | null;
}

/** Trimmed, length-capped, and null when empty. These arrive from a URL a stranger controls. */
function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, 200);
  return trimmed || null;
}

export function touchFrom(source: Record<string, unknown> | URLSearchParams): TouchParams {
  const get = (k: string) =>
    source instanceof URLSearchParams ? source.get(k) : (source[k] as unknown);
  return {
    utm_source: clean(get('utm_source')),
    utm_medium: clean(get('utm_medium')),
    utm_campaign: clean(get('utm_campaign')),
    utm_content: clean(get('utm_content')),
    fbclid: clean(get('fbclid')),
  };
}

/**
 * Record one step.
 *
 * Idempotent per scan by the unique index in 0014: a subscriber who reloads /start four times
 * started the wizard once, and a funnel that counts reloads reports a conversion rate that
 * flatters the page it is measuring. A conflict is the ordinary case, not an error.
 */
export async function recordFunnel(input: {
  event: FunnelEvent;
  scanId?: string | null;
  accountId?: string | null;
  utmSource?: string | null;
}): Promise<void> {
  try {
    const utmSource = input.utmSource ?? (input.scanId ? await sourceForScan(input.scanId) : null);
    const { error } = await db()
      .from('funnel_events')
      .insert({
        event: input.event,
        scan_id: input.scanId ?? null,
        account_id: input.accountId ?? null,
        utm_source: utmSource,
      });
    // 23505 is the unique index doing its job on a reload. Anything else is worth a line.
    if (error && error.code !== '23505') throw new Error(error.message);
  } catch (err) {
    console.error(`funnel: could not record ${input.event}`, err instanceof Error ? err.message : err);
  }
}

/** The source the scan was tagged with at first touch, so every later step inherits it. */
async function sourceForScan(scanId: string): Promise<string | null> {
  const { data, error } = await db().from('scans').select('utm_source').eq('id', scanId).maybeSingle();
  if (error) return null;
  return (data as { utm_source: string | null } | null)?.utm_source ?? null;
}

/**
 * The internal table: by day and by source, how many reached each step.
 *
 * Deliberately counts DISTINCT scans rather than rows for the attributed steps, so a reload
 * cannot inflate a rate. Rows with no scan behind them - somebody who opened /start cold, or
 * arrived from a channel with no tag - are counted under a source of "direct" rather than
 * dropped, because a funnel that hides its unattributed traffic reports a better conversion
 * rate than the business has.
 */
export interface FunnelRow {
  day: string;
  source: string;
  scan_started: number;
  scan_completed: number;
  wizard_started: number;
  checkout_started: number;
  subscription_active: number;
}

export async function funnelTable(days = 30): Promise<FunnelRow[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const { data, error } = await db()
    .from('funnel_events')
    .select('event, scan_id, utm_source, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(10_000);
  if (error) throw new Error(`Could not read the funnel: ${error.message}`);

  const rows = new Map<string, FunnelRow & { seen: Record<string, Set<string>> }>();
  for (const e of (data ?? []) as Array<{ event: FunnelEvent; scan_id: string | null; utm_source: string | null; created_at: string }>) {
    const day = e.created_at.slice(0, 10);
    const source = e.utm_source ?? 'direct';
    const key = `${day}|${source}`;
    const row =
      rows.get(key) ??
      rows
        .set(key, {
          day,
          source,
          scan_started: 0,
          scan_completed: 0,
          wizard_started: 0,
          checkout_started: 0,
          subscription_active: 0,
          seen: {},
        })
        .get(key)!;

    // Distinct scans per step. A null scan id is its own occurrence and cannot be deduplicated,
    // which is exactly what "we could not attribute this" means.
    const bucket = (row.seen[e.event] ??= new Set<string>());
    const identity = e.scan_id ?? `anon:${e.created_at}`;
    if (bucket.has(identity)) continue;
    bucket.add(identity);
    row[e.event] += 1;
  }

  return [...rows.values()]
    .map(({ seen: _seen, ...row }) => row)
    .sort((a, b) => b.day.localeCompare(a.day) || a.source.localeCompare(b.source));
}
