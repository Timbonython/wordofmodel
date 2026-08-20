/**
 * Authorising the machine-driven routes, and starting tick chains.
 *
 * Four routes are triggered by something other than a person: the daily scheduler, the
 * five-minute sweeper, the manual trigger, and the tick chain calling itself. All four
 * spend money on paid APIs, so all four sit behind the same shared secret rather than
 * behind "nobody knows the URL".
 */

import 'server-only';
import { env } from './env';

/**
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. The manual trigger and the tick
 * chain use the same header, so there is one code path and one thing to rotate.
 *
 * Compared with a length check first and a constant-time-ish scan after. The secret is 64
 * characters of entropy and the routes are not rate limited, so this is belt and braces
 * rather than the thing holding the line.
 */
export function authorised(req: Request): boolean {
  const header = req.headers.get('authorization') || '';
  const presented = header.startsWith('Bearer ') ? header.slice(7) : '';
  const expected = env.cronSecret;
  if (presented.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= presented.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export function unauthorised(): Response {
  return Response.json({ error: 'unauthorised' }, { status: 401 });
}

/**
 * How many tick chains run at once.
 *
 * Four, from measurement rather than taste. Fifty five captures at the measured latencies
 * is about twenty nine minutes of serial work; four chains bring that to roughly eight.
 * More chains would be faster and would also multiply the ceiling overshoot - the cost
 * guard is soft, and a run can exceed it by up to one capture per chain in flight.
 *
 * It is also polite to the surfaces. Four concurrent web-search calls per subscriber is
 * unremarkable; twenty is the shape of traffic that attracts a rate limit.
 */
export const CHAINS = 4;

/**
 * Start N tick chains, fire and forget.
 *
 * Deliberately not awaited for completion and deliberately tolerant of failure. If a kick
 * never lands, the five-minute sweeper finds the pending jobs and starts the chains
 * again. Nothing here is the only path to the work getting done, which is the whole
 * reason the sweeper exists.
 */
export async function kickChains(count = CHAINS): Promise<number> {
  const url = `${env.siteUrl}/api/run/tick`;
  let started = 0;
  await Promise.all(
    Array.from({ length: count }, async () => {
      try {
        await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${env.cronSecret}` },
          // Do not wait for the chain to finish - it may run for minutes.
          signal: AbortSignal.timeout(2_000),
        });
        started++;
      } catch {
        // A timeout here means the chain started and is working, which is the expected
        // case. A real failure is picked up by the sweeper.
        started++;
      }
    }),
  );
  return started;
}
