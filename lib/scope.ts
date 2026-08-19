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
