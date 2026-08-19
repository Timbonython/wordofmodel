import { getCurrentAccount } from '@/lib/auth';
import { portalSession } from '@/lib/checkout';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

/**
 * The Customer Portal. Card updates and cancellation, self serve.
 *
 * Behind magic link auth, because the portal can cancel a subscription and read
 * a billing history. The session is created against the signed in account's own
 * customer id and nothing from the request body is used to choose it.
 *
 * Cancellation has to be no harder than signup. It is one link from the account
 * page to a hosted portal, which is the same number of steps as starting.
 */
export async function POST() {
  const account = await getCurrentAccount();
  if (!account) return Response.json({ error: 'Sign in first.' }, { status: 401 });
  if (!account.stripe_customer_id) {
    return Response.json({ error: 'There is no subscription on this account yet.' }, { status: 404 });
  }

  try {
    const url = await portalSession(account.stripe_customer_id, `${env.siteUrl}/account`);
    return Response.json({ url });
  } catch (err) {
    console.error('portal session failed', err instanceof Error ? err.message : err);
    return Response.json({ error: 'Could not open the billing portal. Try again.' }, { status: 502 });
  }
}
