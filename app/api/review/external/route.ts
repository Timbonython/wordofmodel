import { recordFunnel } from '@/lib/funnel';
import { noteExternalClick } from '@/lib/reviews';

export const runtime = 'nodejs';

/**
 * A reviewer clicked through to Google, G2 or Trustpilot.
 *
 * RECORDS THE CLICK, NEVER A POST. No platform tells us whether a review was actually left, so
 * this is the only observable fact and the naming says so all the way down: the column is
 * external_clicks, the event is external_review_clicked. Reading either as "reviews posted
 * elsewhere" would be inventing a number, which is what funnel_events was rebuilt once for.
 *
 * Fire and forget from the page: the click must not wait on us, and a failure here loses a data
 * point rather than the review.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { id?: string; platform?: string };
  const platform = (body.platform ?? '').trim().slice(0, 40);
  if (!platform) return Response.json({ ok: true });

  if (body.id) await noteExternalClick(body.id, platform);
  await recordFunnel({
    event: 'external_review_clicked',
    userAgent: request.headers.get('user-agent'),
    detail: platform,
  });
  return Response.json({ ok: true });
}
