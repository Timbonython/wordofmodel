import { checkRateLimit, clientIp, hashIp, recordAttempt } from '@/lib/ratelimit';
import { recordFunnel } from '@/lib/funnel';
import { livePlatforms, saveReview } from '@/lib/reviews';
import { reviewProblem } from '@/lib/review-text';

export const runtime = 'nodejs';

/**
 * A review, submitted.
 *
 * ANTI-SPAM WITHOUT A CAPTCHA, because a captcha on a page you only reach by being asked for a
 * favour is a way of getting fewer favours. Three cheap checks instead, none of which a real
 * person can notice:
 *
 *   the rate limiter   the same one the scan and the waitlist use, keyed on a hashed IP
 *   a honeypot         a field no human sees; anything that fills it is filling every field
 *   a clock            a form completed in under four seconds was not read
 *
 * A refusal returns 200 with ok:true on the honeypot and clock paths ON PURPOSE. Telling a bot
 * which check it failed is how the next attempt passes, and there is nothing here worth a
 * detailed error. Nothing is stored either way.
 */
const MIN_SECONDS_ON_FORM = 4;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    rating?: number;
    reviewText?: string;
    firstName?: string;
    location?: string;
    category?: string;
    consent?: boolean;
    /** The honeypot. Named plausibly so a bot fills it and a screen reader skips it. */
    website?: string;
    /** Milliseconds since the form was rendered. */
    elapsedMs?: number;
  };

  if (body.website) return Response.json({ ok: true });
  if (typeof body.elapsedMs === 'number' && body.elapsedMs < MIN_SECONDS_ON_FORM * 1000) {
    return Response.json({ ok: true });
  }

  // THE SAME RULES THE BROWSER CHECKED. reviewProblem is in lib/review-text.ts precisely so that
  // there is one implementation: a form that says a review is fine and a server that refuses it
  // a second later is worse than either rule alone.
  const problem = reviewProblem({
    rating: Number(body.rating),
    reviewText: body.reviewText ?? '',
    firstName: body.firstName ?? '',
    location: body.location ?? '',
    category: body.category ?? '',
  });
  if (problem) return Response.json({ error: problem }, { status: 400 });

  // Consent is checked here AND is a CHECK constraint in 0023. A review that may not be
  // published is personal data with no purpose, and the row cannot exist without it.
  if (body.consent !== true) {
    return Response.json({ error: 'We need your permission to publish it.' }, { status: 400 });
  }

  const ipHash = hashIp(clientIp(request.headers));
  const limit = await checkRateLimit(ipHash, 'review');
  if (!limit.ok) return Response.json({ error: limit.message }, { status: 429 });
  await recordAttempt(ipHash, 'review');

  let id: string;
  try {
    ({ id } = await saveReview({
      rating: Number(body.rating),
      reviewText: body.reviewText ?? '',
      firstName: body.firstName ?? '',
      location: body.location ?? '',
      category: body.category ?? '',
    }));
  } catch (err) {
    console.error('review submit failed', err instanceof Error ? err.message : err);
    return Response.json({ error: 'We could not save that. Try again in a moment.' }, { status: 502 });
  }

  // Recorded after the write, so the count cannot exceed the reviews that exist.
  await recordFunnel({ event: 'review_submitted', userAgent: request.headers.get('user-agent') });

  /*
   * THE EXTERNAL STEP IS OFFERED TO EVERY SUBMITTER, WHATEVER THEY RATED US.
   *
   * The brief originally said to offer it "after someone successfully submits a positive
   * review". That is review gating: soliciting public reviews only from people who had a good
   * experience, which Google's review policies prohibit and the FTC's testimonial guidance
   * covers as well. It is also the exact thing this site would be embarrassed by, given what
   * the rest of it claims about honest measurement.
   *
   * So the rating is not consulted here, and there is no branch to remove later.
   */
  return Response.json({ ok: true, id, platforms: livePlatforms() });
}
