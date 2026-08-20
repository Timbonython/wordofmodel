/**
 * The Google AI Overviews capture.
 *
 * The one surface with no first-party API, and the one that behaves unlike the other
 * four in three ways that all have to be honoured rather than smoothed over:
 *
 * 1. THERE IS NO MODEL. Google does not disclose which model wrote an overview, so
 *    model_used is null and the provider goes in `provider` instead. Writing anything
 *    into model_used here would be inventing provenance, which is the one thing this
 *    product cannot do. The method note says Google does not disclose it.
 *
 * 2. NOT EVERY QUESTION GETS AN ANSWER, and that is normal. AI Overviews fire on a
 *    fraction of queries, lower for the conversational buyer questions this product
 *    asks than for head terms. `no_answer` is a real, stored, provenance-carrying
 *    observation: the surface was asked and showed nothing. It is excluded from the
 *    Share of Model denominator and reported explicitly, because counting it as an
 *    absence would make Google's trigger rate look like the subscriber's market
 *    position, and that rate moves every month for reasons that are not the market.
 *
 * 3. IT DID NOT CHOOSE TO SEARCH. `grounded` and `search_calls` are null: this is a
 *    scrape of a search results page, and there is no sense in which it decided
 *    anything. Recording grounded=true would be a category error.
 */

import 'server-only';
import { committedProvider } from '../serp';
import { CaptureError } from '../provenance';
import { TIMEOUT_MS } from '../cost';
import { geoFor } from '../geo';
import { env } from '../env';
import type { CaptureResult, Engine, EngineInput } from './types';

export const googleAioEngine: Engine = {
  surface: 'google_aio',
  captureMethod: 'serp',
  pinnedModel: null,

  async run({ question, country }: EngineInput): Promise<CaptureResult> {
    const provider = committedProvider();
    if (!provider) {
      throw new CaptureError(
        'SERP_PROVIDER is not set, so google_aio has no committed provider. This surface ' +
          'should not have been enqueued: runnableMonthlySurfaces() excludes it.',
        'permanent',
      );
    }

    const geo = geoFor('google_aio', country, provider.name);
    const started = Date.now();

    const r = await Promise.race([
      provider.fetchAiOverview({ query: question, country }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new CaptureError(`${provider.name} took too long`, 'retryable')),
          TIMEOUT_MS.google_aio ?? 60_000,
        ),
      ),
    ]);

    return {
      outcome: r.present ? 'answered' : 'no_answer',
      answerText: r.text,
      modelUsed: null,
      provider: r.provider,
      grounded: null,
      searchCalls: null,
      citations: r.citations,
      raw: r.raw,
      tokensIn: null,
      tokensOut: null,
      tokensTotal: null,
      costUsd: r.costUsd,
      costSource: r.costSource,
      geoSent: geo,
      latencyMs: Date.now() - started,
    };
  },
};

/** Exposed for the bake-off, which compares providers rather than using the committed one. */
export const serpProviderName = () => env.serpProvider;
