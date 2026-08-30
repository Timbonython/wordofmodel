import { authorised, unauthorised } from '@/lib/cron';
import { moderateReview, reviewsForModeration } from '@/lib/reviews';
import { attribution, linkedInVersion, plainSentence } from '@/lib/review-text';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Moderation, on the ops pattern this build already uses.
 *
 * NO CMS, DELIBERATELY. The application has no admin role and no admin surface, and inventing
 * one for a handful of reviews a month would be a login, a permission model and a session
 * boundary to get wrong for a job that is four verbs. This is the same shape as
 * /api/ops/codes and /api/ops/subscriptions: read-only by default, behind the same
 * Authorization: Bearer $CRON_SECRET the scheduler uses, driven from one shell script.
 *
 * GET  lists submissions, newest first, with the LinkedIn-ready text already built.
 * POST changes one: status, featured, display_order, or a typo in the body.
 *
 * Everything a subscriber sees still goes through approvedReviews(), which hardcodes the
 * status - so nothing here can publish by accident, only by saying so.
 */
export async function GET(request: Request) {
  if (!authorised(request)) return unauthorised();
  const status = new URL(request.url).searchParams.get('status') ?? undefined;
  const rows = await reviewsForModeration(status);
  return Response.json({
    count: rows.length,
    reviews: rows.map((r) => {
      const fields = {
        rating: r.rating,
        reviewText: r.review_text,
        firstName: r.first_name,
        location: r.location ?? '',
        category: r.category ?? '',
      };
      return {
        id: r.id,
        created: r.created_at,
        status: r.status,
        featured: r.featured,
        order: r.display_order,
        rating: r.rating,
        text: r.review_text,
        who: attribution(fields),
        source: r.source,
        externalClicks: r.external_clicks,
        note: r.admin_note,
        // Built here so the three copyable forms cannot drift from what the site renders.
        copy: {
          text: r.review_text,
          attribution: attribution(fields),
          sentence: plainSentence(fields),
          linkedin: linkedInVersion(fields),
        },
      };
    }),
  });
}

export async function POST(request: Request) {
  if (!authorised(request)) return unauthorised();
  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    status?: 'pending' | 'approved' | 'rejected';
    featured?: boolean;
    displayOrder?: number | null;
    reviewText?: string;
    adminNote?: string;
  };
  if (!body.id) return Response.json({ error: 'Which review?' }, { status: 400 });

  try {
    const row = await moderateReview(body.id, body);
    return Response.json({ ok: true, id: row.id, status: row.status, featured: row.featured, order: row.display_order });
  } catch (err) {
    console.error('ops/reviews failed', err instanceof Error ? err.message : err);
    return Response.json({ error: 'Could not update that review.' }, { status: 502 });
  }
}
