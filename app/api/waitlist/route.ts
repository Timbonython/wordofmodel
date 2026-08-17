import { joinWaitlist } from '@/lib/db';
import { normaliseDomain } from '@/lib/domain';
import { validEmail } from '@/lib/email';
import { checkRateLimit, clientIp, hashIp, recordAttempt } from '@/lib/ratelimit';

export const runtime = 'nodejs';

/**
 * Stands in for the onboarding wizard. No Stripe, no accounts: an address and
 * where it came from, so the first twenty founding subscribers can be worked
 * through by hand.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    domain?: string;
    source?: string;
    scanId?: string;
  };

  const email = validEmail(body.email ?? '');
  if (!email) return Response.json({ error: 'That address does not look right.' }, { status: 400 });

  const ipHash = hashIp(clientIp(request.headers));
  const limit = await checkRateLimit(ipHash, 'waitlist');
  if (!limit.ok) return Response.json({ error: limit.message }, { status: 429 });

  const source = ['pricing', 'result', 'close', 'hero'].includes(body.source ?? '') ? body.source! : 'pricing';

  await recordAttempt(ipHash, 'waitlist');
  await joinWaitlist({
    email,
    domain: normaliseDomain(body.domain ?? '') ?? null,
    source,
    scanId: body.scanId?.trim() || null,
    ipHash,
  });

  return Response.json({ ok: true });
}
