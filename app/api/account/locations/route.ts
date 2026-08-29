import { getCurrentAccount } from '@/lib/auth';
import { getSubscriptionForAccount, LIVE_STATUSES } from '@/lib/billing';
import { addLocation, previewLocation, removeLocation, LocationError } from '@/lib/location-billing';
import { locationsForScope } from '@/lib/locations';

export const runtime = 'nodejs';

/**
 * Adding and removing a town on a live subscription.
 *
 * THE SCOPE IS NEVER TAKEN FROM THE REQUEST. It is read from the signed in account's own
 * subscription, so a body naming somebody else's scope changes nothing about which one is
 * touched. Same rule as the portal route: nothing from the body chooses what is operated on.
 *
 * Three actions rather than three routes, because they share the ownership check and the
 * "which subscription" question, and splitting them would be three copies of it.
 */
export async function POST(request: Request) {
  const account = await getCurrentAccount();
  if (!account) return Response.json({ error: 'Sign in first.' }, { status: 401 });

  const subscription = await getSubscriptionForAccount(account.id);
  if (!subscription) {
    return Response.json({ error: 'There is no subscription on this account yet.' }, { status: 404 });
  }
  // A cancelled or unpaid subscription must not grow. past_due IS allowed: Smart Retries are
  // still running and treating a first failed card as a cancellation is how you lose a
  // customer to an expired card, which is the rule the scheduler already follows.
  if (!LIVE_STATUSES.includes(subscription.status as never)) {
    return Response.json({ error: 'This subscription is not active.' }, { status: 409 });
  }

  let body: { action?: string; town?: string; locationId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: 'That request did not arrive properly.' }, { status: 400 });
  }

  try {
    if (body.action === 'preview') {
      return Response.json(await previewLocation(subscription.scope_id, body.town ?? ''));
    }

    if (body.action === 'add') {
      const out = await addLocation(subscription, body.town ?? '');
      return Response.json({ ...out, locations: await locationsForScope(subscription.scope_id) });
    }

    if (body.action === 'remove') {
      if (!body.locationId) return Response.json({ error: 'Which location?' }, { status: 400 });
      const out = await removeLocation(subscription, body.locationId);
      return Response.json({ ...out, locations: await locationsForScope(subscription.scope_id) });
    }

    return Response.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (err) {
    // A LocationError is a sentence written for the subscriber and is safe to return. Anything
    // else is ours, and is logged rather than shown: an internal message on a billing page is
    // both useless to them and a hint to somebody else.
    if (err instanceof LocationError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    console.error('account/locations failed', err instanceof Error ? err.message : err);
    return Response.json({ error: 'Something went wrong. Nothing has been charged.' }, { status: 502 });
  }
}
