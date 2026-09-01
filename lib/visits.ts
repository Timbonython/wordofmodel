/**
 * The traffic instrument: one row per visitor per Adelaide day.
 *
 * WHY IT IS NOT IN funnel_events. Since 0020 a `landed` row requires a click id, which makes it
 * a count of paid clicks and deliberately blind to every organic visitor. That is the right
 * definition for that column and the wrong one for traffic, so traffic gets its own table.
 * The two are read side by side and never averaged.
 *
 * WHY IT IS SERVER SIDE. A browser script is the ordinary way to count visitors and it is the
 * one thing that cannot answer this question: the open worry on 1 Sep 2026 is whether ad
 * traffic is executing our JavaScript at all. An instrument that only works when the page's
 * JavaScript works cannot tell you that the page's JavaScript is not working.
 *
 * NOTHING HERE MAY BREAK A REQUEST, and it is enforced twice: every write is wrapped and
 * swallowed, and the whole call is handed to event.waitUntil in proxy.ts so it is not on the
 * response path at all. A visit row that fails to insert costs a number on an internal page. A
 * front page that fails because a visit row would not insert costs the business. Same standard
 * as lib/funnel.ts, which is where this rule is written down.
 *
 * READS process.env DIRECTLY, NOT lib/env. Deliberate, and the same choice proxy.ts already
 * documents: a missing variable here must return quietly, not throw. lib/env's `required()`
 * would take the whole site down over a measurement.
 *
 * NODE RUNTIME. `node:crypto` is used because Next 16 runs proxy.ts on the Node runtime by
 * default. If proxy.ts is ever moved to the Edge runtime this file must switch to
 * crypto.subtle.digest, which is async and returns an ArrayBuffer. It will fail loudly at
 * build time rather than silently, which is the acceptable version of that mistake.
 */

import { createHash } from 'node:crypto';
import { touchFrom, type TouchParams } from './touch';

/**
 * The Adelaide date, as YYYY-MM-DD.
 *
 * en-CA because it is the locale that formats as ISO, which is the one trick here. Intl handles
 * the half-hour offset and both sides of daylight saving, so nothing in this file ever does
 * arithmetic on a timezone - which is the only way this stays correct through October.
 */
export function adelaideDay(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Adelaide',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * The per-day identity. Salt, day, address, agent.
 *
 * THE DAY IS INSIDE THE HASH, which is the entire privacy design: the same person tomorrow
 * produces an unrelated value, so this table holds no durable identifier and needs no consent
 * banner. It also means the count is UNIQUE VISITORS PER DAY and can never be summed into
 * "unique visitors this month" - that number is not in this table and must not be invented from
 * it. scripts/visits.mjs prints per-day rows for this reason.
 *
 * The user-agent is included so that two people behind one office NAT are two visitors rather
 * than one. It also means one person switching browsers counts twice. Both errors are small and
 * they point in opposite directions; the alternative, a cookie, is the thing being avoided.
 */
function visitorHash(salt: string, day: string, ip: string, userAgent: string): string {
  return createHash('sha256').update(`${salt}:${day}:${ip}:${userAgent}`).digest('hex').slice(0, 32);
}

/**
 * The STATIC-salt hash, byte for byte what lib/ratelimit.ts writes into scans.ip_hash.
 *
 * Duplicated rather than imported because lib/ratelimit.ts is `server-only` and pulls in
 * lib/db and lib/env behind it - the whole Supabase client and a `required()` that throws - and
 * none of that belongs in the bundle that runs in front of every request. The cost of the
 * duplication is that these two lines must stay identical, which is why both say so.
 *
 * KEEP IN SYNC WITH lib/ratelimit.ts hashIp(). If they diverge, visits stop joining to scans
 * and the visit-to-scan rate silently becomes zero rather than failing.
 */
function ipHash(salt: string, ip: string): string {
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}

/** Same order and same reasoning as lib/ratelimit.ts clientIp(). */
function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip')?.trim() || '0.0.0.0';
}

