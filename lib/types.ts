export type EngineId = 'chatgpt' | 'perplexity';

export const ENGINE_LABEL: Record<EngineId, string> = {
  chatgpt: 'ChatGPT',
  perplexity: 'Perplexity',
};

/** Step 2 output. Any field can come back null on a thin site. */
export interface Profile {
  brand_name: string | null;
  what_they_sell: string | null;
  buyer: string | null;
  /** The engines' search locale. NOT the question's geography - see lib/prompts.ts. */
  country: string | null;
  /** Quoted from the page, or null. Added 1 Sep 2026 by the grounding brief. */
  location: string | null;
  category_term: string | null;
}

/** A confirmed profile. brand_name and category_term are guaranteed by step 3. */
export interface ConfirmedProfile {
  brand_name: string;
  what_they_sell: string;
  /**
   * NOW NULLABLE, and that is the point. It used to be defaulted to "buyers in this category",
   * which is a phrase that looks like a fact and tells the generator nothing. §4: a run with no
   * buyer does not proceed to a question, it goes to the confirm card.
   */
  buyer: string | null;
  /** NOW NULLABLE. It used to default to 'Australia'. See lib/profile.ts. */
  country: string | null;
  /** Quoted from the page, typed by the visitor, or null. Never defaulted. */
  location: string | null;
  category_term: string;
}

export interface Citation {
  url: string;
  title: string | null;
  domain: string;
}

export interface Score {
  target_mentioned: boolean;
  target_recommended: boolean;
  target_position: number | null;
  brands_named: string[];
  top_recommendation: string | null;
  domains_cited: string[];
}

/**
 * Tokens as the provider counted them, not as we inferred them.
 *
 * cached matters: on gpt-5.5 a cached input token is a tenth the price of an uncached one, and
 * a search-backed answer is mostly input.
 */
export interface CaptureUsage {
  input: number | null;
  output: number | null;
  cached: number | null;
  total: number | null;
}

/** One engine's answer, scored. */
export interface Capture {
  engine: EngineId;
  /** The model that actually produced the answer, as reported by the API. */
  model: string;
  answer: string;
  citations: Citation[];
  score: Score;
  /** Cited domains: engine citation data unioned with what the scorer read out of the text. */
  domains: string[];
  ms: number;
  /**
   * What the capture cost, and whether that is the provider's figure or our arithmetic.
   *
   * Perplexity invoices in the response, so its number is `reported`. OpenAI returns tokens
   * only, so its number is `computed` through lib/cost.ts - the same table and the same
   * distinction the paid pipeline records on every capture.
   */
  cost_usd: number | null;
  cost_source: 'reported' | 'computed' | null;
  /**
   * The token split, from 27 Aug 2026.
   *
   * Captures written before that date carry a plain `tokens` total instead, and nothing
   * back-fills them: input and output differ by six times on gpt-5.5, so a total alone cannot
   * be priced without assuming a ratio, and assuming one is what made the first cost figure an
   * estimate rather than a measurement.
   */
  usage: CaptureUsage | null;
}

/**
 * The spec's three variants, plus `no_brands` for the case where neither engine
 * named anybody. See the note in verdict.ts: the alternative is telling someone
 * that zero companies were named and they weren't one of them.
 */
export type VerdictKind = 'absent' | 'named_not_recommended' | 'recommended' | 'no_brands';

/** The free, ungated portion. Deliberately excludes verbatim answers. */
export interface FreeResult {
  kind: VerdictKind;
  headline: string;
  lines: string[];
  competitor_count: number;
  /**
   * WHICH ENGINES ACTUALLY ANSWERED, not how many were attempted.
   *
   * Added 5 Sep 2026. The pair is hardcoded at app/api/scan/route.ts:251 - chatgpt and
   * perplexity - but :255 filters out any that failed, so a run can produce one capture. Every
   * sentence and every rendered cell that asserts a count has to come from THIS, because the
   * number the visitor is told and the number that ran were previously unrelated.
   *
   * The identities, not a count, because the coverage grid lights cells by engine and a count
   * cannot say which. A count is what it had before, and a grid drawn from one would have been
   * lighting the wrong squares confidently.
   */
  engines: EngineId[];
  /**
   * DERIVED, and kept only for results stored before `engines` existed.
   *
   * buildVerdict sets this to engines.length, so the two cannot disagree on anything written
   * from now on. It survives because /api/detect serves the stored FreeResult JSON for 24 hours
   * (findCachedScan, lib/db.ts) and rows written before this change have the count and not the
   * list. The permalink does not need it - app/scan/[scanId] rebuilds the verdict from captures.
   *
   * Once no pre-5-Sep row can still be served, this field and engineCount()'s fallback go.
   */
  engines_run: number;
  engines_naming_you: number;
  top_recommendation: string | null;
  /** Engine that recommended the target first, for the 'recommended' variant. */
  winning_engine: EngineId | null;
}

/** Everything behind the email gate. */
export interface GatedResult {
  captures: Array<{
    engine: EngineId;
    engine_label: string;
    model: string;
    answer: string;
    citations: Citation[];
    mentioned: boolean;
    recommended: boolean;
    position: number | null;
  }>;
  brands_named: string[];
  domains_cited: Array<{ domain: string; count: number }>;
  beaten_by: string | null;
}

/**
 * Why the visitor is being asked to fill the form in themselves. null means they
 * are not: we read the site and the profile came back whole.
 *
 *   unreachable  the site would not give us a page
 *   thin         we read it and there was nothing usable on it
 *   unclear      we read it and the model could not name the brand or category
 *   detect_failed the detect call itself failed
 */
export type ManualReason = 'unreachable' | 'thin' | 'unclear' | 'detect_failed' | null;

export type ScanEvent =
  | { type: 'stage'; stage: string; label: string }
  | { type: 'site_fetched'; urls: string[]; chars: number }
  /**
   * `question` is written in the detect stream from 1 Sep 2026, so the confirm card can sit at
   * the seam the brief specifies. Null when the profile was too thin to write one - which is not
   * an error, it is what the card is for.
   */
  | {
      type: 'detected';
      profile: Profile;
      question: string | null;
      /**
       * Did that question pass the buyer-question guard, or is it the best of four failed draws?
       *
       * Both used to arrive here as a plain string. The card showed them identically, so a
       * question the guard had rejected sat on screen with the same authority as one it passed.
       * False means: show it, and say we are not sure about it. Null when no question was
       * written at all.
       */
      question_verified: boolean | null;
      needs_manual: boolean;
      manual_reason: ManualReason;
    }
  | { type: 'question'; question: string }
  | { type: 'engine_started'; engine: EngineId; label: string }
  | { type: 'engine_done'; engine: EngineId; label: string; ms: number; model: string; citations: number }
  | { type: 'engine_failed'; engine: EngineId; label: string; message: string }
  | { type: 'scoring' }
  | { type: 'result'; scanId: string; question: string; free: FreeResult; cached: boolean; run_at: string }
  | { type: 'error'; message: string };
