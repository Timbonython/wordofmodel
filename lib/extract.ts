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
import type { Citation } from './types';

/**
 * Bump when the prompt, the schema or the matching rules change.
 *
 * A trend line built from version 1 rows and version 2 rows has a step in it that is ours,
 * not the market's - the fourth thing that can move a number without the market moving,
 * after the competitor set, the surface set and the sampling depth. Session 4 must compare
 * like with like or say what changed.
 */
export const EXTRACTION_VERSION = 1;

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
}

const JUDGMENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['target_recommended', 'target_position', 'top_recommendation', 'other_brands'],
  properties: {
    target_recommended: { type: 'boolean' },
    target_position: { type: ['integer', 'null'] },
    top_recommendation: { type: ['string', 'null'] },
    other_brands: { type: 'array', items: { type: 'string' } },
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
      extracted_at: new Date().toISOString(),
      extraction_version: EXTRACTION_VERSION,
      extractor_model: r.extractorModel,
    })
    .eq('id', r.captureId);
  if (error) throw new Error(`Could not store extraction for ${r.captureId}: ${error.message}`);
}