/**
 * Is this request a person opening a page, rather than the machinery around one?
 *
 * THE PREFETCH IS THE ONE THAT WOULD RUIN THE NUMBER. next/link prefetches on hover and on
 * viewport entry, so one visitor idly scrolling the home page can issue half a dozen requests
 * for /pricing, /faq and /method. Counted, that is six visits from one person - and it is
 * exactly the class of inflation that produced the phantom 4.6x on 28 Aug. The prefetch and RSC
 * headers are how Next says "this is not a navigation".
 *
 * `sec-fetch-dest: document` is a top-level navigation. An ABSENT value is counted, not
 * dropped: every crawler omits it, and crawlers belong in this table with their user-agent
 * stored so they can be separated at read time. Dropping them here would be the 0019 blocklist
 * again, only invisible.
 */
function isPageView(request: { method: string; headers: Headers }): boolean {
  if (request.method !== 'GET') return false;
  const h = request.headers;
  if (h.get('next-router-prefetch')) return false;
  if (h.get('purpose') === 'prefetch' || h.get('x-purpose') === 'prefetch') return false;
  if (h.get('rsc')) return false;
  const dest = h.get('sec-fetch-dest');
  if (dest && dest !== 'document') return false;
  return true;
}

export interface VisitRow {
  day: string;
  visitor_hash: string;
  path: string;
  user_agent: string | null;
  ip_hash: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  click_id: string | null;
  click_id_param: string | null;
}

/** Everything the row needs, or null when this request is not a page view. */
export function visitRowFor(request: {
  method: string;
  headers: Headers;
  nextUrl: URL;
}): VisitRow | null {
  const salt = process.env.IP_HASH_SALT;
  if (!salt) return null;
  if (!isPageView(request)) return null;

  const day = adelaideDay();
  const ip = clientIp(request.headers);
  const userAgent = request.headers.get('user-agent');
  const touch: TouchParams = touchFrom(request.nextUrl.searchParams);

  return {
    day,
    visitor_hash: visitorHash(salt, day, ip, userAgent ?? ''),
    path: request.nextUrl.pathname.slice(0, 200),
    user_agent: userAgent?.slice(0, 400) ?? null,
    ip_hash: ipHash(salt, ip),
    utm_source: touch.utm_source,
    utm_medium: touch.utm_medium,
    utm_campaign: touch.utm_campaign,
    utm_content: touch.utm_content,
    click_id: touch.click_id,
    click_id_param: touch.click_id_param,
  };
}

/**
 * Write it, or don't, and never say so louder than a console line.
 *
 * A PLAIN fetch RATHER THAN THE SUPABASE CLIENT. This runs in front of every request on the
 * site, so the bundle in proxy.ts should carry one fetch and not a database library. It also
 * keeps the secret key out of any module that could plausibly be imported by a component.
 *
 * `Prefer: resolution=ignore-duplicates` is the upsert. The primary key (day, visitor_hash)
 * decides, so the FIRST request of the day wins and the row keeps the utm and click id of the
 * page they actually landed on. A later navigation to /pricing must not overwrite the ad that
 * produced the visit, which is what `resolution=merge-duplicates` would have quietly done.
 */
export async function recordVisit(row: VisitRow): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return;

  try {
    const response = await fetch(`${url}/rest/v1/visits`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates,return=minimal',
      },
      body: JSON.stringify([row]),
      cache: 'no-store',
    });
    // 409 is the primary key doing its job on a race between two tabs opened together. The
    // Prefer header handles the ordinary repeat; this is the narrow one it cannot.
    if (!response.ok && response.status !== 409) {
      console.error(`visits: ${response.status} ${(await response.text()).slice(0, 200)}`);
    }
  } catch (err) {
    console.error('visits: could not record', err instanceof Error ? err.message : err);
  }
}

/* ------------------------------------------------------------------------ reading it back */

