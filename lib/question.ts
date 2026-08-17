import 'server-only';
import { askText } from './openai';
import { questionPrompt } from './prompts';
import type { ConfirmedProfile } from './types';

/**
 * A guard around the spec's question prompt. The prompt itself is used verbatim
 * and is not edited here.
 *
 * Why this exists. Sampling the spec's prompt fifteen times across three real
 * domains on 17 Aug 2026 produced four questions that ask an assistant to name
 * companies, and eleven addressed to the supplier itself: "Can you show recent
 * Australian client work", "Do you offer a US deployment". A vendor-addressed
 * question makes both engines answer "I can't claim I've handled projects" and
 * name nobody, and the scan then reports that zero companies were named, which is
 * useless and destroys the credibility of the result. The spec is explicit that a
 * wrong question does exactly that.
 *
 * So: draw several candidates from the verbatim prompt in parallel, take the
 * first that a buyer could actually put to an assistant, and only if every draw
 * fails, rewrite the best one into shortlist form.
 */

const DRAWS = 4;

/** Second person means the question is aimed at the supplier, not an assistant. */
const ADDRESSES_VENDOR = /\b(you|your|yours|we|our|us)\b/i;

/** Asking for a set of companies rather than for a supplier's own credentials. */
const ASKS_FOR_A_SHORTLIST = /\b(which|who|what|whose|best|top|leading|recommend|recommended|options)\b/i;

const NAMES_A_CATEGORY =
  /\b(compan|agenc|vendor|supplier|provider|firm|studio|platform|tool|software|brand|installer|manufacturer|consultan|contractor|service|team|shop|practice|specialist)/i;

export function isBuyerQuestion(question: string): boolean {
  const q = question.trim();
  if (q.length < 20 || q.length > 320) return false;
  if (ADDRESSES_VENDOR.test(q)) return false;
  return ASKS_FOR_A_SHORTLIST.test(q) && NAMES_A_CATEGORY.test(q);
}

function tidy(raw: string): string {
  return raw
    .trim()
    .replace(/^question:\s*/i, '')
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Not the spec's prompt. A repair pass, used only when every draw from the spec's
 * prompt came back addressed to the supplier. It rewrites, it does not invent: the
 * buyer's own requirements are carried across.
 */
function repairPrompt(question: string, p: ConfirmedProfile): string {
  return `The question below was meant to be one a buyer would type into an AI assistant when
choosing a supplier of ${p.what_they_sell} in ${p.country}. Instead it is addressed to the
supplier, as if filling in a tender.

Rewrite it as a question put to an assistant, asking which companies to consider.

Rules:
- Keep the specific requirements, sizes, locations and constraints already in it.
- Never mention ${p.brand_name} or any brand name.
- Never address the reader as "you" or refer to "we" or "our".
- Include ${p.country} or the region.
- One sentence. No preamble.

Return only the rewritten question.

QUESTION: ${question}`;
}

export async function writeBuyerQuestion(profile: ConfirmedProfile): Promise<{
  question: string;
  attempts: number;
  repaired: boolean;
}> {
  const prompt = questionPrompt({
    what_they_sell: profile.what_they_sell || profile.category_term,
    country: profile.country,
    brand_name: profile.brand_name,
  });

  const drawn = await Promise.all(
    Array.from({ length: DRAWS }, () =>
      askText(prompt).then(
        (t) => tidy(t),
        () => '',
      ),
    ),
  );
  const candidates = drawn.filter(Boolean);
  if (!candidates.length) throw new Error('Could not write the question. Try again in a moment.');

  const clean = candidates.find(isBuyerQuestion);
  if (clean) return { question: clean, attempts: candidates.length, repaired: false };

  // Repair the longest draw, since it carries the most of the buyer's detail.
  const best = candidates.reduce((a, b) => (b.length > a.length ? b : a));
  const repaired = tidy(await askText(repairPrompt(best, profile)));
  return {
    question: isBuyerQuestion(repaired) ? repaired : best,
    attempts: candidates.length + 1,
    repaired: true,
  };
}
