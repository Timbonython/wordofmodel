import { resolveLocality, localityStatement } from '@/lib/serp/locations';
import { isSupportedMarket } from '@/lib/geo';
import { checkRateLimit, clientIp, hashIp, recordAttempt } from '@/lib/ratelimit';

export const runtime = 'nodejs';

/**
 * What the town in the box turns into, said out loud before anybody pays.
 *
 * The report has to state which surfaces a location actually reached, and a subscriber who
 * only learns that after their first report has been sold something they could not check.
 * Two of the three examples in the field hint - "the Bay Area" and "West London" - do not
 * exist in Google's location list, so this is not a rare edge: it is roughly what a real
 * person types. Better to say it on the screen where they can change it.
 *
 * Rate limited on the same bucket as the rest of the wizard. The endpoint costs SerpApi
 * nothing, but it is an unauthenticated fetch that reaches a third party and there is no
 * version of that which should be free to hammer.
 */
export async function POST(request: Request) {
  const ipHash = hashIp(clientIp(request.headers));
  const limit = await checkRateLimit(ipHash, 'wizard');
  if (!limit.ok) return Response.json({ error: limit.message }, { status: 429 });

  const body = (await request.json().catch(() => ({}))) as { locality?: unknown; market_country?: unknown };
  const typed = typeof body.locality === 'string' ? body.locality.trim() : '';
  const country = typeof body.market_country === 'string' ? body.market_country.trim().toUpperCase() : '';
  if (!isSupportedMarket(country)) {
    return Response.json({ error: 'Choose the country your buyers are in first.' }, { status: 400 });
  }
  if (!typed) return Response.json({ statement: null, resolved: false });

  await recordAttempt(ipHash, 'wizard');
  const locality = await resolveLocality(typed, country);
  return Response.json({
    statement: localityStatement(locality, country),
    resolved: Boolean(locality.canonical),
    canonical: locality.canonical,
  });
}
