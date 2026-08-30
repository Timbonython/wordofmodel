/**
 * Reviews: storing them, moderating them, and the one function that reads them out.
 *
 * THE ONLY PUBLIC READ IS approvedReviews(), AND IT HARDCODES THE STATUS. Everything the site
 * renders comes through it. A pending or rejected review cannot reach a page by any route that
 * exists, and the table itself has RLS on with no policies, so no key outside this server can
 * read it at all. Two independent reasons, which is the shape this build asks for whenever the
 * cost of being wrong is somebody else's words published without permission.
 */

import 'server-only';
import { db } from './db';
import { env } from './env';
import { platforms, type PublicReview } from './review-text';

/**
 * How many approved reviews before the site shows any aggregate.
 *
 * A rating averaged over one or two people is a number with no meaning, and this is the site
 * that refuses to print a score out of 100 because inventing one "would make this easier to
 * sell and impossible to trust". Publishing "5.0 from 2 reviews" would be the same defect
 * wearing the customer's clothes.
 *
 * Below this the wall does not exist (it 404s) and no aggregate renders anywhere. A single
 * strong quote is still shown from the first approved review, because one testimonial
 * presented as one testimonial claims nothing.
 */
export const REVIEWS_MIN_FOR_AGGREGATE = 5;

export interface ReviewRow {
  id: string;
  created_at: string;
  rating: number;
  review_text: string;
  first_name: string;
  location: string | null;
  category: string | null;
  status: 'pending' | 'approved' | 'rejected';
  featured: boolean;
  display_order: number | null;
  published_at: string | null;
  source: string;
  external_clicks: Record<string, string>;
  admin_note: string | null;
}

function toPublic(r: ReviewRow): PublicReview {
  return {
    id: r.id,
    rating: r.rating,
    reviewText: r.review_text,
    firstName: r.first_name,
    location: r.location ?? '',
    category: r.category ?? '',
    publishedAt: r.published_at,
    featured: r.featured,
  };
}

/** Save a submission. Always pending; nothing here can publish. */
export async function saveReview(input: {
  rating: number;
  reviewText: string;
  firstName: string;
  location: string;
  category: string;
  source?: 'invited' | 'unsolicited';
}): Promise<{ id: string }> {
  const { data, error } = await db()
    .from('reviews')
    .insert({
      rating: input.rating,
      review_text: input.reviewText.trim(),
      first_name: input.firstName.trim(),
      location: input.location.trim() || null,
      category: input.category.trim() || null,
      // The row cannot exist without this - 0023 has it as a CHECK, not just a column. A review
      // that may not be published is personal data with no purpose.
      consent_to_publish: true,
      source: input.source ?? 'unsolicited',
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`Could not save the review: ${error?.message}`);
  return { id: (data as { id: string }).id };
}

/**
 * THE PUBLIC READ. Approved only, featured first, then display_order, then newest.
 *
 * The status filter is written here and nowhere else, so there is exactly one line in the
 * codebase to get wrong rather than one per page.
 */
export async function approvedReviews(limit = 50): Promise<PublicReview[]> {
  const { data, error } = await db()
    .from('reviews')
    .select('*')
    .eq('status', 'approved')
    .order('featured', { ascending: false })
    .order('display_order', { ascending: true, nullsFirst: false })
    .order('published_at', { ascending: false })
    .limit(limit);
  if (error) {
    // A page that cannot read reviews shows no reviews. It does not show an error, and it
    // certainly does not fall back to something unapproved.
    console.error(`approvedReviews failed: ${error.message}`);
    return [];
  }
  return ((data ?? []) as ReviewRow[]).map(toPublic);
}

export interface ReviewStats {
  count: number;
  average: number | null;
  /** Whether there are enough to say anything about an average at all. */
  enoughForAggregate: boolean;
}

export async function reviewStats(): Promise<ReviewStats> {
  const { data, error } = await db().from('reviews').select('rating').eq('status', 'approved');
  if (error) {
    console.error(`reviewStats failed: ${error.message}`);
    return { count: 0, average: null, enoughForAggregate: false };
  }
  const ratings = ((data ?? []) as { rating: number }[]).map((r) => r.rating);
  const count = ratings.length;
  if (!count) return { count: 0, average: null, enoughForAggregate: false };
  const average = ratings.reduce((a, b) => a + b, 0) / count;
  return {
    count,
    // One decimal. The report's own rule: a figure carries only the precision it earned.
    average: Math.round(average * 10) / 10,
    enoughForAggregate: count >= REVIEWS_MIN_FOR_AGGREGATE,
  };
}

/**
 * Is there a /reviews page to link to yet?
 *
 * THE NAV MUST NOT POINT AT A 404. /reviews does not exist below the threshold - it calls
 * notFound() - so a link to it before then is a dead item in the bar on every page of the site.
 * That is the same rule `sampleLive` exists for, and the reason this is a function rather than a
 * constant somebody has to remember to flip.
 *
 * CACHED FOR SIXTY SECONDS because it is now read on every page render. The count changes only
 * when a review is approved by hand, so a minute of staleness costs nothing and the alternative
 * is a query per page view for a number that moves twice a month. Same trade the founding count
 * makes on the home page.
 *
 * Fails CLOSED. If the count cannot be read, the link does not render: a missing nav item is a
 * smaller failure than one that 404s, and this build errs toward its own cost every time.
 */
let liveCache: { at: number; value: boolean } | null = null;
const LIVE_TTL_MS = 60_000;

export async function reviewsLive(): Promise<boolean> {
  if (liveCache && Date.now() - liveCache.at < LIVE_TTL_MS) return liveCache.value;
  try {
    const { count, error } = await db()
      .from('reviews')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'approved');
    if (error) throw new Error(error.message);
    const value = (count ?? 0) >= REVIEWS_MIN_FOR_AGGREGATE;
    liveCache = { at: Date.now(), value };
    return value;
  } catch (err) {
    console.error('reviewsLive failed; hiding the link rather than risking a 404 in the nav', err);
    return false;
  }
}

