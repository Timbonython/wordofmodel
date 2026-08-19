import { brandFromDomain, normaliseDomain } from '@/lib/domain';
import { detectBusiness } from '@/lib/detect';
import { checkRateLimit, clientIp, hashIp, recordAttempt } from '@/lib/ratelimit';
import { SiteReadError, readSite } from '@/lib/site';
import type { Profile } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Step 1 of the wizard, for somebody arriving without a scan.
 *
 * Deliberately not /api/detect. That one streams, checks the free scan cache and
 * spends the scan rate limit, all of which belong to the scan. This one just
 * reads a site and comes back with a profile to correct.
 *
 * Never a dead end, for the same reason step 2 of the scan is never a dead end:
 * a site we cannot read hands over the form prefilled from the domain, and the
 * visitor tells us instead. Only a hostname that does not resolve is an error,
 * because that is a typo and correcting it is the fastest way out.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { domain?: string };
  const domain = normaliseDomain(body.domain ?? '');
  if (!domain) {
    return Response.json({ error: 'That does not look like a website address.' }, { status: 400 });
  }

  const ipHash = hashIp(clientIp(request.headers));
  const limit = await checkRateLimit(ipHash, 'wizard');
  if (!limit.ok) return Response.json({ error: limit.message }, { status: 429 });
  await recordAttempt(ipHash, 'wizard');

  const fallback: Profile = {
    brand_name: brandFromDomain(domain) || null,
    what_they_sell: null,
    buyer: null,
    country: null,
    category_term: null,
  };

  try {
    const site = await readSite(domain);
    const profile = await detectBusiness(site.text);
    return Response.json({
      domain,
      profile: { ...profile, brand_name: profile.brand_name ?? fallback.brand_name },
    });
  } catch (err) {
    if (err instanceof SiteReadError && err.kind === 'not_found') {
      return Response.json({ error: err.message }, { status: 400 });
    }
    return Response.json({ domain, profile: fallback, read_failed: true });
  }
}
