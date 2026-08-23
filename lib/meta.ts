/**
 * Meta, and the two rules that keep it honest.
 *
 * ONE: THE PURCHASE IS SERVER SIDE AND NOTHING ELSE IS. A buyer is redirected out to Stripe
 * and back through whatever ad blocker, iOS setting and cleared cookie they have, so the
 * browser is the least reliable witness to the one event that decides whether the advertising
 * worked. The Conversions API call happens in the Stripe webhook, where the fact is already
 * known and nothing can intercept it.
 *
 * The brief asked for the same event_id "on both the pixel and the CAPI event" to deduplicate,
 * which cannot be right and is worth saying: if only the server fires Purchase, there is
 * nothing to deduplicate against. Firing both and hoping the ids match is how a purchase gets
 * counted twice and every ratio downstream quietly doubles. So the browser never fires
 * Purchase, and the server event carries the Stripe session id as its event_id, which means a
 * browser event added later collapses into it rather than adding to it.
 *
 * TWO: NOBODY IN THE UK OR THE EEA IS TRACKED AT ALL. The privacy policy published on 22 Aug
 * says advertising trackers would be disclosed here before they started and that UK and EEA
 * visitors would be asked first. Asking properly means a consent banner, a stored preference
 * and a way to withdraw it; not tracking them is simpler, cheaper, stronger, and impossible to
 * get subtly wrong. Traffic is targeted at the US regardless. See metaAllowedFor().
 */

import 'server-only';
import { createHash } from 'node:crypto';
import { env } from './env';
import { PRICE_USD } from './scope';
import type { PriceKey } from './stripe';

/**
 * The UK, the EEA, and Switzerland. Not tracked, no pixel served, no server event sent.
 *
 * Over-inclusive on purpose: Switzerland is not in the EEA and has its own regime, and the
 * cost of including it is one visitor who sees no pixel. The cost of missing one is a
 * regulator's question we would have to answer honestly.
 */
const NO_TRACK = new Set([
  'GB', 'IE', 'FR', 'DE', 'IT', 'ES', 'PT', 'NL', 'BE', 'LU', 'AT', 'DK', 'SE', 'FI', 'NO',
  'IS', 'LI', 'CH', 'PL', 'CZ', 'SK', 'HU', 'SI', 'HR', 'RO', 'BG', 'GR', 'CY', 'MT', 'EE',
  'LV', 'LT',
]);

/**
 * May we track a visitor from this country?
 *
 * An unknown country is treated as untrackable. Vercel sets x-vercel-ip-country on every
 * request, so a missing value means something is wrong with our own plumbing, and guessing
 * "probably American" in that state is the wrong way round: the failure should cost us an
 * attribution row, not somebody their rights.
 */
export function metaAllowedFor(country: string | null | undefined): boolean {
  if (!env.metaPixelId) return false;
  if (!country) return false;
  return !NO_TRACK.has(country.toUpperCase());
}

/** Lowercased, trimmed, sha256. Meta never receives an address in the clear. */
function hashed(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

/**
 * The purchase, sent from the webhook.
 *
 * Never throws. A failed advertising call must not fail the handler that records a paying
 * subscriber: Stripe would retry the whole event, and the subscription matters more than the
 * attribution. Logged instead, and the funnel table is the record either way.
 */
export async function sendPurchaseEvent(input: {
  email: string;
  priceKey: PriceKey;
  /** The Stripe session id. Doubles as the deduplication key. */
  eventId: string;
  country?: string | null;
}): Promise<void> {
  if (!env.metaPixelId || !env.metaCapiToken) return;

  // The buyer's country here is the one Stripe billed, not a header, and an unknown one is
  // treated the same way as an unknown visitor: not sent.
  if (!metaAllowedFor(input.country ?? 'US')) return;

  const body = {
    data: [
      {
        event_name: 'Purchase',
        event_time: Math.floor(Date.now() / 1000),
        event_id: input.eventId,
        action_source: 'website',
        user_data: { em: [hashed(input.email)] },
        custom_data: {
          value: PRICE_USD[input.priceKey],
          currency: 'USD',
        },
      },
    ],
  };

  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${env.metaPixelId}/events?access_token=${env.metaCapiToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  } catch (err) {
    console.error('Meta purchase event failed:', err instanceof Error ? err.message : err);
  }
}