/** The platforms that actually have a URL configured. Empty until somebody creates the listings. */
export function livePlatforms() {
  return platforms(env.reviewPlatformUrls);
}

/**
 * Record that a reviewer clicked through to a platform. NEVER that they posted.
 *
 * No platform tells us whether a review was left. A column called external_posted would be a
 * confident wrong number, which is the failure this repo keeps finding, so the name says what
 * is actually known.
 */
export async function noteExternalClick(reviewId: string, platform: string): Promise<void> {
  const { data, error } = await db().from('reviews').select('external_clicks').eq('id', reviewId).maybeSingle();
  if (error || !data) return;
  const clicks = { ...((data as { external_clicks: Record<string, string> }).external_clicks ?? {}) };
  clicks[platform] = new Date().toISOString();
  const { error: upErr } = await db()
    .from('reviews')
    .update({ external_clicks: clicks, updated_at: new Date().toISOString() })
    .eq('id', reviewId);
  if (upErr) console.error(`Could not record the ${platform} click for ${reviewId}: ${upErr.message}`);
}

// ------------------------------------------------------------------------------ moderation

export async function reviewsForModeration(status?: string): Promise<ReviewRow[]> {
  let q = db().from('reviews').select('*').order('created_at', { ascending: false });
  if (status) q = q.eq('status', status);
  const { data, error } = await q.limit(200);
  if (error) throw new Error(`Could not list reviews: ${error.message}`);
  return (data ?? []) as ReviewRow[];
}

/**
 * Approve, reject, feature, order, or fix a typo.
 *
 * published_at is set HERE and only here, because 0023 refuses any approved row without it and
 * any unapproved row with it. The database will not let this function be half right.
 */
export async function moderateReview(
  id: string,
  change: {
    status?: 'pending' | 'approved' | 'rejected';
    featured?: boolean;
    displayOrder?: number | null;
    reviewText?: string;
    adminNote?: string;
  },
): Promise<ReviewRow> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (change.status) {
    patch.status = change.status;
    patch.published_at = change.status === 'approved' ? new Date().toISOString() : null;
  }
  if (change.featured !== undefined) patch.featured = change.featured;
  if (change.displayOrder !== undefined) patch.display_order = change.displayOrder;
  if (change.reviewText !== undefined) patch.review_text = change.reviewText.trim();
  if (change.adminNote !== undefined) patch.admin_note = change.adminNote;

  const { data, error } = await db().from('reviews').update(patch).eq('id', id).select('*').single();
  if (error || !data) throw new Error(`Could not update review ${id}: ${error?.message}`);
  return data as ReviewRow;
}
