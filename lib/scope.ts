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
  // Monitoring - the main tier.
  main_monthly: 69,
  main_annual: 690,
  // Monitoring + Review - premium. Cumulative, never a substitution: the subscriber gets the
  // entire Monitoring product every month AND a quarterly human deep read on top.
  premium_monthly: 249,
  premium_annual: 2490,
  // The founding cohort. A SEPARATE PRICE, NEVER A COUPON - see §3 of the pricing plan. A
  // coupon carries a `duration` field, and setting it wrong silently reverts the twenty people
  // who backed this earliest. A distinct price cannot expire.
  premium_founding_monthly: 149,
  premium_founding_annual: 1490,
  // Per additional location, on either tier. A quantity line, not a plan.
  location_monthly: 30,
  location_annual: 300,
} as const;

/**
 * Annual is TEN TIMES MONTHLY on every line - two months free, no exceptions and no rounding.
 *
 * The arithmetic being obvious is part of the offer, so it is enforced rather than trusted:
 * a price list where one annual figure is 11x is a page a reader can catch us on.
 */
for (const [key, monthly] of Object.entries(PRICE_USD)) {
  if (!key.endsWith('_monthly')) continue;
  const annualKey = key.replace(/_monthly$/, '_annual') as keyof typeof PRICE_USD;
  const annual = PRICE_USD[annualKey];
  if (annual !== monthly * 10) {
    throw new Error(
      `Annual must be ten times monthly: ${annualKey} is ${annual}, expected ${monthly * 10}.`,
    );
  }
}

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
  /** What the checkout is told to charge. The card's CTA carries this to /start. */
  tier: PlanTier;
  name: string;
  /** One line. §4 of the brand brief: the tiers as one line each, not a feature table. */
  line: string;
}

export const TIERS: readonly Tier[] = [
  {
    key: 'main_monthly',
    tier: 'main',
    name: 'Monitoring',
    line:
      'Five questions, five AI surfaces, twenty five answers captured word for word every month, ' +
      'with the leaderboard, the sources and three ranked actions.',
  },
  {
    key: 'premium_monthly',
    tier: 'premium',
    name: 'Monitoring + Review',
    line:
      'Everything in Monitoring, every month, unchanged - plus a quarterly deep read from Tim ' +
      'that adds Claude and Microsoft Copilot by hand.',
  },
];

/**
 * Which plan a buyer chose. The wizard could only ever sell premium until 29 Aug 2026 - there
 * was no tier selection at all, and createCheckout produced premium_monthly or
 * premium_founding_monthly and nothing else. A page offering two cards and a checkout that can
 * only charge one of them is the same defect as printing a price nothing can honour.
 *
 * PREMIUM IS THE DEFAULT, deliberately. An unrecognised or missing value resolves to the plan
 * that was already being sold, so a malformed URL cannot quietly downgrade somebody's purchase.
 */
export type PlanTier = 'main' | 'premium';

export function planTierFrom(value: unknown): PlanTier {
  return value === 'main' ? 'main' : 'premium';
}

/** The base price a tier charges before any founding claim or discount is considered. */
export const TIER_BASE_PRICE: Record<PlanTier, keyof typeof PRICE_USD> = {
  main: 'main_monthly',
  premium: 'premium_monthly',
};

/**
 * FOUNDING IS A PREMIUM OFFER AND ONLY A PREMIUM OFFER. §3 of the pricing plan caps it because
 * each place includes a quarterly hour of Tim's time, which is the thing premium buys. A
 * Monitoring subscriber is not owed that hour, so a Monitoring checkout must not consume one of
 * the twenty.
 */
export const FOUNDING_TIER: PlanTier = 'premium';

/**
 * Which plans can accept a discount code, for deciding whether to render the box.
 *
 * DERIVED FROM THE OFFERS, not guessed. lib/discount.ts is server-only and holds the registry;
 * this is the same fact where a client component can read it, and scripts/offercheck asserts
 * the two agree so a retired offer cannot leave a box that only ever says no.
 */
export const TIERS_WITH_A_CODE: readonly PlanTier[] = ['main', 'premium'];

/**
 * What each tier includes.
 *
 * PREMIUM'S LIST IS MAIN'S LIST PLUS ADDITIONS, BY CONSTRUCTION. §1 of the pricing plan and §5
 * of the brand brief both insist premium is cumulative and never a substitution, and that the
 * page repeats every shared line rather than abbreviating to "everything in Monitoring".
 *
 * So the shared lines are not copied into a second array where they could drift. Premium
 * renders MAIN_FEATURES verbatim and then PREMIUM_ADDITIONS, visually marked. A reader cannot
 * construct the idea that premium swaps monthly reporting for quarterly, because there is no
 * arrangement of this data in which premium has fewer monthly lines than main.
 *
 * That matters commercially: a tier that looked like it traded monthly automation for
 * quarterly human work would read as paying 3.6x more for a report four times less often, and
 * no amount of copy rescues that.
 */
export const MAIN_FEATURES: readonly string[] = [
  'Five questions, written for your buyers and approved by you before anything runs',
  'Five AI surfaces: ChatGPT, Gemini, Grok, Perplexity and Google AI Overviews',
  'Twenty five answers captured word for word, every month',
  'Recommendation Share: how many surfaces put you forward, not just name you',
  'The competitor leaderboard, measured over exactly the answers you are measured over',
  'The sources the assistants cited, which is usually somebody else',
  'Three ranked actions, in order, with why that one is first',
  'Month on month change, with configuration changes reported separately from movement',
];

export const PREMIUM_ADDITIONS: readonly string[] = [
  'A quarterly deep read from Tim, by hand, on your actual answers',
  'Claude and Microsoft Copilot read manually - the two surfaces no API can honestly reach',
  'Your questions revisited each quarter as your market moves',
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
