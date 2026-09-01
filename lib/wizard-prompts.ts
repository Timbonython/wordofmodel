// The two prompts from wordofmodel-onboarding-billing-spec.md, verbatim.
// Interpolation only, the same discipline lib/prompts.ts holds for the free scan.
//
// Slot 2 interpolates [buyer]. The spec said "by a buyer" until 19 Aug 2026 and
// the spec was amended rather than this file diverging from it: slot 4 already
// interpolated the buyer and slot 2 did not, so the situation question came back
// written for a generic buyer. A profile of "marketing managers at mid sized
// businesses" produced "I run a small business in Australia", on both the batch
// generation and the single slot rewrite. Slot 2 is the slot the spec calls the
// most important of the five, and asked for the wrong buyer it measures the
// wrong market.
//
// The five slot structure is the IP. Every audit run so far has used this shape,
// and it works because each slot fails differently. Do not paraphrase the slot
// descriptions: they are what makes one subscriber's report comparable to
// another's, and month three comparable to month one.

import type { QuestionSlot } from './scope';

/**
 * AMENDED 21 Aug 2026. The original asked only for "the four companies most likely to be
 * recommended INSTEAD of [brand]" and nothing in it required the answers to be companies.
 * The first real subscriber got "GlobaleSIM" - their own category with the spaces removed -
 * sitting in the leaderboard next to Airalo and Holafly looking like a peer.
 *
 * Two changes. The exclusions are explicit, because a model reaching for a plausible fourth
 * name will invent a category unless told not to. And a DOMAIN is now required alongside
 * every name: a model that has to produce airalo.com cannot produce globalesim.com without
 * noticing it is inventing one, and the domain is then checkable against the real web.
 *
 * competitors.domain has existed unused since 0002. This is what it was for.
 */
export function competitorPrompt(input: {
  brand_name: string;
  what_they_sell: string;
  /**
   * Where the buyer is, in prose, and it is NOT always a country: on a scope with a
   * locality it reads "Geelong, Australia". Built once by placeLabel() so the questions
   * the subscriber approves and the market printed in their report cannot drift apart.
   *
   * Named `place` rather than `country` on purpose. It used to be `country`, and
   * lib/onboarding.ts fed it to iso2() to recover an ISO code that was already sitting in
   * the same object as market_country. A string with a town in it would have returned null
   * from that and quietly dropped the country filter off the competitor search.
   */
  place: string;
}): string {
  return `Find the four companies most likely to be recommended INSTEAD of ${input.brand_name}
to a buyer of ${input.what_they_sell} in ${input.place}.

Prefer companies that actually appear in AI answers and review sites for
this category. Do not include ${input.brand_name}. Do not include companies that only
serve a different market or a different size of customer.

Every entry must be a REAL, NAMED COMPANY with its own website. Do not return:
- a product category or a description of what is being sold
- a generic phrase such as "global providers" or "budget options"
- a marketplace, directory, comparison site or review publication
- a company you cannot give a working domain for

Give the domain a buyer would actually land on, with no protocol and no path,
for example "airalo.com". If you are not confident of the domain, leave it empty
rather than guessing: an invented domain is worse than a missing one.

Return ONLY: {"competitors": [{"name": "", "domain": ""}], "reasoning": "one sentence"}`;
}

export function questionsPrompt(input: {
  what_they_sell: string;
  /** Where the buyer is, in prose. May be narrower than a country. See competitorPrompt. */
  place: string;
  category_term: string;
  buyer: string;
  brand_name: string;
  largest_competitor: string;
}): string {
  return `Write five questions ${input.buyer} would ask an AI assistant while deciding which
business to choose for ${input.what_they_sell} in ${input.place}.

The business these questions are about is one of the things BEING CHOSEN. Do not write questions
addressed to it, and do not frame it as a supplier being asked to pitch - unless ${input.buyer}
genuinely buys on trade terms, in which case say so plainly. Who is choosing decides which
direction every one of these runs.

Follow this structure exactly:

1. CATEGORY: who is best at ${input.category_term} in ${input.place}
2. SITUATION: written in first person by ${input.buyer} describing their actual
   circumstance, then asking what they should do or who they should use
3. ALTERNATIVES: what are the alternatives to ${input.largest_competitor}
4. HOW-DO-PEOPLE: how do ${input.buyer} usually handle [the problem being solved]
5. BRANDED: is ${input.brand_name} any good, and what do people say about it

Rules:
- Only question 5 may mention ${input.brand_name}.
- Write the way a busy buyer types, not the way a marketer writes.
- Name the place in questions 1 to 4, exactly as it is written above.
- One sentence each. No preamble.

Return ONLY: {"questions": [{"slot": 1, "text": ""}, ...]}`;
}

/**
 * Not in the spec. The spec calls for a "rewrite this one" button that
 * regenerates a single slot while keeping the others, and this is that call.
 *
 * It carries the other four questions so the rewrite does not land on top of one
 * of them, and it restates the slot's own structure so a regenerated question
 * still belongs to the slot it replaced. A rewritten slot 2 that comes back as
 * another category question quietly destroys the comparison the slots exist for.
 */
export function rewriteSlotPrompt(input: {
  slot: QuestionSlot;
  instruction: string;
  current: string;
  others: string[];
  what_they_sell: string;
  /** Where the buyer is, in prose. May be narrower than a country. See competitorPrompt. */
  place: string;
  brand_name: string;
}): string {
  return `Rewrite ONE question a real buyer would ask an AI assistant while choosing
which business to choose for ${input.what_they_sell} in ${input.place}. The business is one of
the things being chosen, never the supplier being asked to pitch.

It must follow this structure exactly:
${input.instruction}

Rules:
${
  input.slot === 'branded'
    ? `- This question is about ${input.brand_name} and must name it.`
    : `- Never mention ${input.brand_name} or any brand name.`
}
- Write the way a busy buyer types, not the way a marketer writes.
${input.slot === 'branded' ? '' : `- Name ${input.place}, exactly as written.\n`}- One sentence. No preamble.
- Do not repeat any of the questions listed under KEEP AWAY FROM.

The question being replaced: ${input.current}

KEEP AWAY FROM:
${input.others.map((q) => `- ${q}`).join('\n')}

Return only the rewritten question.`;
}

/**
 * The slot structures, lifted from the numbered list in the generation prompt so
 * a single slot rewrite asks for the same thing the batch did. Interpolated at
 * the call site.
 */
export const SLOT_STRUCTURE: Record<QuestionSlot, (v: Record<string, string>) => string> = {
  category: (v) => `CATEGORY: who is best at ${v.category_term} in ${v.place}`,
  situation: (v) =>
    `SITUATION: written in first person by ${v.buyer} describing their actual circumstance, then asking what they should do or who they should use`,
  alternatives: (v) => `ALTERNATIVES: what are the alternatives to ${v.largest_competitor}`,
  how_do_people: (v) =>
    `HOW-DO-PEOPLE: how do ${v.buyer} usually handle the problem being solved`,
  branded: (v) => `BRANDED: is ${v.brand_name} any good, and what do people say about it`,
};
