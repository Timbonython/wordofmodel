import { ReviewCard } from '@/components/reviews/ReviewCard';
import type { PublicReview } from '@/lib/review-text';

/**
 * A horizontal run of reviews.
 *
 * CSS SCROLL SNAP, NOT A CAROUSEL. No script, no timer, no arrows to hydrate, nothing to shift
 * layout after paint. It scrolls with a thumb on a phone and a trackpad on a desktop, every card
 * is in the HTML from the first byte, and a crawler with no JavaScript reads all of them.
 *
 * A carousel would also hide most of the content behind an interaction, which for the one
 * feature built to be read by machines is the wrong trade twice over.
 */
export function ReviewRow({ reviews }: { reviews: PublicReview[] }) {
  if (!reviews.length) return null;
  return (
    <ul className="review-row">
      {reviews.map((r) => (
        <li className="review-row-item" key={r.id}>
          <ReviewCard review={r} />
        </li>
      ))}
    </ul>
  );
}
