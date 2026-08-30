/**
 * JSON-LD. The site had none at all before 30 Aug 2026.
 *
 * WHAT IS HERE AND WHY EACH ONE IS ELIGIBLE:
 *
 *   Organization + WebSite   who we are and what the site is. No rating on it, ever - see below.
 *   SoftwareApplication      the product, with its real prices. A supported type for offers.
 *   AggregateRating/Review   ONLY on the SoftwareApplication, and ONLY past a review count.
 *
 * THE RATING IS NOT ON THE ORGANIZATION, AND THAT IS NOT A STYLE CHOICE.
 *
 * Google does not allow self-serving reviews for Organization or LocalBusiness - reviews
 * collected on your own site about your own business are exactly that, and marking them up
 * against either type is ineligible rather than merely unrewarded. Product and
 * SoftwareApplication are supported types where first-party customer reviews do qualify, so the
 * rating belongs on the product entity or nowhere.
 *
 * AND IT STAYS OFF UNTIL THERE ARE ENOUGH REVIEWS TO MEAN ANYTHING. A five out of five computed
 * over two people is a number with no error bars on a site whose own method page refuses to
 * print a score out of 100 because inventing one "would make this easier to sell and impossible
 * to trust". Emitting it would be that exact defect, wearing a customer's clothes, in machine
 * readable form. The gate is REVIEWS_MIN_FOR_AGGREGATE and it is enforced by the caller having
 * to pass real numbers in.
 *
 * The visible testimonials do not depend on any of this. They are semantic HTML with visible
 * attribution, which is what a crawler or a language model actually reads.
 */

import { PRICE_USD } from './scope';

export interface Jsonld {
  [key: string]: unknown;
}

export function organisationSchema(siteUrl: string): Jsonld {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${siteUrl}/#organization`,
    name: 'Word of Model',
    url: siteUrl,
    description:
      'Measures what AI assistants actually say about a business, the same way every month, ' +
      'with the answers captured word for word.',
    // No aggregateRating here. Self-serving reviews are ineligible for Organization; see header.
  };
}

export function websiteSchema(siteUrl: string): Jsonld {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${siteUrl}/#website`,
    name: 'Word of Model',
    url: siteUrl,
    publisher: { '@id': `${siteUrl}/#organization` },
  };
}

export interface RatingFacts {
  count: number;
  average: number;
}

export interface ReviewFacts {
  rating: number;
  body: string;
  author: string;
  published: string | null;
}

/**
 * The product, its real prices, and - only when passed - its rating.
 *
 * `rating` is a parameter rather than something this function fetches, so the decision about
 * whether there are enough reviews is made once, by the caller, next to the same decision the
 * visible page makes. Two places deciding "is there enough to say" is how a page shows no
 * rating while its own structured data claims one.
 */
export function productSchema(
  siteUrl: string,
  rating?: RatingFacts | null,
  reviews: ReviewFacts[] = [],
): Jsonld {
  const schema: Jsonld = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': `${siteUrl}/#product`,
    name: 'Word of Model',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: siteUrl,
    provider: { '@id': `${siteUrl}/#organization` },
    description:
      'Five questions asked across five AI surfaces every month, twenty five answers captured ' +
      'word for word, with the competitor leaderboard, the sources and three ranked actions.',
    offers: [
      {
        '@type': 'Offer',
        name: 'Monitoring',
        price: String(PRICE_USD.main_monthly),
        priceCurrency: 'USD',
        url: `${siteUrl}/pricing`,
      },
      {
        '@type': 'Offer',
        name: 'Monitoring + Review',
        price: String(PRICE_USD.premium_monthly),
        priceCurrency: 'USD',
        url: `${siteUrl}/pricing`,
      },
    ],
  };

  if (rating && rating.count > 0) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: String(rating.average),
      reviewCount: String(rating.count),
      bestRating: '5',
      worstRating: '1',
    };
  }

  if (reviews.length) {
    schema.review = reviews.map((r) => ({
      '@type': 'Review',
      reviewRating: { '@type': 'Rating', ratingValue: String(r.rating), bestRating: '5', worstRating: '1' },
      // A first name is all we hold and all we claim. Person with a name is valid; inventing a
      // surname or a job title to look more convincing to a crawler would be fabrication.
      author: { '@type': 'Person', name: r.author },
      reviewBody: r.body,
      ...(r.published ? { datePublished: r.published.slice(0, 10) } : {}),
    }));
  }

  return schema;
}

/**
 * Serialise for a <script type="application/ld+json">.
 *
 * `<` is escaped because a review body is user-submitted text, and "</script>" inside it would
 * otherwise close the tag and put the rest of somebody's review into the document as markup.
 */
export function jsonldText(schema: Jsonld | Jsonld[]): string {
  return JSON.stringify(schema).replace(/</g, '\\u003c');
}
