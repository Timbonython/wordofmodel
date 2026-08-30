/**
 * Reviews: the parts with no database and no secret in them.
 *
 * NOT server-only, deliberately. The form validates in the browser against exactly the rules the
 * route enforces on the server, and the "copy this for Google" step needs the same text the page
 * displays. Two implementations of one rule is how a form that says a review is fine gets it
 * refused a second later. Same split as location-text.ts against locations.ts.
 */

export const REVIEW_MIN = 10;
export const REVIEW_MAX = 2000;
export const NAME_MAX = 60;

export interface ReviewFields {
  rating: number;
  reviewText: string;
  firstName: string;
  location: string;
  category: string;
}

export interface PublicReview extends ReviewFields {
  id: string;
  publishedAt: string | null;
  featured: boolean;
}

/**
 * The same checks on both sides of the wire.
 *
 * Returns a message for the first thing wrong, or null. Deliberately not a list: a form that
 * turns red in four places at once reads as hostile, and the person is going to fix them one at
 * a time regardless.
 */
export function reviewProblem(f: Partial<ReviewFields>): string | null {
  const rating = Number(f.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return 'Choose a star rating.';

  const text = (f.reviewText ?? '').trim();
  if (text.length < REVIEW_MIN) return 'Tell us a little more than that.';
  if (text.length > REVIEW_MAX) return `That is longer than we can publish. Keep it under ${REVIEW_MAX} characters.`;

  const name = (f.firstName ?? '').trim();
  if (!name) return 'Your first name, so we can attribute it.';
  if (name.length > NAME_MAX) return 'That name is too long.';

  return null;
}

/** "Sarah, dental, Bendigo" - whatever of the three they gave us, in that order. */
export function attribution(r: Pick<ReviewFields, 'firstName' | 'category' | 'location'>): string {
  return [r.firstName.trim(), r.category?.trim(), r.location?.trim()].filter(Boolean).join(', ');
}

/**
 * THE SENTENCE A MACHINE READS.
 *
 * A crawler or a language model arriving at this page should be able to state who said what
 * about whom without inferring anything from the layout. This is rendered as visible text under
 * each review rather than hidden in an attribute, because hidden text written for machines is
 * exactly what this build refuses to do elsewhere and there is no reason to start here.
 */
export function plainSentence(r: Pick<ReviewFields, 'firstName' | 'category' | 'location' | 'rating'>): string {
  const who = r.firstName.trim();
  const what = r.category?.trim();
  const where = r.location?.trim();
  const context = [what, where && `in ${where}`].filter(Boolean).join(' ');
  const subject = context ? `${who}, ${context},` : `${who}`;
  return `${subject} rated Word of Model ${r.rating} out of 5.`;
}

/** The text a reviewer copies to paste somewhere else. Their words, nothing added. */
export function copyableText(r: Pick<ReviewFields, 'reviewText'>): string {
  return r.reviewText.trim();
}

/**
 * The LinkedIn version, for us rather than for them.
 *
 * Their words in quotation marks, then the attribution, then nothing else. No hashtags, no
 * "thrilled to share", no call to action. A testimonial that arrives dressed as a marketing post
 * is read as one.
 */
export function linkedInVersion(r: Pick<ReviewFields, 'reviewText' | 'firstName' | 'category' | 'location' | 'rating'>): string {
  return `"${r.reviewText.trim()}"\n\n${attribution(r)} - ${r.rating}/5`;
}

/**
 * Where a reviewer can also post, and it is a REGISTRY so the set can change without a code
 * change anywhere but here.
 *
 * `url` is null until the listing exists. A platform with no URL is not rendered at all: a
 * button that goes nowhere is worse than an absent one, and this build already has a rule about
 * a price with no purchase path.
 */
export interface Platform {
  key: string;
  label: string;
  /** What the reviewer is told they are about to do. */
  hint: string;
  url: string | null;
}

export function platforms(urls: Record<string, string | null>): Platform[] {
  return [
    {
      key: 'google',
      label: 'Google',
      hint: 'Opens your Google review box. Paste and post.',
      url: urls.google ?? null,
    },
    {
      key: 'g2',
      label: 'G2',
      hint: 'G2 asks you to sign in first. Worth it if you buy software for work.',
      url: urls.g2 ?? null,
    },
    {
      key: 'trustpilot',
      label: 'Trustpilot',
      hint: 'No account needed to start.',
      url: urls.trustpilot ?? null,
    },
  ].filter((p) => Boolean(p.url));
}
