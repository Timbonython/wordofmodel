import 'server-only';
import { QUESTION_SLOTS, type QuestionSlot } from './accounts';
import { isSupportedMarket, marketName } from './geo';
import { normaliseDomain } from './domain';
import {
  MAX_COMPETITORS,
  MIN_COMPETITORS,
  tidyQuestion,
  type CompetitorInput,
  type ProposedQuestion,
  type WizardProfile,
} from './onboarding';

/**
 * Parsing for everything the wizard posts back.
 *
 * The wizard keeps its state in the browser between steps and sends the whole
 * thing at each call, so every field arriving here is visitor supplied and
 * nothing may be trusted because an earlier step produced it. These are the
 * checks; the routes only ever see a parsed value or an error string.
 */

export class InputError extends Error {}

function text(value: unknown, field: string, max: number): string {
  const s = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (!s) throw new InputError(`${field} is needed.`);
  return s.slice(0, max);
}

/**
 * brand_name, category_term and the market are what the questions get built from,
 * so all three are required. what_they_sell and buyer are asked for on the same
 * screen and fall back to the category rather than blocking somebody who left a
 * box empty.
 *
 * THE MARKET IS NO LONGER TYPED. It arrives as an ISO code from a closed select and is
 * checked against the same table lib/geo.ts builds parameters from, so a market that
 * reaches the database is always one we can actually ask a question in. The prose form
 * is DERIVED from it rather than accepted, which is what stops the two disagreeing.
 *
 * The old field was free text labelled "Primary market" and the one scope that ever
 * existed had "burner phone numbers" in it. Nothing objected, and the five generated
 * questions came back spanning four different countries.
 */
export function parseProfile(input: unknown): WizardProfile {
  const p = (input ?? {}) as Record<string, unknown>;
  const category_term = text(p.category_term, 'What you sell', 120);
  const market_country = typeof p.market_country === 'string' ? p.market_country.trim().toUpperCase() : '';
  if (!isSupportedMarket(market_country)) {
    throw new InputError('Choose the country your buyers are in.');
  }
  return {
    brand_name: text(p.brand_name, 'Your brand name', 120),
    category_term,
    market_country,
    country: marketName(market_country),
    what_they_sell: typeof p.what_they_sell === 'string' && p.what_they_sell.trim()
      ? text(p.what_they_sell, 'What you sell', 200)
      : category_term,
    buyer: typeof p.buyer === 'string' && p.buyer.trim()
      ? text(p.buyer, 'Who buys it', 200)
      : 'buyers',
    website: typeof p.website === 'string' ? p.website.trim().slice(0, 200) : '',
  };
}

/**
 * Three to six, four by default. The order is the order the customer left them
 * in, and it matters: the first one is the largest competitor and is what the
 * alternatives question gets written against.
 */
export function parseCompetitors(input: unknown): CompetitorInput[] {
  const raw = Array.isArray(input) ? input : [];
  const seen = new Set<string>();
  const out: CompetitorInput[] = [];
  for (const item of raw) {
    // Accepts a bare string as well as { name, domain }: a competitor the subscriber typed
    // in themselves has no domain, and a missing domain is a concern to show rather than a
    // reason to refuse the whole set.
    const obj = typeof item === 'string' ? { name: item } : ((item ?? {}) as Record<string, unknown>);
    const name = typeof obj.name === 'string' ? obj.name.trim().replace(/\s+/g, ' ') : '';
    if (!name || name.length > 80) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const domain = typeof obj.domain === 'string' ? normaliseDomain(obj.domain) : null;
    out.push({ name, domain });
  }
  if (out.length < MIN_COMPETITORS) {
    throw new InputError(`Name at least ${MIN_COMPETITORS} competitors.`);
  }
  return out.slice(0, MAX_COMPETITORS);
}

/**
 * All five slots, exactly once each. A missing slot is not a validation nicety:
 * the report compares slot to slot across months and across subscribers, and a
 * scope with four questions produces a report that cannot be compared to
 * anything.
 */
export function parseQuestions(input: unknown): ProposedQuestion[] {
  const raw = Array.isArray(input) ? input : [];
  const bySlot = new Map<QuestionSlot, string>();

  for (const item of raw) {
    const q = (item ?? {}) as Record<string, unknown>;
    const slot = QUESTION_SLOTS.find((s) => s === q.slot);
    if (!slot || bySlot.has(slot)) continue;
    const cleaned = tidyQuestion(typeof q.text === 'string' ? q.text : '');
    if (cleaned.length < 15) {
      throw new InputError('One of the questions is too short to run. Rewrite it or regenerate it.');
    }
    bySlot.set(slot, cleaned);
  }

  const missing = QUESTION_SLOTS.filter((s) => !bySlot.has(s));
  if (missing.length) throw new InputError('All five questions are needed before you can pay.');

  return QUESTION_SLOTS.map((slot) => ({ slot, text: bySlot.get(slot) as string }));
}

export function parseSlot(input: unknown): QuestionSlot {
  const slot = QUESTION_SLOTS.find((s) => s === input);
  if (!slot) throw new InputError('That is not one of the five slots.');
  return slot;
}
