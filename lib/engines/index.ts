/**
 * The engine registry, and the one place that decides which surfaces a run covers.
 *
 * MONTHLY_SURFACES in lib/scope.ts is the locked set as a matter of methodology - the
 * five frozen on 10 Aug 2026. This is the set we can actually capture right now,
 * which is a different question while the SERP bake-off is undecided.
 *
 * With SERP_PROVIDER unset, google_aio is not in the set: a run is five questions
 * across four surfaces and captures_expected is 20. That is a COMPLETE run, not a
 * broken one. A surface we have not committed to is a surface we do not claim to
 * measure, and a hardcoded 25 would mark every run partial and ship nothing.
 *
 * Committing the provider later moves every subscriber's Share of Model denominator on
 * the same day. runs.surfaces records the set each run actually used so the delta
 * reports that as a configuration change rather than as the market moving - the same
 * rule 0002 writes for competitors, one level up.
 */

import 'server-only';
import { env } from '../env';
import type { Surface } from '../scope';
import type { Engine } from './types';
import { chatgptEngine } from './chatgpt';
import { geminiEngine } from './gemini';
import { grokEngine } from './grok';
import { perplexityEngine } from './perplexity';
import { googleAioEngine } from './google-aio';

/** Report order, not run order: the runner claims whatever is next in the queue. */
const API_ENGINES: Engine[] = [chatgptEngine, geminiEngine, grokEngine, perplexityEngine];

const REGISTRY = new Map<Surface, Engine>([
  ...API_ENGINES.map((e) => [e.surface, e] as const),
  ['google_aio', googleAioEngine] as const,
]);

export function engineFor(surface: Surface): Engine {
  const e = REGISTRY.get(surface);
  if (!e) throw new Error(`No engine registered for surface "${surface}".`);
  return e;
}

/**
 * The surfaces this deployment can capture monthly, right now.
 *
 * Written onto runs.surfaces at enqueue and used to compute captures_expected. Never
 * derive either from a constant: the point is that the set is a recorded fact about
 * the run, not a number somebody typed.
 */
export function runnableMonthlySurfaces(): Surface[] {
  const surfaces: Surface[] = API_ENGINES.map((e) => e.surface);
  if (env.serpProvider) surfaces.push('google_aio');
  return surfaces;
}

/**
 * How many times each surface is asked the same question.
 *
 * Every generative surface rewrites itself between calls - measured word overlap of 0.31
 * to 0.44 across repeats on Perplexity, Gemini and Google AI Overviews alike - so one
 * call is one draw from a wide distribution. Three draws give a rate instead of a coin
 * flip.
 *
 * DEPTH FOLLOWS COST, NOT IMPORTANCE, and the method note says so rather than implying
 * otherwise. Measured per answer: ChatGPT USD 0.35, Grok USD 0.19, Gemini USD 0.03,
 * Perplexity USD 0.006, AI Overviews about USD 0.03 for two billable SerpApi requests.
 * Sampling the top two would add roughly USD 5 a run to buy precision on the surfaces we
 * can least afford to repeat; sampling the bottom three costs cents.
 *
 * Total at this depth: about USD 3.78 a run against a USD 8.00 ceiling.
 *
 * Changing a number here changes a subscriber's error bars and will move their figure on
 * its own. It is written onto runs.samples so the delta reports it as a configuration
 * change rather than as the market moving.
 */
export const SAMPLES: Record<Surface, number> = {
  chatgpt: 1,
  grok: 1,
  gemini: 3,
  perplexity: 3,
  google_aio: 3,
  // Hand-read quarterly surfaces. A human is not asked the same question three times.
  claude: 1,
  copilot: 1,
};

export function samplesFor(surface: Surface): number {
  return SAMPLES[surface];
}

/** The sampling map actually used, for runs.samples. */
export function samplingMap(surfaces: Surface[]): Record<string, number> {
  return Object.fromEntries(surfaces.map((s) => [s, SAMPLES[s]]));
}

/**
 * NOT questionCount * surfaces.length. A surface sampled three times contributes three
 * capture rows, and a run that expects twenty when twenty five will land marks itself
 * partial and holds a report that was actually complete.
 */
export function capturesExpected(questionCount: number, surfaces: Surface[]): number {
  return questionCount * surfaces.reduce((n, s) => n + SAMPLES[s], 0);
}

export type { CaptureResult, Engine, EngineInput } from './types';
