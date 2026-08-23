/**
 * One shape for an AI Overview, whichever provider fetched it.
 *
 * The bake-off exists because these two providers do not agree, so the interface has
 * to be able to express disagreement rather than smoothing it: `present` is a fact
 * about Google, `raw` is what the provider actually said, and `notes` carries the
 * provider-specific tells that decide the comparison.
 */

import 'server-only';
import type { Citation } from '../types';

export type SerpProviderName = 'serpapi' | 'dataforseo';

export interface AiOverviewResult {
  /**
   * Did Google show an AI Overview for this query.
   *
   * false is a RESULT, not an error. AI Overviews do not fire on every query, and
   * "Google showed nothing" is a real observation that belongs in the evidence with
   * provenance against it. It becomes captures.outcome = 'no_answer', which is
   * excluded from the score denominator and reported in the method note.
   * Recording it as an empty answer instead would make Google's trigger rate look
   * like the subscriber's market position.
   */
  present: boolean;
  text: string | null;
  citations: Citation[];
  raw: unknown;
  costUsd: number | null;
  costSource: 'reported' | 'computed' | null;
  provider: SerpProviderName;
  /** How many requests this cost, which is the unit SerpApi bills in. */
  requests: number;
  /**
   * Provider tells worth comparing rather than hiding:
   *   serpapi     usedPageToken - whether the overview needed a second billed fetch
   *   dataforseo  asynchronous  - whether it was live or served from cache
   */
  notes: Record<string, unknown>;
}

export interface SerpProvider {
  name: SerpProviderName;
  fetchAiOverview(input: { query: string; country: string }): Promise<AiOverviewResult>;
}
