import type { ReviewStats } from '@/lib/reviews';

/**
 * "4.8 out of 5, from 12 reviews."
 *
 * RENDERS NOTHING BELOW THE THRESHOLD, and the threshold is a property of the stats object
 * rather than a number this component knows. One decision, made in lib/reviews.ts, used by both
 * the visible badge and the structured data - because a page showing no rating while its own
 * JSON-LD claims one is a worse failure than either alone.
 */
export function AggregateBadge({ stats }: { stats: ReviewStats }) {
  if (!stats.enoughForAggregate || stats.average === null) return null;
  return (
    <p className="review-aggregate">
      <strong className="review-aggregate-score">{stats.average.toFixed(1)} out of 5</strong>
      <span className="review-aggregate-count">
        {' '}from {stats.count} reviews, every one of them written by somebody who paid for it.
      </span>
    </p>
  );
}
