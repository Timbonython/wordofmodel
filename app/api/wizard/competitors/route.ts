import { proposeCompetitors } from '@/lib/onboarding';
import { InputError, parseProfile } from '@/lib/wizard-input';
import { checkRateLimit, clientIp, hashIp, recordAttempt } from '@/lib/ratelimit';

export const runtime = 'nodejs';
export const maxDuration = 180;

/**
 * Step 2. Four proposed, one call, web search on.
 *
 * This screen earns its place by routinely surfacing a competitor the customer
 * did not know they had. That is the second small shock after the free scan, and
 * it happens before the card.
 */
export async function POST(request: Request) {
  const ipHash = hashIp(clientIp(request.headers));
  const limit = await checkRateLimit(ipHash, 'wizard');
  if (!limit.ok) return Response.json({ error: limit.message }, { status: 429 });

  try {
    const profile = parseProfile((await request.json().catch(() => ({}))).profile);
    await recordAttempt(ipHash, 'wizard');
    const { competitors, reasoning } = await proposeCompetitors(profile);
    return Response.json({ competitors, reasoning });
  } catch (err) {
    if (err instanceof InputError) return Response.json({ error: err.message }, { status: 400 });
    console.error('competitor proposal failed', err instanceof Error ? err.message : err);
    return Response.json(
      { error: 'We could not work out your competitors just now. Add them yourself, or try again.' },
      { status: 502 },
    );
  }
}
