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

const LIMITS = [
  { kind: 'scan', windowMinutes: 60, max: 5, message: 'That is five scans in an hour. Try again a little later.' },
  { kind: 'scan', windowMinutes: 60 * 24, max: 20, message: 'That is the daily limit. Try again tomorrow.' },
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
export async function checkRateLimit(ipHash: string, kind: 'scan' | 'reveal' | 'waitlist'): Promise<RateVerdict> {
  const applicable = kind === 'scan' ? LIMITS : [{ kind, windowMinutes: 60, max: 20, message: 'Too many requests. Try again shortly.' }];

  for (const limit of applicable) {
    const since = new Date(Date.now() - limit.windowMinutes * 60 * 1000).toISOString();
    const { count, error } = await db()
      .from('rate_events')
      .select('id', { count: 'exact', head: true })
      .eq('ip_hash', ipHash)
      .eq('kind', kind)
      .gte('created_at', since);

    // If the limiter itself is broken, let the request through rather than
    // breaking the front page. The 24 hour cache still caps the damage.
    if (error) return { ok: true };
    if ((count ?? 0) >= limit.max) return { ok: false, message: limit.message };
  }
  return { ok: true };
}

export async function recordAttempt(ipHash: string, kind: 'scan' | 'reveal' | 'waitlist'): Promise<void> {
  await db().from('rate_events').insert({ ip_hash: ipHash, kind });
}
