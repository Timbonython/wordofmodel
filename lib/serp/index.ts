import 'server-only';
import { env } from '../env';
import { serpApiProvider } from './serpapi';
import { dataForSeoProvider } from './dataforseo';
import type { SerpProvider, SerpProviderName } from './types';

/**
 * BOTH IMPLEMENTATIONS SHIP. THAT IS HYGIENE, NOT REDUNDANCY.
 *
 * DataForSEO is NOT a fallback for SerpApi and must never be wired up as one. Measured
 * 20 Aug 2026 over 15 calls it failed 6 times - 40%, Internal SE Server Error, across
 * three separate sessions. A provider that fails two in five cannot rescue a run that
 * is already failing; it would convert one surface's outage into a slower version of
 * the same outage while spending money on the way.
 *
 * It stays because a second working implementation is what made the bake-off possible
 * and is what makes re-running it cheap if SerpApi degrades. Switching provider is a
 * decision with evidence behind it, not an automatic failover.
 */
export const PROVIDERS: Record<SerpProviderName, SerpProvider> = {
  serpapi: serpApiProvider,
  dataforseo: dataForSeoProvider,
};

/**
 * The committed provider, or null while the bake-off is undecided.
 *
 * Null is not a failure state. It means google_aio is not in the monthly surface set,
 * a run is four surfaces, and captures_expected is 20 - see lib/engines/index.ts. A
 * surface we have not committed to is one we do not claim to measure.
 */
export function committedProvider(): SerpProvider | null {
  const name = env.serpProvider;
  return name ? PROVIDERS[name] : null;
}

export type { AiOverviewResult, SerpProvider, SerpProviderName } from './types';
