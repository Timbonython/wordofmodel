/**
 * What every surface hands back, whatever it is underneath.
 *
 * One shape for an OpenAI envelope, a Gemini candidate, an xAI response and a SERP
 * scrape, because the runner must not care which it is claiming. Everything the
 * capture row needs is here and nothing is inferred later from the raw payload: if a
 * fact belongs on the row, the engine states it.
 */

import 'server-only';
import type { Citation } from '../types';
import type { CaptureMethod, Surface } from '../scope';
import type { GeoSent, Locality } from '../geo';

export interface CaptureResult {
  /**
   * answered   the surface answered, and answerText holds it verbatim
   * no_answer  the surface was asked and produced nothing. Real evidence, not an
   *            error: Google AI Overviews do not fire on every query.
   * refused    the surface declined. Also evidence.
   */
  outcome: 'answered' | 'no_answer' | 'refused';
  answerText: string | null;

  /** Read from the response, never from the request we sent. */
  modelUsed: string | null;
  /** Who fetched it, where that differs from the surface. SERP providers only. */
  provider: string | null;
  /** Whether the answer was actually search-backed. null where the notion does not apply. */
  grounded: boolean | null;
  /** How many searches the surface chose to run. The cost driver and a quality signal. */
  searchCalls: number | null;

  citations: Citation[];

  /** The whole provider envelope. Never the request: it carries our credentials. */
  raw: unknown;

  tokensIn: number | null;
  tokensOut: number | null;
  tokensTotal: number | null;
  costUsd: number | null;
  costSource: 'reported' | 'computed' | null;

  geoSent: GeoSent;
  latencyMs: number;
}

export interface EngineInput {
  question: string;
  /** ISO 3166-1 alpha-2, from scopes.market_country. Never inferred from anything else. */
  country: string;
  /**
   * The town or region, resolved at approval and stored on the scope. Optional, and its
   * absence is the ordinary case: most scopes are a country.
   *
   * Every engine takes it and only three can use it. The two that cannot are not a gap to
   * be filled in later - grok and gemini accept no location parameter at all, the question
   * text carries the place for them, and the report says which surface got which.
   */
  locality?: Locality | null;
}

export interface Engine {
  surface: Surface;
  captureMethod: CaptureMethod;
  /** The model we pin. null for surfaces that are not a model. */
  pinnedModel: string | null;
  run(input: EngineInput): Promise<CaptureResult>;
}
