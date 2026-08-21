/**
 * Interpretation. A separate pass over stored captures, and never part of a capture.
 *
 * An engine call costs money and can never be reproduced; a parse can be re-run a hundred
 * times. So the run stores the verbatim answer and the whole provider envelope, and this
 * reads them afterwards. Nothing in here touches an engine.
 *
 * THE PASS IS IN TWO HALVES AND THE SPLIT IS THE POINT.
 *
 *   DETERMINISTIC, and authoritative: is the TARGET named, and which of the KNOWN
 *   COMPETITORS are named. These are the quantities the score is computed from, we hold
 *   the exact strings to look for, and string matching gives the same answer every time.
 *
 *   MODEL, for the judgments string matching cannot make: named versus RECOMMENDED, where
 *   the target ranks, which brand is pushed hardest, and which brands we did not already
 *   know about. The gap between named and recommended is, per the offer sheet, the finding
 *   in every report - it is worth a call. Everything else is not.
 *
 * Where they disagree about a known brand, the deterministic half wins. If "Zapme" is in
 * the text, Zapme was named, whatever the model said.
 *
 * TEMPERATURE 0 IS NOT DETERMINISM. The model half is as reproducible as the API allows,
 * which is why extraction_version and extractor_model are stored on every row: a re-parse
 * is comparable to the previous one because we know what produced each.
 */

import 'server-only';
import { db } from './db';
import { askJsonExact } from './openai';
import { brandKey } from './score';
import { isHedgeReason, HEDGE_REASONS, type HedgeReason } from './actions';
import type { Citation } from './types';

/**
 * Bump when the prompt, the schema or the matching rules change.
 *
 * A trend line built from version 1 rows and version 2 rows has a step in it that is ours,
 * not the market's - the fourth thing that can move a number without the market moving,
 * after the competitor set, the surface set and the sampling depth. Session 4 must compare
 * like with like or say what changed.
 */
export const EXTRACTION_VERSION = 5;

/**
 * v2, 21 Aug 2026. The judgment call now also returns the sentence in which the answer said
 * WHY it stopped short of recommending the target, and a closed-set reason for it. Same
 * call, same temperature, two more fields - nothing about how mentions or recommendations
 * are decided changed.
 *
 * v3, same day, after reading what v2 actually stored across all 54 captures of the first
 * run. On the four unbranded questions it was returning true sentences that are not about
 * the subscriber at all: "Most global travel eSIMs are data-only", "Go with Roamless". Both
 * verbatim, both useless as a reason THEY were not recommended, and quoted under a
 * surface's name in a section about them they would read as a reason. v3 says outright that
 * a statement about the category is not a reason about the brand. The report also stopped
 * accepting unbranded hedges - see lib/report.ts - so this is belt and braces, and the belt
 * is the one that keeps the stored data honest for whatever reads it next.
 *
 * v5, and this one was caught by re-rendering from stored data rather than by reading the
 * code. v4's hedge instructions changed an answer the previous two versions read correctly:
 * ChatGPT's branded answer for Zapme says "promising, not proven", "may be worth trying if
 * you specifically want...", and "I'd compare it against Airalo, Nomad, Ubigi... first".
 * v2 and v3 both read that as not recommending. v4 read it as recommending, five times out
 * of five - not variance, a systematic shift - and endorsement went from 1 of 5 to 2 of 5,
 * which is the headline number of the whole report.
 *
 * The mechanism is priming. Asking for the sentence that explains a hesitation invites the
 * model to file the hesitation separately and read the rest as an endorsement, so a hedged
 * conditional becomes "a recommendation with a caveat". v5 says a conditional or
 * comparative verdict is not a recommendation, gives the exact shapes, and says outright
 * that finding a hedge sentence does not make the answer a recommendation.
 *
 * THE LESSON IS ABOUT THE PIPELINE, NOT THE PROMPT. A field added for a report section
 * moved the metric the product is sold on, silently, in a pass that costs nothing to run.
 * See scripts/extract-check.mjs: judgments the report depends on now have fixtures, and a
 * version bump is checked against them before it goes near a subscriber's numbers.
 *
 * The bump is mechanical and stays that way. The prompt changed, so the version changed;
 * the alternative is deciding case by case whether a prompt change "really" matters, which
 * is how a step in a trend line gets argued into existence. Every capture in the database
 * was re-read at v3, so nothing currently spans versions. The first run that mixes them is
 * the one to watch - delta.ts checks how a surface was measured but not which version read
 * it.
 */

// ------------------------------------------------------------- deterministic half

