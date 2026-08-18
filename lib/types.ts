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
  country: string | null;
  category_term: string | null;
}

/** A confirmed profile. brand_name and category_term are guaranteed by step 3. */
export interface ConfirmedProfile {
  brand_name: string;
  what_they_sell: string;
  buyer: string;
  country: string;
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
  /** Perplexity reports a cost; OpenAI reports only tokens. Both are kept. */
  cost_usd: number | null;
  tokens: number | null;
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
  | { type: 'detected'; profile: Profile; needs_manual: boolean; manual_reason: ManualReason }
  | { type: 'question'; question: string }
  | { type: 'engine_started'; engine: EngineId; label: string }
  | { type: 'engine_done'; engine: EngineId; label: string; ms: number; model: string; citations: number }
  | { type: 'engine_failed'; engine: EngineId; label: string; message: string }
  | { type: 'scoring' }
  | { type: 'result'; scanId: string; question: string; free: FreeResult; cached: boolean; run_at: string }
  | { type: 'error'; message: string };