/**
 * Declared bots, matched at READ time and never at write time.
 *
 * THE LIST IS WRONG AND THAT IS THE POINT. 0019 put a list like this in front of the write, it
 * knew three names, it shipped correctly, and every other crawler on the internet walked past
 * it - and because the rows were never written, the mistake could not be undone. Here the rows
 * exist either way and the list only decides which column a visit is printed in, so when this
 * list turns out to be wrong the fix is to edit it and re-read history rather than to shrug at
 * a number that cannot be restated.
 *
 * Directional only. Never subtract it from unique visitors and call the remainder humans.
 */
const DECLARED_BOT =
  /bot|crawler|spider|crawl|slurp|facebookexternalhit|meta-externalagent|facebookcatalog|headlesschrome|python-requests|curl\/|wget|axios|node-fetch|go-http-client|scrapy|semrush|ahrefs|dataforseo|lighthouse|pingdom|uptime/i;

export interface VisitDay {
  day: string;
  /** Distinct visitor_hash. ERRS HIGH: every crawler is in here. */
  visitors: number;
  /** Of those, whose user-agent declares itself. A blocklist, so directional only. */
  declared_bots: number;
  /** Any utm_source present. NOT A PAID-TRAFFIC NUMBER - a crawler inherits utm from the ad URL. */
  with_utm: number;
  /** A click id present. ERRS LOW - privacy browsers strip them. The line to decide on. */
  with_click_id: number;
  /** Paid visits split by ad, from utm_content. Only counted on rows that carry a click id. */
  by_ad: Record<string, number>;
}

/**
 * Visits per Adelaide day, newest first.
 *
 * FOUR NUMBERS PER DAY AND NEVER ONE, which is the contract the daily-report brief sets and the
 * reason this returns a shape rather than a total. A single "visitors" figure invites the
 * comparison it cannot survive - against Meta's landing page views, which since July 2025 are
 * MODELLED and do not require our page to have loaded at all. The two are not the same
 * measurement and printing one number encourages reading them as if they were.
 */
export async function visitsByDay(days = 30): Promise<VisitDay[]> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required to read visits.');

  const since = adelaideDay(new Date(Date.now() - days * 86_400_000));
  const query =
    `select=day,visitor_hash,user_agent,utm_source,utm_content,click_id` +
    `&day=gte.${since}&order=day.desc&limit=100000`;

  const response = await fetch(`${url}/rest/v1/visits?${query}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: 'no-store',
  });
  if (!response.ok) {
    // 42P01 is "relation does not exist", which here means one specific thing worth saying
    // out loud rather than making somebody read a PostgREST error: the migration is not applied.
    const body = await response.text();
    if (body.includes('42P01')) {
      throw new Error('The visits table does not exist. Run supabase/migrations/0025_visits.sql.');
    }
    throw new Error(`Could not read visits: ${response.status} ${body.slice(0, 200)}`);
  }

  const rows = (await response.json()) as Array<{
    day: string;
    visitor_hash: string;
    user_agent: string | null;
    utm_source: string | null;
    utm_content: string | null;
    click_id: string | null;
  }>;

  const byDay = new Map<string, VisitDay>();
  for (const r of rows) {
    const d =
      byDay.get(r.day) ??
      byDay
        .set(r.day, { day: r.day, visitors: 0, declared_bots: 0, with_utm: 0, with_click_id: 0, by_ad: {} })
        .get(r.day)!;
    // The primary key already guarantees one row per visitor per day, so this is a count of
    // rows and not a deduplication. If that ever stops being true the table is wrong, not this.
    d.visitors += 1;
    if (r.user_agent && DECLARED_BOT.test(r.user_agent)) d.declared_bots += 1;
    if (r.utm_source) d.with_utm += 1;
    if (r.click_id) {
      d.with_click_id += 1;
      const ad = r.utm_content ?? '(untagged)';
      d.by_ad[ad] = (d.by_ad[ad] ?? 0) + 1;
    }
  }

  return [...byDay.values()].sort((a, b) => b.day.localeCompare(a.day));
}