/**
 * Does this text name this brand?
 *
 * Matched with word boundaries against a normalised copy, so "Wave" is found in "Wave is
 * free" and NOT in "waveapps.com" - a substring check would score a citation domain as a
 * mention and inflate every brand with a common word in its name.
 *
 * Three needles, because a brand is written more than one way:
 *   "Zapme"        as written
 *   "Zap Me"       spaced, when the text runs it together and the config does not
 *   "Acme Pty Ltd" with the company suffix stripped, when the text just says "Acme"
 *
 * Verified 20 Aug 2026 against the cases that would have quietly broken the number:
 * "Wave" is NOT found in "waveapps.com" or "microwave", "Sage" is NOT found in "message",
 * and all of ZapMe/Zap Me, Acme Pty Ltd, "Airhub's", "MYOB," and "quickbooks.intuit.com"
 * ARE found.
 *
 * KNOWN LIMITATION, flagged rather than fixed. A brand whose name is a short common word -
 * "One", "Now", "Up" - will match ordinary prose and score a mention that is not one. Word
 * boundaries cannot tell a brand from a preposition. The fix belongs at onboarding, where
 * a brand name that is a common English word should be flagged to the subscriber, rather
 * than here where it would mean guessing at intent. No current subscriber is affected.
 */
export function namesBrand(text: string, brand: string): boolean {
  if (!text || !brand.trim()) return false;
  const hay = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;

  const needles = new Set<string>();
  const spaced = brand.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (spaced) needles.add(spaced);
  const collapsed = brandKey(brand); // also strips Pty, Ltd, Inc and friends
  if (collapsed.length >= 3) needles.add(collapsed);

  for (const n of needles) if (hay.includes(` ${n} `)) return true;
  return false;
}

/** Unique cited domains, straight off the engine's own citation payload. */
export function citedDomains(citations: Citation[] | null): string[] {
  return [...new Set((citations ?? []).map((c) => c.domain).filter(Boolean))];
}

// -------------------------------------------------------------------- model half

interface Judgment {
  target_recommended: boolean;
  target_position: number | null;
  top_recommendation: string | null;
  other_brands: string[];
  hedge_quote: string | null;
  hedge_reason: string | null;
  hedge_span: string | null;
}

const JUDGMENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'target_recommended',
    'target_position',
    'top_recommendation',
    'other_brands',
    'hedge_quote',
    'hedge_reason',
    'hedge_span',
  ],
  properties: {
    target_recommended: { type: 'boolean' },
    target_position: { type: ['integer', 'null'] },
    top_recommendation: { type: ['string', 'null'] },
    other_brands: { type: 'array', items: { type: 'string' } },
    hedge_quote: { type: ['string', 'null'] },
    hedge_reason: { type: ['string', 'null'], enum: [...HEDGE_REASONS, null] },
    hedge_span: { type: ['string', 'null'] },
  },
} as const;

function judgmentPrompt(input: {
  brand: string;
  question: string;
  answer: string;
  knownBrands: string[];
}): string {
  return `An AI assistant was asked a buyer's question. Read its answer and report what it
actually says about ${input.brand}.

target_recommended: true only if the answer puts ${input.brand} forward as a choice the
buyer should make. Being listed, compared, or mentioned in passing is NOT recommended.
The difference between named and recommended is the whole point of this task, so do not
soften it.

THE TEST IS WHERE THE VERDICT LEAVES THE BUYER: with ${input.brand}, or comparing.

Not a recommendation. The verdict sends them elsewhere, or withholds judgment until better
evidence exists:
  "promising, not proven"
  "there isn't enough independent feedback for me to say it's one of the best"
  "worth a look, but I'd compare it against A, B and C first"
  "treat it as a convenient option rather than a proven replacement"

Still a recommendation. The verdict puts them forward FOR SOMETHING, and does not then
point the buyer at rivals:
  "highly useful, especially if you need X"
  "the best choice for travellers who want Y"
  "worth it if you value X"

A qualifier that narrows WHO it suits is not a hedge. A qualifier that defers to the
alternatives, or to evidence that does not exist yet, is. Tone is not the test: a warm
sentence ending in "but check the others first" is false, and a flat "use it for X" is
true.

FINDING A REASON TO HESITATE DOES NOT MAKE THIS TRUE. hedge_quote below asks you to find
the sentence where the answer explains a hesitation. An answer that has one is not "a
recommendation with a caveat": in almost every case an answer carrying such a sentence in
its verdict is NOT recommending. Decide target_recommended on its own, before you look for
that sentence.

target_position: where ${input.brand} ranks among the companies being recommended, 1 for
first. null if it is not ranked or not recommended.

top_recommendation: the one company the answer pushes hardest. null if it genuinely does
not favour one.

other_brands: companies named in the answer that are NOT already in this list:
${input.knownBrands.join(', ') || '(none)'}
Company names only. Do not include publications, review sites or the buyer.

hedge_quote: if the answer gives a REASON for not putting ${input.brand} forward without
reservation - thin independent evidence, a low published rating, mixed reports, being small
or new, something they do not do, price - copy the ONE sentence that states it, EXACTLY as
written, character for character.

The sentence must be ABOUT ${input.brand}. A general statement about the category, a caveat
about what products like theirs typically do, or a reason to prefer some other company is
NOT a reason about ${input.brand}, however true it is: return null for all of those. Do not paraphrase, do not summarise, do not join two
sentences, do not fix its punctuation. If the answer states no such reason, or you would
have to write the sentence yourself, return null. Returning null is correct far more often
than guessing, and a sentence that is not in the answer word for word will be thrown away.

hedge_span: when only PART of hedge_quote states the reason, copy that clause, again
EXACTLY as written and as a substring of hedge_quote. A sentence that gives a reason and
then softens it - "It's not as established as X, but users often praise its value" - has a
reason clause and a clause that is not one, and the first is the span. null when the whole
sentence is the reason, which is the common case. Never rewrite the clause to stand alone.

hedge_reason: which of these the quoted sentence is, or null when hedge_quote is null.
  evidence_thin     not enough independent feedback, reviews or third-party coverage
  rating_low        names a specific published score or star rating that is unflattering
  reputation_mixed  reports of mixed or negative experience dealing with them
  small_or_new      too small, too new or too low profile to put forward
  coverage_gap      names something they do not do, or a limitation in what they cover
  price             price, fees or value for money
  other             a stated reason that is none of the above

QUESTION: ${input.question}

ANSWER:
${input.answer}`;
}

