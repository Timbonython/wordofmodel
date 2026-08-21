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
export const EXTRACTION_VERSION = 2;

/**
 * v2, 21 Aug 2026. The judgment call now also returns the sentence in which the answer said
 * WHY it stopped short of recommending the target, and a closed-set reason for it. Same
 * call, same temperature, two more fields - nothing about how mentions or recommendations
 * are decided changed.
 *
 * The bump is still correct: the prompt changed, and a prompt change can move any output.
 * Every capture in the database was re-read at v2 when this shipped, so no trend line
 * currently spans the two versions. The first run that mixes them is the one to watch -
 * delta.ts checks how a surface was measured but does not yet check which version read it.
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
  ],
  properties: {
    target_recommended: { type: 'boolean' },
    target_position: { type: ['integer', 'null'] },
    top_recommendation: { type: ['string', 'null'] },
    other_brands: { type: 'array', items: { type: 'string' } },
    hedge_quote: { type: ['string', 'null'] },
    hedge_reason: { type: ['string', 'null'], enum: [...HEDGE_REASONS, null] },
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
written, character for character. Do not paraphrase, do not summarise, do not join two
sentences, do not fix its punctuation. If the answer states no such reason, or you would
have to write the sentence yourself, return null. Returning null is correct far more often
than guessing, and a sentence that is not in the answer word for word will be thrown away.

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
      extracted_at: new Date().toISOString(),
      extraction_version: EXTRACTION_VERSION,
      extractor_model: r.extractorModel,
    })
    .eq('id', r.captureId);
  if (error) throw new Error(`Could not store extraction for ${r.captureId}: ${error.message}`);
}
