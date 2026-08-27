import 'server-only';
import { createHash } from 'node:crypto';
import { env } from './env';
import { db } from './db';

/**
 * Visitor IPs are only ever stored as a salted hash. The scans table is a
 * prospect list, and a plaintext address in it is a liability with no upside:
 * rate limiting only needs to know that two requests came from the same place.
 */
export function hashIp(ip: string): string {
  return createHash('sha256').update(`${env.ipHashSalt}:${ip}`).digest('hex').slice(0, 32);
}

export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip')?.trim() || '0.0.0.0';
}

/** An address, hashed the same way and for the same reason as an IP. */
export function hashEmail(email: string): string {
  return createHash('sha256').update(`${env.ipHashSalt}:${email.trim().toLowerCase()}`).digest('hex').slice(0, 32);
}

/**
 * A cap from the environment, falling back to the default.
 *
 * ZERO IS A VALID CAP and is the kill switch: set SCAN_CAP_GLOBAL_DAY=0 and no scan starts,
 * which is the thing you want at 2am when something is looping and you are not at a keyboard
 * that can deploy. So the test is `>= 0`, not `> 0`.
 *
 * The raw string is checked for emptiness first, because Number('') is 0, and an env var that
 * exists but is blank would otherwise read as a deliberate zero and silently take the scan
 * offline. Unset and empty both mean "use the default"; only a real number overrides.
 */
function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const v = Number(raw);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

/**
 * Every cap, in one place, each overridable by an environment variable so a number can be
 * changed from the Vercel dashboard in a minute rather than through a deploy. That matters
 * most at exactly the moment a cap is wrong: mid-campaign, with spend running.
 */
export const CAPS = {
  /** Scans started per IP, per hour and per day. */
  get scanPerIpHour() {
    return num('SCAN_CAP_IP_HOUR', 5);
  },
  get scanPerIpDay() {
    return num('SCAN_CAP_IP_DAY', 20);
  },
  /**
   * EVERY scan started, by anybody, in a UTC day.
   *
   * This is the only one that actually bounds the bill. An IP costs an abuser nothing and a
   * script can have thousands, so a per-IP limit shapes behaviour without capping spend.
   */
  get scanPerDay() {
    return num('SCAN_CAP_GLOBAL_DAY', 150);
  },
  /** Reveals per address per day: one person, one scan result, a few retries. */
  get revealPerEmailDay() {
    return num('SCAN_CAP_EMAIL_DAY', 5);
  },
} as const;

const LIMITS = [
  { kind: 'scan', windowMinutes: 60, max: () => CAPS.scanPerIpHour, message: 'That is a few scans in an hour. Try again a little later.' },
  { kind: 'scan', windowMinutes: 60 * 24, max: () => CAPS.scanPerIpDay, message: 'That is the daily limit for one visitor. Try again tomorrow.' },
] as const;

export interface RateVerdict {
  ok: boolean;
  message?: string;
}

/**
 * Counts recorded attempts in each window before allowing another. Cached scans
 * do not call this, so a repeat visitor reading their own result is never
 * refused.
 */
export async function checkRateLimit(ipHash: string, kind: 'scan' | 'reveal' | 'waitlist' | 'login' | 'wizard'): Promise<RateVerdict> {
  const applicable =
    kind === 'scan'
      ? LIMITS
      : [{ kind, windowMinutes: 60, max: () => 20, message: 'Too many requests. Try again shortly.' }];

  for (const limit of applicable) {
    const since = new Date(Date.now() - limit.windowMinutes * 60 * 1000).toISOString();
    const { count, error } = await db()
      .from('rate_events')
      .select('id', { count: 'exact', head: true })
      .eq('ip_hash', ipHash)
      .eq('kind', kind)
      .gte('created_at', since);

    // If the per-IP limiter itself is broken, let the request through rather than breaking the
    // front page. This one shapes behaviour; the global cap below is what bounds the bill, and
    // that one fails the other way on purpose.
    if (error) return { ok: true };
    if ((count ?? 0) >= limit.max()) return { ok: false, message: limit.message };
  }
  return { ok: true };
}

/** Start of the current UTC day. The cap resets at midnight UTC, not local midnight. */
function startOfUtcDay(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

/**
 * The global daily ceiling on scans started.
 *
 * FAILS CLOSED, and that is the whole point of it. Every other limiter here lets a request
 * through when it cannot make up its mind, because the cost of a false refusal is one annoyed
 * visitor. This one guards an unauthenticated endpoint that spends money at two providers on
 * every call, while a campaign points traffic at it. If we cannot prove we are under the cap,
 * we are not under the cap.
 *
 * Counts rows in `scans`, not attempts, because a scan row is the thing that cost money.
 */
export async function checkGlobalScanCap(): Promise<RateVerdict> {
  const cap = CAPS.scanPerDay;
  const { count, error } = await db()
    .from('scans')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', startOfUtcDay());

  if (error) {
    console.error('scan cap: could not count today, refusing', error.message);
    return {
      ok: false,
      message: 'We cannot start new scans just now. Try again in a few minutes.',
    };
  }

  const used = count ?? 0;
  if (used < cap) return { ok: true };

  return {
    ok: false,
    message:
      'We have hit our limit of free scans for today. This one is on us to fix, not you. ' +
      'Leave your address and we will run yours first thing tomorrow.',
  };
}

/**
 * Tell somebody once per day that the cap tripped, not once per refused request.
 *
 * A marker row rather than a counter: cheap, and it resets with the UTC day like the cap does.
 * Two requests refused in the same instant can both find no marker and both alert; one extra
 * email on the day a cap trips is not worth a lock.
 */
export async function noteGlobalCapTripped(): Promise<boolean> {
  const { count, error } = await db()
    .from('rate_events')
    .select('id', { count: 'exact', head: true })
    .eq('kind', 'scan_cap_alerted')
    .gte('created_at', startOfUtcDay());
  if (error) return false;
  if ((count ?? 0) > 0) return false;

  await db().from('rate_events').insert({ ip_hash: 'global', kind: 'scan_cap_alerted' });
  return true;
}

/** Per address, for steps where an address is known. Fails open like the per-IP limiter. */
export async function checkEmailRateLimit(
  emailHash: string,
  kind: 'reveal',
): Promise<RateVerdict> {
  const { count, error } = await db()
    .from('rate_events')
    .select('id', { count: 'exact', head: true })
    .eq('email_hash', emailHash)
    .eq('kind', kind)
    .gte('created_at', startOfUtcDay());
  if (error) return { ok: true };
  if ((count ?? 0) >= CAPS.revealPerEmailDay) {
    return { ok: false, message: 'That address has had its results a few times today already.' };
  }
  return { ok: true };
}

export async function recordEmailAttempt(emailHash: string, kind: 'reveal'): Promise<void> {
  await db().from('rate_events').insert({ ip_hash: 'email', kind, email_hash: emailHash });
}

export async function recordAttempt(ipHash: string, kind: 'scan' | 'reveal' | 'waitlist' | 'login' | 'wizard'): Promise<void> {
  await db().from('rate_events').insert({ ip_hash: ipHash, kind });
}
