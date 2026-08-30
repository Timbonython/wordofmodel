import { recordFunnel } from '@/lib/funnel';

export const runtime = 'nodejs';

/**
 * The two form events, fired from the browser rather than counted on the server.
 *
 * NOT A SERVER RENDER COUNT, and that is the whole reason this route exists. `/start` recorded
 * every render and accumulated 1030 rows against 2 real scans in 48 hours, because a crawler
 * and a person are the same thing to a server. `/review` will be linked from report emails and
 * crawled like anything else.
 *
 * A browser that executes JavaScript and posts here is a far better proxy for a person than any
 * user-agent string, which is the conclusion migration 0020 reached the expensive way. It still
 * is not proof, and it undercounts anybody with scripts off - which is the safe direction, the
 * same one the landed gate errs in.
 */
const ALLOWED = new Set(['review_form_view', 'review_form_started']);

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { event?: string };
  if (!ALLOWED.has(body.event ?? '')) return Response.json({ ok: true });
  await recordFunnel({
    event: body.event as 'review_form_view' | 'review_form_started',
    userAgent: request.headers.get('user-agent'),
  });
  return Response.json({ ok: true });
}
