/**
 * The founding seat, decided at the moment of charging.
 *
 * ONE READ DECIDES THE PRICE, AND IT IS THIS ONE. The page shows a forecast from
 * foundingDisplay(); this claims the actual place, atomically, and the key it returns is what
 * assertPrice() checks and what the Checkout line item is built from. There is no second read
 * between deciding and charging, which is the only version of "the displayed price and the
 * charged price agree" that survives two people clicking at once.
 *
 * The claim exists BEFORE the Stripe session, because the price id is decided by the claim and
 * the session is created carrying that price. So the session id is attached afterwards, and a
 * session that fails to create releases the claim rather than leaving a place held by nothing.
 */

import 'server-only';
import { db } from './db';
import { FOUNDING_SEATS, type PriceKey } from './stripe';

/** Matches the Checkout session's own 30 minute expiry. Nothing may outlive its session. */
export const CLAIM_MINUTES = 30;

export interface SeatClaim {
  claimId: string | null;
  priceKey: PriceKey;
}

/**
 * Take a founding place for this account, or report that there is none.
 *
 * An account that already holds a place, confirmed or claimed, gets one back without consuming
 * another: the rate is promised to a business, so a second market is still founding while
 * places remain. That is the 20 Aug rule, and it falls out of the function counting distinct
 * accounts rather than needing a branch here.
 *
 * A failure to reach the database returns the STANDARD rate rather than throwing. Refusing to
 * sell because a counter is unreadable costs a subscriber; charging the standard rate costs a
 * discount, and the alternative - assuming founding - hands out a place we cannot account for.
 */
export async function claimFoundingSeat(accountId: string): Promise<SeatClaim> {
  const expiresAt = new Date(Date.now() + CLAIM_MINUTES * 60_000).toISOString();

  const { data, error } = await db().rpc('claim_founding_seat', {
    p_account: accountId,
    p_expires: expiresAt,
    p_seats: FOUNDING_SEATS,
  });

  if (error) {
    console.error(`Founding claim failed for account ${accountId}: ${error.message}`);
    return { claimId: null, priceKey: 'standard_monthly' };
  }

  const claimId = (data as string | null) ?? null;
  return { claimId, priceKey: claimId ? 'founding_monthly' : 'standard_monthly' };
}

/** Ties a claim to the session it paid for, once Stripe has given us the id. */
export async function attachSessionToClaim(claimId: string, sessionId: string): Promise<void> {
  const { error } = await db()
    .from('founding_claims')
    .update({ checkout_session_id: sessionId })
    .eq('id', claimId);
  if (error) console.error(`Could not attach session ${sessionId} to claim ${claimId}: ${error.message}`);
}

/**
 * Give the place back.
 *
 * Called when the session could not be created, and when Stripe says the session expired. A
 * claim also frees itself at expires_at, so a lost release costs at most half an hour of one
 * place rather than a place forever. Belt and braces, in the direction of not holding seats
 * hostage.
 */
export async function releaseClaim(claimId: string, reason: 'released' | 'expired'): Promise<void> {
  const { error } = await db()
    .from('founding_claims')
    .update({ outcome: reason, released_at: new Date().toISOString() })
    .eq('id', claimId)
    .eq('outcome', 'pending');
  if (error) console.error(`Could not release claim ${claimId}: ${error.message}`);
}

/** The place was paid for. Now it is held by the subscription rather than by the claim. */
export async function convertClaim(claimId: string): Promise<void> {
  const { error } = await db()
    .from('founding_claims')
    .update({ outcome: 'converted', converted_at: new Date().toISOString() })
    .eq('id', claimId)
    .eq('outcome', 'pending');
  if (error) console.error(`Could not convert claim ${claimId}: ${error.message}`);
}

/** Release by session id, for the webhook, which knows the session and not the claim. */
export async function releaseClaimBySession(sessionId: string): Promise<void> {
  const { error } = await db()
    .from('founding_claims')
    .update({ outcome: 'expired', released_at: new Date().toISOString() })
    .eq('checkout_session_id', sessionId)
    .eq('outcome', 'pending');
  if (error) console.error(`Could not release the claim for session ${sessionId}: ${error.message}`);
}
