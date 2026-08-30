import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';
import { ReviewCard } from '@/components/reviews/ReviewCard';
import { AggregateBadge } from '@/components/reviews/AggregateBadge';
import { JsonLd } from '@/components/reviews/JsonLd';
import { approvedReviews, reviewStats, REVIEWS_MIN_FOR_AGGREGATE } from '@/lib/reviews';
import { productSchema } from '@/lib/schema';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'What subscribers say - Word of Model',
  description:
    'Reviews from businesses that use Word of Model, published in full with the rating they ' +
    'gave. First names only.',
  alternates: { canonical: '/reviews' },
};

/**
 * The wall.
 *
 * IT DOES NOT EXIST UNTIL THERE ARE ENOUGH REVIEWS TO FILL IT. A page called "what subscribers
 * say" carrying two quotes converts worse than no page, and a thin one is worse than absent for
 * a crawler too. Below the threshold this 404s rather than rendering an apology, which also
 * means the nav and footer never link to a page with nothing on it.
 *
 * Every review here is server rendered into the HTML. Nothing is behind a script, a tab or an
 * iframe: this is the page the whole feature exists to let a machine read.
 */
export default async function ReviewsPage() {
  const [reviews, stats] = await Promise.all([approvedReviews(), reviewStats()]);
  if (reviews.length < REVIEWS_MIN_FOR_AGGREGATE) notFound();

  // ONE DECISION, TWO CONSUMERS. The same `enoughForAggregate` that decides whether the badge
  // renders decides whether the rating reaches the structured data.
  const schema = productSchema(
    env.siteUrl,
    stats.enoughForAggregate && stats.average !== null ? { count: stats.count, average: stats.average } : null,
    reviews.slice(0, 20).map((r) => ({
      rating: r.rating,
      body: r.reviewText,
      author: r.firstName,
      published: r.publishedAt,
    })),
  );

  return (
    <>
      <JsonLd schema={schema} />
      <SiteNav sampleLive issue="Reviews" />

      <main className="wrap">
        <section>
          <div className="eyebrow">What subscribers say</div>
          <h1>In their words, not ours.</h1>
          <AggregateBadge stats={stats} />
          <p className="lede">
            Published in full, including the rating. We publish first names only and never a
            surname or a company, because what these reports find is often unflattering to the
            business reading them and full attribution would only get us the bland ones.
          </p>

          <div className="review-wall">
            {reviews.map((r) => (
              <ReviewCard key={r.id} review={r} />
            ))}
          </div>

          <p className="wizard-note">
            <Link href="/review">Leave one of your own</Link>
          </p>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
