import { proposeQuestions } from '@/lib/onboarding';
import { InputError, parseCompetitors, parseProfile } from '@/lib/wizard-input';
import { checkRateLimit, clientIp, hashIp, recordAttempt } from '@/lib/ratelimit';

export const runtime = 'nodejs';
export const maxDuration = 180;

/**
 * Step 3. The five slots, generated against the fixed structure rather than
 * freehand, so every subscriber's report is comparable month to month and client
 * to client.
 *
 * Competitors come in with the request because slot 3 is written against the
 * largest of them. That is why this step follows the competitor step and not the
 * other way round.
 */
export async function POST(request: Request) {
  const ipHash = hashIp(clientIp(request.headers));
  const limit = await checkRateLimit(ipHash, 'wizard');
  if (!limit.ok) return Response.json({ error: limit.message }, { status: 429 });

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const profile = parseProfile(body.profile);
    const competitors = parseCompetitors(body.competitors);
    await recordAttempt(ipHash, 'wizard');
    const questions = await proposeQuestions(profile, competitors);
    return Response.json({ questions });
  } catch (err) {
    if (err instanceof InputError) return Response.json({ error: err.message }, { status: 400 });
    console.error('question generation failed', err instanceof Error ? err.message : err);
    return Response.json(
      { error: 'We could not write the five questions just now. Try again in a moment.' },
      { status: 502 },
    );
  }
}
