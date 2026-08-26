/**
 * Meta, and the rules that keep it honest.
 *
 * THREE SUPPORTED STATES, AND PIXEL-ONLY IS ONE OF THEM. Added 25 Aug 2026, because a
 * Conversions API token cannot be created from a personal ad account: Meta requires admin or
 * developer on a business portfolio, and this pixel does not live on one. That is a fact about
 * Meta's permission model rather than a thing to work around, so it is a state the build
 * supports rather than a broken configuration it limps through.
 *
 *   off          no pixel id. Nothing is served and nothing is sent.
 *   pixel_only   pixel id, no token. The browser reports the three funnel events. The
 *                Purchase is NOT sent, at all, by anybody.
 *   full         both. As above, plus the server-side Purchase.
 *
 * WHAT PIXEL-ONLY MUST NOT DO, and both are more tempting than they look. It must not
 * half-fire the Conversions API - building the payload and posting it without a token gets a
 * 400 and an error line that reads like a fault every time somebody buys. And it must not
 * fall back to a browser Purchase, which is the unreliable path this file rejected on purpose:
 * the buyer is redirected out to Stripe and back through whatever ad blocker, iOS setting and
 * cleared cookie they have, so a browser-reported Purchase is a number that is wrong in a
 * direction nobody can see. A missing Purchase is better than a wrong one. metaTrack()'s
 * parameter type has no 'Purchase' member, so the compiler holds that line rather than a
 * reviewer remembering to.
 *
 * NOTHING IS LOST THAT MATTERS. lib/funnel.ts records the purchase against the scan id in our
 * own table, which is the source of truth for what an ad produced and does not depend on
 * Meta's figures or on a cookie surviving a round trip to Stripe. What pixel-only costs is
 * Meta's ability to optimise bidding on Purchase, not our ability to know.
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

export type MetaMode = 'off' | 'pixel_only' | 'full';

/**
 * Which of the three states this process is in, decided from the environment and nothing else.
 *
 * Read rather than assumed, everywhere it matters: the boot line below, the decision not to
 * send a Purchase, and the sentence on the privacy page describing what we send to Meta. A
 * policy that describes a server-side send we are not making is a statement somebody relied
 * on, even when the drift is in the harmless direction.
 */
export function metaMode(): MetaMode {
  if (!env.metaPixelId) return 'off';
  return env.metaCapiToken ? 'full' : 'pixel_only';
}

/**
 * Say which mode this is, once, at startup.
 *
 * The state is otherwise invisible. A Purchase that is never sent looks exactly like a
 * Purchase that failed silently, like a pixel id nobody set, and like a buyer in Berlin who
 * was deliberately not tracked - four different situations producing the same nothing in the
 * logs. This is the same rule the ops alerts follow: record the outcome of anything allowed
 * to fail quietly.
 *
 * IT SAYS ONLY WHAT THIS PROCESS CAN OBSERVE, and it did not until 26 Aug 2026. The line read
 * "Browser funnel events are served", which was never a fact this server could know: browser
 * events are fired by a browser, on a visitor's machine, and reach Meta or do not without any
 * of it passing through here. For a fortnight that sentence was treated as verification while
 * three named events reached Meta zero times, and it was the more serious of the two defects,
 * because it is the one that stopped anybody looking.
 *
 * The rule it broke is the one this file already states about alerts and the one CLAUDE.md
 * states about guards: assert a guarantee only where the code enforces it. A log line about
 * something happening in another process, on another machine, enforces nothing. So it now
 * reports what is configured, says plainly that delivery is not observable from here, and
 * names the thing that can observe it.
 *
 * Module scope, so it runs on cold start of each server instance. The flag keeps it to one
 * line per process rather than one per import.
 *
 * SILENT DURING `next build`, which was found by running it: the build fans out across
 * workers and printed the line eight times, which is noise rather than a startup fact. A
 * message that appears eight times gets skimmed, and a message that gets skimmed is not a
 * message. The build also has no runtime environment worth reporting on - the values that
 * matter are the ones Vercel injects at run time.
 */
let announced = false;
function announceMetaMode(): void {
  if (announced) return;
  announced = true;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  const mode = metaMode();
  if (mode === 'off') {
    console.log('Meta: off. No pixel id set, so no pixel is served and no purchase is sent.');
    return;
  }
  if (mode === 'pixel_only') {
    console.log(
      'Meta: PIXEL ONLY. The pixel is served to trackable visitors; the server-side Purchase ' +
        'is not sent and is not substituted with a browser one. Purchases are recorded ' +
        'against the scan id in our own attribution table. Set META_CAPI_TOKEN to enable the ' +
        'Purchase. This server cannot see whether a browser event actually reached Meta - ' +
        'check Events Manager, or run npm run pixel:check.',
    );
    return;
  }
  console.log(
    'Meta: full. The pixel is served to trackable visitors, plus the server-side Purchase. ' +
      'Whether a browser event reached Meta is not observable from here - see Events Manager.',
  );
}
announceMetaMode();

/**
 * May we track a visitor from this country?
 *
 * An unknown country is treated as untrackable. Vercel sets x-vercel-ip-country on every
 * request, so a missing value means something is wrong with our own plumbing, and guessing
 * "probably American" in that state is the wrong way round: the failure should cost us an
 * attribution row, not somebody their rights.
 *
 * Deliberately does NOT require a Conversions API token. Pixel-only is a supported state and
 * the browser funnel events are the whole point of it, so gating the pixel on a token that
 * cannot be issued for this ad account would turn a supported state into no tracking at all.
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
  const mode = metaMode();

  // Nothing configured. Expected, and silent: there is no advertising to report to.
  if (mode === 'off') return;

  // Pixel-only. The Purchase is not sent and is not replaced by a browser one, and this line
  // is why that is unambiguous in the log rather than looking like a failure. Not an error:
  // it is the configured behaviour, and the funnel row below records the purchase regardless.
  if (mode === 'pixel_only') {
    console.log(
      `Meta purchase not sent for ${input.eventId}: pixel-only mode, no META_CAPI_TOKEN. ` +
        'Recorded in our own attribution table instead.',
    );
    return;
  }

  // The buyer's country here is the one Stripe billed, not a header, and an unknown one is
  // treated the same way as an unknown visitor: not sent. Said out loud for the same reason
  // as above - a deliberate omission and a broken integration must never look alike.
  //
  // No `?? 'US'`, and that was a real defect until 26 Aug 2026. Defaulting an unknown country
  // to a tracked one made the comment above false: a buyer whose country Stripe did not report
  // was tracked, and if they were in the UK or the EEA that contradicts the privacy policy
  // published on 22 Aug. It also made the log line below unreachable for the one case it names.
  // metaAllowedFor() already treats null as untrackable; the caller must not undo it.
  if (!metaAllowedFor(input.country)) {
    console.log(
      `Meta purchase not sent for ${input.eventId}: ${input.country ?? 'unknown'} is not tracked.`,
    );
    return;
  }

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
