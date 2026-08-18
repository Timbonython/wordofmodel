import { brandFromDomain, normaliseDomain } from '@/lib/domain';
import { detectBusiness, needsManualEntry } from '@/lib/detect';
import { findCachedScan } from '@/lib/db';
import { checkRateLimit, clientIp, hashIp } from '@/lib/ratelimit';
import { ndjson } from '@/lib/stream';
import { SiteReadError, readSite } from '@/lib/site';
import type { FreeResult, ManualReason, Profile } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Steps 2 and 3. Ends at a profile the visitor can correct, or short circuits to
 * a cached result if this domain was scanned in the last 24 hours.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { domain?: string };
  const domain = normaliseDomain(body.domain ?? '');

  if (!domain) {
    return Response.json({ error: 'That does not look like a website address.' }, { status: 400 });
  }

  const ipHash = hashIp(clientIp(request.headers));

  return ndjson(async (emit) => {
    // A repeat visitor gets their own result back rather than a refusal, so the
    // cache check comes before the limiter.
    const cached = await findCachedScan(domain);
    if (cached?.result && cached.question) {
      emit({ type: 'stage', stage: 'cache', label: 'You scanned this in the last day. Fetching that result.' });
      emit({ type: 'question', question: cached.question });
      emit({
        type: 'result',
        scanId: cached.id,
        question: cached.question,
        free: cached.result as FreeResult,
        cached: true,
        run_at: cached.created_at,
      });
      return;
    }

    const limit = await checkRateLimit(ipHash, 'scan');
    if (!limit.ok) {
      emit({ type: 'error', message: limit.message ?? 'Too many scans for now.' });
      return;
    }

    // Everything from here can fail, and only one of the failures is the
    // visitor's to fix. A site that will not answer, a page with nothing on it,
    // or a detect call that comes back empty are all our problem, and the answer
    // to all three is the same: hand over the form and let them tell us. The one
    // thing that must never happen at step 2 is a dead end.
    emit({ type: 'stage', stage: 'reading', label: `Reading ${domain}` });

    let profile: Profile | null = null;
    let reason: ManualReason = null;

    try {
      const site = await readSite(domain);
      emit({ type: 'site_fetched', urls: site.urls, chars: site.text.length });

      emit({ type: 'stage', stage: 'detecting', label: 'Working out what you sell' });
      profile = await detectBusiness(site.text);
      if (needsManualEntry(profile)) reason = 'unclear';
    } catch (err) {
      // A hostname that does not resolve is a typo. Correcting the address is
      // the fastest way out of that one, so it stays an error at step 1 rather
      // than becoming a form that would scan a site that does not exist.
      if (err instanceof SiteReadError && err.kind === 'not_found') {
        emit({ type: 'error', message: err.message });
        return;
      }
      reason =
        err instanceof SiteReadError
          ? err.kind === 'thin'
            ? 'thin'
            : 'unreachable'
          : 'detect_failed';
    }

    // Prefilled from the domain rather than blank. A form that already has your
    // name in it reads as a correction; an empty one reads as a failure.
    const fallback: Profile = {
      brand_name: brandFromDomain(domain) || null,
      what_they_sell: null,
      buyer: null,
      country: null,
      category_term: null,
    };

    const out: Profile = profile
      ? { ...profile, brand_name: profile.brand_name ?? fallback.brand_name }
      : fallback;

    emit({ type: 'detected', profile: out, needs_manual: reason !== null, manual_reason: reason });
  });
}
