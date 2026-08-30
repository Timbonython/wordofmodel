import { attribution, plainSentence, type PublicReview } from '@/lib/review-text';

/**
 * One review, given the space of a section.
 *
 * SHOWN FROM THE FIRST APPROVED REVIEW, unlike the wall and the aggregate. One testimonial
 * presented as one testimonial claims nothing that needs a sample size behind it; an average
 * over two people does.
 */
export function FeaturedReview({ review }: { review: PublicReview }) {
  return (
    <figure className="review-featured">
      <div className="review-featured-rating" aria-hidden="true">{'★'.repeat(review.rating)}</div>
      <blockquote className="review-featured-quote">{review.reviewText}</blockquote>
      <figcaption className="review-featured-by">
        <cite className="review-card-cite">{attribution(review)}</cite>
        <span className="review-card-said">{plainSentence(review)}</span>
      </figcaption>
    </figure>
  );
}
