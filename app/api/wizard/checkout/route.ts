import { approveOnboarding, ScopeLockedError } from '@/lib/onboarding';
import { createCheckout } from '@/lib/checkout';
import { validEmail } from '@/lib/email';
import {
  InputError,
  parseCompetitors,
  parseProfile,
  parseQuestions,
} from '@/lib/wizard-input';
import { checkRateLimit, clientIp, hashIp, recordAttempt } from '@/lib/ratelimit';

/** Matches a v4 uuid and nothing else. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Step 4, and the order of the two things it does is the whole point of this
 * session.
 *
 * The approval is written FIRST, then the Checkout Session is created. Not the
 * other way round. Three reasons, from the spec, and none of them has softened:
 * the wizard is the sell, the approval gate is the credibility mechanism and
 * hiding it behind the paywall hides the differentiator from everyone who has
 * not bought, and you never take money for questions the generator could not
 * write.
 *
 * A consequence worth being deliberate about: somebody who approves and then
 * closes the Stripe tab leaves an account and a scope behind with no
 * subscription. That is a lead, not a subscriber. Nothing downstream reads a
 * scope without checking subscriptions.
 */
export async function POST(request: Request) {
  const ipHash = hashIp(clientIp(request.headers));
  const limit = await checkRateLimit(ipHash, 'wizard');
  if (!limit.ok) return Response.json({ error: limit.message }, { status: 429 });

  let approved;
  let scanId: string | null = null;
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const email = validEmail(typeof body.email === 'string' ? body.email : '');
    if (!email) throw new InputError('We need an address to send the report to.');

    const profile = parseProfile(body.profile);
    // A uuid or nothing. It arrives from a URL a stranger controls, and it only ever ends up
    // in a foreign key, so a malformed one has to be dropped rather than passed along.
    scanId = typeof body.scanId === 'string' && UUID.test(body.scanId) ? body.scanId : null;
    const competitors = parseCompetitors(body.competitors);
    const questions = parseQuestions(body.questions);

    await recordAttempt(ipHash, 'wizard');
    approved = await approveOnboarding({ email, profile, competitors, questions });
  } catch (err) {
    if (err instanceof InputError) return Response.json({ error: err.message }, { status: 400 });

    // A subscriber whose scope has been measured walked the wizard again. Refused rather
    // than applied: finishing it would rewrite the questions their trend line is built on,
    // and month two would report the difference as their market moving. Says what it would
    // have cost and where to go, because "we could not save your setup" would read as a bug
    // and they would try again.
    if (err instanceof ScopeLockedError) {
      return Response.json(
        {
          error:
            'Your questions are already live and being measured, so we have left them alone. ' +
            'Changing them now would restart your history: month two would compare two ' +
            'different questions and report the difference as movement in your market. ' +
            'Reply to any report and we will change them properly, keeping what you have.',
        },
        { status: 409 },
      );
    }

    console.error('onboarding approval failed', err instanceof Error ? err.message : err);
    return Response.json({ error: 'We could not save your setup. Try again.' }, { status: 500 });
  }

  try {
    const { url, priceKey } = await createCheckout({
      account: approved.account,
      scope: approved.scope,
      scanId,
    });
    return Response.json({ url, priceKey });
  } catch (err) {
    // The approval is already saved, so this is recoverable: they come back,
    // the wizard reuses the same account and scope, and they get another
    // session. Say that rather than implying the work is lost.
    console.error('checkout session failed', err instanceof Error ? err.message : err);
    return Response.json(
      { error: 'Your questions are saved, but we could not open the payment page. Try again.' },
      { status: 502 },
    );
  }
}
