import { rewriteQuestion } from '@/lib/onboarding';
import {
  InputError,
  parseCompetitors,
  parseProfile,
  parseQuestions,
  parseSlot,
} from '@/lib/wizard-input';
import { checkRateLimit, clientIp, hashIp, recordAttempt } from '@/lib/ratelimit';

export const runtime = 'nodejs';
export const maxDuration = 120;

/** The "rewrite this one" button. Regenerates a single slot, keeps the rest. */
export async function POST(request: Request) {
  const ipHash = hashIp(clientIp(request.headers));
  const limit = await checkRateLimit(ipHash, 'wizard');
  if (!limit.ok) return Response.json({ error: limit.message }, { status: 429 });

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const slot = parseSlot(body.slot);
    const profile = parseProfile(body.profile);
    const competitors = parseCompetitors(body.competitors);
    const questions = parseQuestions(body.questions);

    const current = questions.find((q) => q.slot === slot);
    const others = questions.filter((q) => q.slot !== slot);
    if (!current) throw new InputError('That question is not in the set.');

    await recordAttempt(ipHash, 'wizard');
    const text = await rewriteQuestion({
      slot,
      current: current.text,
      others,
      profile,
      competitors,
    });
    return Response.json({ slot, text });
  } catch (err) {
    if (err instanceof InputError) return Response.json({ error: err.message }, { status: 400 });
    console.error('question rewrite failed', err instanceof Error ? err.message : err);
    return Response.json({ error: 'That rewrite did not come back. Try again.' }, { status: 502 });
  }
}
