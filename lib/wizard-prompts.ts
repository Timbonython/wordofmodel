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

export function competitorPrompt(input: {
  brand_name: string;
  what_they_sell: string;
  country: string;
}): string {
  return `Find the four companies most likely to be recommended INSTEAD of ${input.brand_name}
to a buyer of ${input.what_they_sell} in ${input.country}.

Prefer companies that actually appear in AI answers and review sites for
this category. Do not include ${input.brand_name}. Do not include companies that only
serve a different market or a different size of customer.

Return ONLY: {"competitors": ["", "", "", ""], "reasoning": "one sentence"}`;
}

export function questionsPrompt(input: {
  what_they_sell: string;
  country: string;
  category_term: string;
  buyer: string;
  brand_name: string;
  largest_competitor: string;
}): string {
  return `Write five questions a real buyer would ask an AI assistant while choosing
a supplier of ${input.what_they_sell} in ${input.country}. Follow this structure exactly:

1. CATEGORY: who is best at ${input.category_term} in ${input.country}
2. SITUATION: written in first person by ${input.buyer} describing their actual
   circumstance, then asking what they should do or who they should use
3. ALTERNATIVES: what are the alternatives to ${input.largest_competitor}
4. HOW-DO-PEOPLE: how do ${input.buyer} usually handle [the problem being solved]
5. BRANDED: is ${input.brand_name} any good, and what do people say about it

Rules:
- Only question 5 may mention ${input.brand_name}.
- Write the way a busy buyer types, not the way a marketer writes.
- Name the country or region in questions 1 to 4.
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
  country: string;
  brand_name: string;
}): string {
  return `Rewrite ONE question a real buyer would ask an AI assistant while choosing
a supplier of ${input.what_they_sell} in ${input.country}.

It must follow this structure exactly:
${input.instruction}

Rules:
${
  input.slot === 'branded'
    ? `- This question is about ${input.brand_name} and must name it.`
    : `- Never mention ${input.brand_name} or any brand name.`
}
- Write the way a busy buyer types, not the way a marketer writes.
${input.slot === 'branded' ? '' : `- Name ${input.country} or the region.\n`}- One sentence. No preamble.
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
  category: (v) => `CATEGORY: who is best at ${v.category_term} in ${v.country}`,
  situation: (v) =>
    `SITUATION: written in first person by ${v.buyer} describing their actual circumstance, then asking what they should do or who they should use`,
  alternatives: (v) => `ALTERNATIVES: what are the alternatives to ${v.largest_competitor}`,
  how_do_people: (v) =>
    `HOW-DO-PEOPLE: how do ${v.buyer} usually handle the problem being solved`,
  branded: (v) => `BRANDED: is ${v.brand_name} any good, and what do people say about it`,
};