// ------------------------------------------------------------------------- the pass

export interface CaptureToExtract {
  id: string;
  engine: string;
  outcome: 'answered' | 'no_answer' | 'refused';
  answer_text: string | null;
  citations: Citation[] | null;
  question_id: string;
}

export interface ExtractionResult {
  captureId: string;
  targetMentioned: boolean;
  targetRecommended: boolean;
  targetPosition: number | null;
  topRecommendation: string | null;
  brandsNamed: string[];
  domainsCited: string[];
  extractorModel: string | null;
  /** Verbatim, and null unless it was found in the answer. Never a paraphrase. */
  hedgeQuote: string | null;
  hedgeReason: HedgeReason | null;
  /** The clause inside hedgeQuote that carries the reason, for marking. Null when it is all of it. */
  hedgeSpan: string | null;
}

/**
 * THE GUARD THAT MAKES THIS EXTRACTION RATHER THAN GENERATION.
 *
 * A model asked for a quote will, often enough to matter, produce a sentence that is what
 * the answer meant rather than what it said. Stored, that sentence would appear in the
 * report inside quotation marks with a surface's name against it - the report attributing
 * words to ChatGPT that ChatGPT never wrote. There is no version of this product that
 * survives doing that once.
 *
 * So the quote is looked for in the answer, and dropped when it is not there. Comparison is
 * on a normalised copy - case, curly quotes, dashes, markdown emphasis and whitespace all
 * differ between what a model echoes and what the provider sent - but nothing that changes
 * a word is normalised away. The stored string is the model's, unedited, so the subscriber
 * can find it in the verbatim answer printed further down the same report.
 */
function verbatimQuote(answer: string, quote: string | null): string | null {
  if (!quote) return null;
  const trimmed = quote.trim();
  // Matches the length constraint in 0009: below 20 characters it is a fragment, above 600
  // it is a summary wearing a quotation mark.
  if (trimmed.length < 20 || trimmed.length > 600) return null;
  return normaliseForMatch(answer).includes(normaliseForMatch(trimmed)) ? trimmed : null;
}

/**
 * The clause inside the quote that carries the reason, or null.
 *
 * Marked rather than cut. Grok's sentence gives its reason and then softens it, and storing
 * only the first half would have us printing an edited quote under Grok's name in a report
 * whose whole claim is that we hand back what the engines said. So the sentence stays whole
 * and this says where to draw the line under it.
 *
 * A span that IS the whole quote is null: marking every word is the same as marking none,
 * and it would put a rule under four sentences out of five for no reason.
 */
function verbatimSpan(quote: string, span: string | null): string | null {
  if (!span) return null;
  const trimmed = span.trim().replace(/[,;:.\s]+$/, '');
  if (trimmed.length < 8) return null;

  // Compared with trailing punctuation off BOTH sides. A model asked for the reason clause
  // of a sentence that is entirely a reason returns the sentence without its full stop,
  // which is not "part of" anything - marking it underlines every word, which is the same
  // as underlining none and puts a red rule under four quotes in five.
  const haystack = normaliseForMatch(quote).replace(/[,;:.\s]+$/, '');
  const needle = normaliseForMatch(trimmed);
  if (needle === haystack) return null;
  return haystack.includes(needle) ? trimmed : null;
}

function normaliseForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/[*_`#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function extractCapture(
  capture: CaptureToExtract,
  scope: { brand_name: string },
  competitors: string[],
  questionText: string,
): Promise<ExtractionResult> {
  const domainsCited = citedDomains(capture.citations);

  // A surface that showed nothing has nothing to interpret. It still gets extracted_at, so
  // "has this been parsed" stays a question with an answer rather than being inferred from
  // an empty brands list - which is also what an answer naming nobody looks like.
  if (capture.outcome !== 'answered' || !capture.answer_text) {
    return {
      captureId: capture.id,
      targetMentioned: false,
      targetRecommended: false,
      targetPosition: null,
      topRecommendation: null,
      brandsNamed: [],
      domainsCited,
      extractorModel: null,
      hedgeQuote: null,
      hedgeReason: null,
      hedgeSpan: null,
    };
  }

  const text = capture.answer_text;

  // Deterministic, and authoritative for everything we already know the name of.
  const targetMentioned = namesBrand(text, scope.brand_name);
  const competitorsNamed = competitors.filter((c) => namesBrand(text, c));

  const known = [scope.brand_name, ...competitors];
  let judgment: Judgment = {
    target_recommended: false,
    target_position: null,
    top_recommendation: null,
    other_brands: [],
    hedge_quote: null,
    hedge_reason: null,
    hedge_span: null,
  };
  let extractorModel: string | null = null;

  try {
    const out = await askJsonExact<Judgment>(
      judgmentPrompt({ brand: scope.brand_name, question: questionText, answer: text, knownBrands: known }),
      'capture_judgment',
      JUDGMENT_SCHEMA,
    );
    judgment = out.value;
    extractorModel = out.model;
  } catch (err) {
    // A failed judgment must not throw away the deterministic half, which is the part the
    // score is built from. The row is left unextracted so the pass picks it up again, and
    // the reason is loud rather than silently becoming "not recommended".
    console.error(`extract: judgment failed for capture ${capture.id}`, err);
    throw err;
  }

  // A brand cannot be recommended without being named. The deterministic half decides
  // whether it was named, so it also caps this.
  const targetRecommended = judgment.target_recommended && targetMentioned;

  // The quote and its reason travel together, matching 0009: a reason with no surviving
  // quote would put the report's own words where a surface's should be. A quote the model
  // invented is logged rather than swallowed - it is the signal that the guard is earning
  // its place, and a rate that climbs is a prompt regression.
  const hedgeQuote = verbatimQuote(text, judgment.hedge_quote);
  const hedgeReason = hedgeQuote && isHedgeReason(judgment.hedge_reason) ? judgment.hedge_reason : null;
  if (judgment.hedge_quote && !hedgeQuote) {
    console.warn(`extract: discarded a hedge quote not found in the answer, capture ${capture.id}`);
  }

  // The span is held to the same standard as the quote, one level in: it must be part of
  // the sentence we are about to print, or it is dropped and the sentence prints unmarked.
  // A mark placed over words the surface did not write in that order would be a quieter
  // version of the misquote the whole guard exists to prevent.
  const hedgeSpan = hedgeQuote ? verbatimSpan(hedgeQuote, judgment.hedge_span) : null;
  if (hedgeQuote && judgment.hedge_span && !hedgeSpan) {
    console.warn(`extract: discarded a hedge span not found in its quote, capture ${capture.id}`);
  }

  const brandsNamed = dedupeBrands([
    ...(targetMentioned ? [scope.brand_name] : []),
    ...competitorsNamed,
    ...(judgment.other_brands ?? []),
  ]);

  return {
    captureId: capture.id,
    targetMentioned,
    targetRecommended,
    targetPosition: targetRecommended ? (judgment.target_position ?? null) : null,
    topRecommendation: judgment.top_recommendation?.trim() || null,
    brandsNamed,
    domainsCited,
    extractorModel,
    hedgeQuote: hedgeReason ? hedgeQuote : null,
    hedgeReason,
    hedgeSpan: hedgeReason ? hedgeSpan : null,
  };
}

function dedupeBrands(names: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const key = brandKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

export async function writeExtraction(r: ExtractionResult): Promise<void> {
  const { error } = await db()
    .from('captures')
    .update({
      target_mentioned: r.targetMentioned,
      target_recommended: r.targetRecommended,
      target_position: r.targetPosition,
      top_recommendation: r.topRecommendation,
      brands_named: r.brandsNamed,
      domains_cited: r.domainsCited,
      hedge_quote: r.hedgeQuote,
      hedge_reason: r.hedgeReason,
      hedge_span: r.hedgeSpan,
      extracted_at: new Date().toISOString(),
      extraction_version: EXTRACTION_VERSION,
      extractor_model: r.extractorModel,
    })
    .eq('id', r.captureId);
  if (error) throw new Error(`Could not store extraction for ${r.captureId}: ${error.message}`);
}
