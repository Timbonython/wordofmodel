/**
 * The vocabulary of a scope: the five question slots and the locked surface set.
 *
 * Deliberately NOT server-only, and deliberately importing nothing. The
 * onboarding wizard renders the slot labels in the browser, and pulling them out
 * of lib/accounts.ts would drag the Supabase client into the client bundle. That
 * is what the server-only marker is there to prevent, and the build caught it.
 *
 * Constants only. Anything that touches the database belongs in lib/accounts.ts.
 */

export const QUESTION_SLOTS = [
  'category',
  'situation',
  'alternatives',
  'how_do_people',
  'branded',
] as const;
export type QuestionSlot = (typeof QUESTION_SLOTS)[number];

/**
 * Report order for the five slots. The DB stores the slot by name and says
 * nothing about order; this array is the order, and `branded` is last because
 * it is the control condition rather than a finding.
 */
export const SLOT_LABEL: Record<QuestionSlot, string> = {
  category: 'The category question',
  situation: 'The situation question',
  alternatives: 'The alternatives question',
  how_do_people: 'The how do people question',
  branded: 'The branded question',
};

/**
 * The locked surface set, frozen 10 Aug 2026. Five monthly, two quarterly.
 * A surface is only ever recorded from itself: running a different system and
 * filing the answer under a surface's name is the one substitution this product
 * cannot make, which is why claude and copilot are browser only.
 */
export const SURFACES = {
  chatgpt: { label: 'ChatGPT', cadence: 'monthly', method: 'api' },
  gemini: { label: 'Gemini', cadence: 'monthly', method: 'api' },
  grok: { label: 'Grok', cadence: 'monthly', method: 'api' },
  perplexity: { label: 'Perplexity', cadence: 'monthly', method: 'api' },
  google_aio: { label: 'Google AI Overviews', cadence: 'monthly', method: 'serp' },
  claude: { label: 'Claude', cadence: 'quarterly', method: 'browser' },
  copilot: { label: 'Microsoft Copilot', cadence: 'quarterly', method: 'browser' },
} as const;

export type Surface = keyof typeof SURFACES;
export type CaptureMethod = 'api' | 'serp' | 'browser';
export type RunPeriod = 'monthly' | 'quarterly' | 'calibration';
export type CompetitorSource = 'proposed' | 'subscriber_added';

export const MONTHLY_SURFACES = (Object.keys(SURFACES) as Surface[]).filter(
  (s) => SURFACES[s].cadence === 'monthly',
);

export const QUARTERLY_SURFACES = Object.keys(SURFACES) as Surface[];

/**
 * THE PRICE, AS A STRING, FROM THE ONLY NUMBER THAT REACHES STRIPE.
 *
 * The amounts live in lib/stripe.ts because that is what builds the line item and what
 * assertPrice() checks. They were also typed into the marketing page as literals, into the
 * scan result, and into the terms, which is four places for one number and three of them
 * silently wrong the day it changes. The page now formats the same constant Stripe charges.
 *
 * Here rather than in lib/stripe.ts because that module is server-only and this is rendered
 * in the browser, which is the same reason lib/scope.ts exists at all.
 */
export const PRICE_USD = {
  founding_monthly: 149,
  standard_monthly: 249,
} as const;

/**
 * THE PRODUCT CATALOGUE. Everything that renders a tier reads this; nothing retypes one.
 *
 * WHY IT IS A LIST AND NOT PARAGRAPHS OF COPY. §5 of the brand brief and §1 of the pricing
 * plan describe a two-tier ladder - Monitoring at US$69 and Monitoring + Review at US$249 -
 * and today only one of those exists in Stripe. A hardcoded strip would have to be rewritten
 * the day the second price is created, and the person creating the price is not the person
 * who remembers the strip exists. Adding a tier here is the whole change: the home page, and
 * every later surface that reads this, pick it up with no edit.
 *
 * A TIER IS ONLY LISTED WHEN ITS PRICE EXISTS. `key` must be a real member of PRICE_USD, so
 * the type system refuses a tier the checkout could not honour. That is the same defect as an
 * ad promising a minute against a product that takes three, and it is the reason the US$69
 * line is absent rather than commented out with a hopeful date on it.
 */
export interface Tier {
  /** The price this tier charges. Must exist in PRICE_USD, which is what Stripe is checked against. */
  key: keyof typeof PRICE_USD;
  name: string;
  /** One line. §4 of the brand brief: the tiers as one line each, not a feature table. */
  line: string;
}

export const TIERS: readonly Tier[] = [
  {
    key: 'standard_monthly',
    name: 'Monitoring + Review',
    line:
      'Five questions, five AI surfaces, twenty five answers captured word for word every month, ' +
      'plus a quarterly deep read that adds Claude and Copilot by hand.',
  },
  // GATE 4 ADDS 'Monitoring' HERE at main_monthly, once that price exists in PRICE_USD and in
  // Stripe. Order is display order, cheapest first.
];

/**
 * How many founding places there are, for copy. lib/stripe.ts owns the number the claim
 * function is given; this is the same value where the browser can read it, and stripe.ts
 * throws at load if they ever drift.
 */
export const FOUNDING_SEATS_PUBLIC = 20;

/**
 * "US$149" - the form every price on the site takes.
 *
 * THE TWO-CHARACTER PREFIX IS THE WHOLE GUARD, and it is not a style preference. An Australian
 * who reads "$149" and is charged A$228 has been surprised; one who reads "US$149" has not, and
 * Australian small businesses buy USD software constantly. §4 of the pricing plan.
 *
 * This used to render "USD 149", which is neither the bare dollar sign the rule forbids nor the
 * prefix it requires. Corrected 28 Aug 2026.
 */
export function priceLabel(key: keyof typeof PRICE_USD): string {
  return `US$${PRICE_USD[key]}`;
}
