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
import type { TouchParams } from './touch';

export type FunnelEvent =
  /**
   * A CLICK on an ad that landed on the home page. One row per click id, enforced by the
   * unique index in 0020.
   *
   * CHANGED MEANING ON 2026-08-28. Before that date this counted attributed server renders,
   * which included every crawler fetch of an ad URL - see 0020. Do not compare across the
   * boundary; the step down is a definition change, not a drop in traffic.
   */
  | 'landed'
  | 'scan_started'
  | 'scan_completed'
  | 'wizard_started'
  | 'checkout_started'
  | 'subscription_active'
  /* ------------------------------------------------------------------ reviews, 30 Aug 2026 */
  | 'review_form_view'
  | 'review_form_started'
  | 'review_submitted'
  /**
   * A CLICK THROUGH to Google, G2 or Trustpilot. Not a post.
   *
   * No platform tells us whether a review was actually left, so this counts the only thing
   * anybody can observe. Reading it as "reviews posted elsewhere" would be inventing a number,
   * which is the one thing this table has already been rebuilt once for doing.
   */
  | 'external_review_clicked';

/**
 * First touch, and the click-id gate. Defined in lib/touch.ts and re-exported here.
 *
 * MOVED 1 SEP 2026, and the callers were left alone on purpose: everything that imports
 * touchFrom, isClick, TouchParams or CLICK_ID_PARAMS from '@/lib/funnel' still works, because
 * this is where they have always been read from and a rename would have touched six files to
 * change nothing. The move exists so proxy.ts can parse a URL without pulling `server-only`
 * and the Supabase client into the bundle that runs ahead of the front page. See lib/touch.ts.
 */
export { CLICK_ID_PARAMS, touchFrom, isClick } from './touch';
export type { ClickIdParam, TouchParams } from './touch';

/** The date landed changed meaning. Printed wherever the series is read. */
export const LANDED_CUTOVER = '2026-08-28';

/**
 * Record one step.
 *
 * Idempotent per scan by the unique index in 0014, and per click id by the one in 0020: a
 * subscriber who reloads /start four times started the wizard once, and somebody who reloads
 * the home page four times clicked one ad. A funnel that counts reloads reports a conversion
 * rate that flatters the page it is measuring. A conflict is the ordinary case, not an error.
 */
export async function recordFunnel(input: {
  event: FunnelEvent;
  /**
   * A qualifier for events that need one - today, which platform an external_review_clicked
   * went to. NEVER attribution: the utm columns are what carry that, and writing a platform
   * name into utm_content would corrupt the ad reporting this table exists for.
   */
  detail?: string | null;
  scanId?: string | null;
  accountId?: string | null;
  /**
   * First touch for this step. Pass it wherever a URL is in hand; where it is not, a scanId
   * lets the row inherit what the scan was tagged with.
   *
   * ALL OF THEM, not just the source. utm_content is the one that separates hook A from hook C
   * and static from video, so a four ad test is unreadable without it, and click_id is what
   * separates a person from a crawler.
   */
  touch?: Partial<TouchParams> | null;
  /**
   * The requesting user-agent, where there is a request.
   *
   * STORED, NEVER FILTERED ON. 0019 tried to keep crawlers out with a list of three Meta
   * user-agent strings. It shipped, it worked, and every other crawler on the internet walked
   * past it. This column exists so that the next time these numbers look wrong the answer is
   * in the data - the 129 rows written before 0020 cannot be restated because nobody stored it.
   */
  userAgent?: string | null;
}): Promise<void> {
  try {
    const supplied = input.touch ?? null;
    const hasSupplied = supplied && Object.values(supplied).some((v) => v);
    const touch = hasSupplied ? supplied : input.scanId ? await touchForScan(input.scanId) : null;

    const { error } = await db()
      .from('funnel_events')
      .insert({
        event: input.event,
        detail: input.detail ?? null,
        scan_id: input.scanId ?? null,
        account_id: input.accountId ?? null,
        utm_source: touch?.utm_source ?? null,
        utm_medium: touch?.utm_medium ?? null,
        utm_campaign: touch?.utm_campaign ?? null,
        utm_content: touch?.utm_content ?? null,
        fbclid: touch?.fbclid ?? null,
        click_id: touch?.click_id ?? null,
        click_id_param: touch?.click_id_param ?? null,
        user_agent: input.userAgent?.slice(0, 400) ?? null,
      });
    // 23505 is a unique index doing its job: a reload of a scan-tagged step (0014), or a second
    // render carrying a click id already recorded (0020). Both are the ordinary case. Anything
    // else is worth a line.
    if (error && error.code !== '23505') throw new Error(error.message);
  } catch (err) {
    console.error(`funnel: could not record ${input.event}`, err instanceof Error ? err.message : err);
  }
}

/** What the scan was tagged with at first touch, so every later step inherits the whole set. */
async function touchForScan(scanId: string): Promise<TouchParams | null> {
  const { data, error } = await db()
    .from('scans')
    .select('utm_source, utm_medium, utm_campaign, utm_content, fbclid')
    .eq('id', scanId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Omit<TouchParams, 'click_id' | 'click_id_param'>;
  // NULL ON PURPOSE, not an oversight. The click id belongs to the landing, and 0020's unique
  // index is scoped to landed rows only - inheriting it onto scan_started would make a scan
  // collide with the click that produced it. Later steps are deduplicated by scan_id instead.
  return { ...row, click_id: null, click_id_param: null };
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
  /** Ad CLICKS that landed, one per click id. Meaning changed 2026-08-28 - see 0020. */
  landed: number;
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
          landed: 0,
          scan_started: 0,
          scan_completed: 0,
          wizard_started: 0,
          checkout_started: 0,
          subscription_active: 0,
          seen: {},
        })
        .get(key)!;

    // THIS TABLE IS THE ACQUISITION FUNNEL AND ONLY THAT. The review events share the
    // funnel_events table because they are the same kind of thing to record, but a review is
    // not a step between landing and subscribing - it happens to people who already arrived,
    // sometimes months later. Adding them as columns would widen the table with numbers that
    // do not belong in the same row and cannot be read as a progression. Counted elsewhere.
    if (!(e.event in row)) continue;

    // Distinct scans per step. A null scan id is its own occurrence and cannot be deduplicated,
    // which is exactly what "we could not attribute this" means.
    const bucket = (row.seen[e.event] ??= new Set<string>());
    const identity = e.scan_id ?? `anon:${e.created_at}`;
    if (bucket.has(identity)) continue;
    bucket.add(identity);
    const counts = row as unknown as Record<string, number>;
    counts[e.event] = (counts[e.event] ?? 0) + 1;
  }

  return [...rows.values()]
    .map(({ seen: _seen, ...row }) => row)
    .sort((a, b) => b.day.localeCompare(a.day) || a.source.localeCompare(b.source));
}
