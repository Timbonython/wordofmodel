// The three prompts from wordofmodel-free-scan-spec.md.
//
// AMENDED 1 Sep 2026 by word-of-model-scan-grounding-and-confirm.md, which supersedes the free
// scan spec for these two. The originals are quoted in the comments below so the change is
// legible rather than silent - the free scan spec still carries the old text and has not been
// edited, because two renderings of one truth diverge and the newer brief is the one that binds.

import { constraintBlock, type BusinessProfile } from './profile';

/**
 * EXTRACTION, AND IT NOW QUOTES A LOCATION RATHER THAN INFERRING A MARKET.
 *
 * `country` used to be "primary market, ISO country name" - a judgement, not a fact, and the
 * only geography the pipeline had. §3 of the grounding brief replaces that with an address
 * QUOTED from the page: "Adelaide, SA" is the fact; "South Australia's capital" is not.
 *
 * `country` survives for one purpose only, and it is not the question: the engines take an ISO
 * country to localise their own web search. See app/api/scan/route.ts.
 */
export function detectPrompt(siteText: string): string {
  return `You are analysing a company website to prepare a buyer-intent search question.

From the text below, return ONLY this JSON, no preamble, no markdown:
{
  "brand_name": "the company's name as customers would say it",
  "what_they_sell": "plain, specific, max 10 words",
  "buyer": "who is CHOOSING it - the person deciding, max 10 words",
  "country": "primary market, ISO country name",
  "location": "the TOWN OR CITY this business SERVES CUSTOMERS IN, or null if it serves a whole country",
  "category_term": "the phrase a buyer would search, max 6 words"
}

For "location": WHERE THE CUSTOMERS ARE, not where the company has a desk. Look at the address,
the footer, the contact page, any postcode, any phone area code, and any structured data.

Return the TOWN OR CITY, plus the state if the page gives one - "Adelaide, SA". Not the street,
not the building number, not the postcode: a person asking an assistant for somewhere to go names
a suburb or a city, never a postal address, and the question is built from this string.

Set it to NULL when the business is not chosen by where it is - an online shop that delivers
nationwide, a business serving a whole country or the world. A head office in a city does not
make that city the answer. Null is the right answer for those and a city is the wrong one.

Take the words from the page and add nothing to them - do not expand an abbreviation, do not name
the state's capital, and do not infer a city from the country. If no place appears anywhere on
the page, set it to null.

For "buyer": name the person who chooses this business, not the trade it might sell into. A pub
is chosen by people deciding where to eat and drink, not by venues buying supplies.

If the site is too thin to tell, set any unknown field to null. A null is a useful answer here
and a guess is not.

SITE TEXT:
${siteText}`;
}

/**
 * GENERATION, AND ITS SIGNATURE IS THE GUARD.
 *
 * It takes a BusinessProfile and a brand name. Not site text, not a country, not a request. So
 * the only place name that can reach a generated question is one the profile carries, which came
 * from the page or from the visitor. A wrong city is unrepresentable rather than unlikely, which
 * is principle §1 - and there is deliberately no check downstream hunting for wrong cities,
 * because that is the version this replaced.
 *
 * TWO THINGS THE ORIGINAL DID, BOTH REMOVED:
 *
 *   "a supplier of ${'${what_they_sell}'}"   hardcoded the client as a seller into trade. Every business
 *                              came out as a wholesaler; a pub became a pub-food supplier.
 *   "- Include the country or region."   instructed the model to name a place whether or not one
 *                              was known, on top of a country that defaulted to Australia.
 *
 * The buyer was extracted, carried on the profile, and then dropped before this prompt was
 * built. It is now the first constraint, because it decides which direction the question runs.
 */
export function questionPrompt(profile: BusinessProfile, brandName: string): string {
  return `Write ONE question that a real person would type into an AI assistant while they are
deciding which business to choose.

The question must be asked BY the person choosing, ABOUT their options. It must name what they
are choosing between. The business described below is one of the things being chosen - never the
supplier, the vendor or the provider being asked to pitch, unless the constraints below say so.

CONSTRAINTS. These are the only facts you have. Use them and add nothing.
${constraintBlock(profile)}

Rules:
- Never mention ${brandName} or any brand name.
- Introduce no place name that is not in the constraints above.
- Write it the way a busy person types, not the way a marketer writes.
- Make it specific enough that only a handful of businesses could answer it.
- One sentence. No preamble.

Return only the question.`;
}

export function scorePrompt(input: { brand_name: string; question: string; answer: string }): string {
  return `Here is an AI assistant's answer to a buyer's question. Return ONLY this JSON:
{
  "target_mentioned": true/false,
  "target_recommended": true/false,
  "target_position": integer or null,
  "brands_named": ["in the order they appear"],
  "top_recommendation": "the brand pushed hardest, or null",
  "domains_cited": ["..."]
}

TARGET BRAND: ${input.brand_name}
QUESTION: ${input.question}
ANSWER: ${input.answer}`;
}
