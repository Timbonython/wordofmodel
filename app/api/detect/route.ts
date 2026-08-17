import { normaliseDomain } from '@/lib/domain';
import { detectBusiness, needsManualEntry } from '@/lib/detect';
import { findCachedScan } from '@/lib/db';
import { checkRateLimit, clientIp, hashIp } from '@/lib/ratelimit';
import { ndjson } from '@/lib/stream';
import { readSite } from '@/lib/site';
import type { FreeResult } from '@/lib/types';

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

    emit({ type: 'stage', stage: 'reading', label: `Reading ${domain}` });
    const site = await readSite(domain);
    emit({ type: 'site_fetched', urls: site.urls, chars: site.text.length });

    emit({ type: 'stage', stage: 'detecting', label: 'Working out what you sell' });
    const profile = await detectBusiness(site.text);

    emit({ type: 'detected', profile, needs_manual: needsManualEntry(profile) });
  });
}
