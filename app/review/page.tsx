import type { Metadata } from 'next';
import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';
import { ReviewForm } from '@/components/reviews/ReviewForm';
import { livePlatforms } from '@/lib/reviews';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Leave a review - Word of Model',
  description:
    'Tell us how Word of Model went. First name only, a star rating and a few sentences. ' +
    'Nothing is published until a person has read it.',
  alternates: { canonical: '/review' },
  // NOINDEX. This is a form, not content. The reviews themselves are indexable on /reviews and
  // wherever they are shown; a submission page in the index is a page that ranks for nothing and
  // occasionally collects a spam submission from somebody who found it in search.
  robots: { index: false, follow: true },
};

/**
 * Where somebody leaves a review.
 *
 * SERVER RENDERED AROUND ONE CLIENT ISLAND. The shell, the nav and the footer are static; only
 * the form itself is interactive, so the page costs one small script and nothing else.
 *
 * The platform list is resolved on the SERVER, so a destination with no URL configured never
 * reaches the browser at all - the reviewer is never shown a button that cannot work.
 */
export default function ReviewPage() {
  return (
    <>
      <SiteNav sampleLive issue="Review" />

      <main className="wrap">
        <section className="wizard-step">
          <div className="eyebrow">Your turn</div>
          <h1>How did it go?</h1>
          <p className="lede">
            Two minutes. A star rating and a few sentences is plenty, and plain words beat
            polished ones. We publish first names only, never a surname and never your company.
          </p>
          <ReviewForm platforms={livePlatforms()} />
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
