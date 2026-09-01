import { MissingFactError, writeBuyerQuestion } from '@/lib/question';
import { profileFrom } from '@/lib/detect';
import { normaliseDomain, brandFromDomain } from '@/lib/domain';
import { checkRateLimit, clientIp, hashIp, recordAttempt } from '@/lib/ratelimit';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Rewrite the question from corrected facts, while the visitor is still looking at the card.
 *
 * WHY THIS EXISTS AT ALL. Until 1 Sep 2026 the confirm card showed three facts and the question
 * was written from them out of sight: correcting a fact dropped the question, and the visitor
 * found out what their correction had produced only once both engines had already been asked.
 * The question is the thing the whole scan turns on, so it is now on the card and editable - and
 * a question on screen that no longer matches the facts under it is a worse lie than no question
 * at all. This is what keeps the two in agreement.
 *
 * NOT A SECOND NARROWING. It calls profileFrom, the one line in the codebase that turns a wide
 * profile into the three facts the generator sees, so a place name still cannot reach the prompt
 * from anywhere but the card. See lib/profile.ts.
 *
 * The cost is four short draws per correction, which is why it is rate limited on its own kind
 * rather than sharing the scan's budget: a visitor correcting three fields in a row is ordinary,
 * and should not spend their scan allowance doing it.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    domain?: string;
    brand_name?: string;
    what_they_sell?: string;
    buyer?: string;
    location?: string;
    category_term?: string;
  };

  const ipHash = hashIp(clientIp(request.headers));
  const limit = await checkRateLimit(ipHash, 'question');
  if (!limit.ok) {
    return Response.json({ error: limit.message ?? 'Too many rewrites for now.' }, { status: 429 });
  }
  await recordAttempt(ipHash, 'question');

  const trim = (v: string | undefined, max: number) => {
    const t = v?.trim();
    return t ? t.slice(0, max) : null;
  };

  const domain = normaliseDomain(body.domain ?? '');
  const brand = trim(body.brand_name, 120) ?? (domain ? brandFromDomain(domain) : null);
  if (!brand) {
    return Response.json({ error: 'We need your brand name before we can write the question.' }, { status: 400 });
  }

  try {
    const { question, verified } = await writeBuyerQuestion(
      profileFrom({
        what_they_sell: trim(body.what_they_sell, 200),
        buyer: trim(body.buyer, 200),
        location: trim(body.location, 200),
        category_term: trim(body.category_term, 120),
      }),
      brand,
    );
    return Response.json({ question, verified });
  } catch (err) {
    /*
     * A MISSING FACT IS NOT AN ERROR HERE, it is the card doing its job. §4: without knowing who
     * is choosing there is no way to write a question that runs in the right direction, and the
     * field the visitor has to fill is on screen in front of them. Say which one, and say
     * nothing that reads as a failure on their part.
     */
    if (err instanceof MissingFactError) {
      return Response.json({ question: null, missing: err.field }, { status: 200 });
    }
    return Response.json({ error: 'We could not rewrite the question just then.' }, { status: 502 });
  }
}
