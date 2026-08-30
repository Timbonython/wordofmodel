import { attribution, plainSentence, type PublicReview } from '@/lib/review-text';

/**
 * One review, as semantic HTML.
 *
 * blockquote for the words, cite for who said them, and a visible sentence underneath stating
 * the rating in plain English. That sentence is the point of the whole exercise: a crawler or a
 * language model reading this page can say "Sarah, dental, in Bendigo, rated Word of Model 5 out
 * of 5" without inferring anything from the layout or from a star glyph.
 *
 * It is VISIBLE, not hidden in an attribute or an off-screen span. Hidden text written for
 * machines is the thing this build refuses to do elsewhere and there is no reason to start here.
 */
export function ReviewCard({ review }: { review: PublicReview }) {
  const stars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);
  return (
    <figure className="review-card">
      <div className="review-card-rating" aria-hidden="true">{stars}</div>
      <blockquote className="review-card-quote">{review.reviewText}</blockquote>
      <figcaption className="review-card-by">
        <cite className="review-card-cite">{attribution(review)}</cite>
        <span className="review-card-said">{plainSentence(review)}</span>
      </figcaption>
    </figure>
  );
}
