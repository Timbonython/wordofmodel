/**
 * What a capture cost, and whether that figure is a fact or our arithmetic.
 *
 * Two of the five surfaces invoice us in the response and three do not, so this
 * module has two halves and captures.cost_source records which one produced the
 * number. A cost audit has to be able to tell somebody's invoice from our estimate,
 * and a price table is a thing that goes silently stale the day a vendor changes a
 * rate.
 *
 * MEASURED PER-RUN COST, 20 Aug 2026, five questions per surface:
 *
 *   chatgpt     ~1.75   61,855 tokens/capture average across real scans, peaking at
 *                       98,612. The dominant cost by a distance.
 *   grok        ~0.95   xAI chose to run ELEVEN web searches for one question.
 *   gemini      ~0.18   grounding is free under 5,000 prompts a month.
 *   perplexity  ~0.03   provider reported.
 *   google_aio  ~0.03   once a provider is committed.
 *                -----
 *               ~2.94   against a USD 5.00 ceiling and USD 149 revenue. Two percent
 *                       COGS, which is close to the build plan's estimate of three -
 *                       though the plan had Grok at USD 0.03 a month rather than 0.95,
 *                       so the total was right and the distribution was not.
 */

import 'server-only';

/** 1 xAI tick = 1e-10 USD. Verified to the cent against the published rate card. */
const XAI_TICK_USD = 1e-10;

export function usdFromXaiTicks(ticks: unknown): number | null {
  return typeof ticks === 'number' && Number.isFinite(ticks) ? ticks * XAI_TICK_USD : null;
}

/**
 * Per million tokens, USD. Verified 20 Aug 2026 against vendor pricing pages.
 *
 * Keyed by the model we PIN, not by the dated id the provider answers with:
 * gpt-5.5 is pinned and gpt-5.5-2026-04-23 answers, and they are the same price.
 * resolvePrice walks back from the returned id to the pinned family.
 *
 * cachedIn matters more than it looks. A search-backed answer is mostly input, and
 * on gpt-5.5 the cached rate is a tenth of the standard one.
 *
 * NOT IN HERE, and deliberately: any per-call tool fee OpenAI charges for web_search.
 * Our three real scans reported tokens and no cost, and the search results appear to
 * arrive as input tokens rather than a separate line. If OpenAI bills a per-call fee
 * as well, the chatgpt figure is an underestimate - which is why it is marked
 * 'computed' rather than dressed up as authoritative.
 */
const PRICES: Record<string, { in: number; cachedIn: number; out: number }> = {
  'gpt-5.5': { in: 5.0, cachedIn: 0.5, out: 30.0 },
  'gpt-5.4-mini': { in: 0.25, cachedIn: 0.025, out: 2.0 },
  'gemini-3.5-flash': { in: 1.5, cachedIn: 0.15, out: 9.0 },
};

function resolvePrice(model: string): { in: number; cachedIn: number; out: number } | null {
  const exact = PRICES[model];
  if (exact) return exact;
  // gpt-5.5-2026-04-23 resolves to gpt-5.5. Longest match wins, so gpt-5.5 is never
  // served by a gpt-5 entry.
  const keys = Object.keys(PRICES).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (model.startsWith(k) && /^[-@:.]/.test(model.slice(k.length))) return PRICES[k] ?? null;
  }
  return null;
}

export interface CostResult {
  usd: number | null;
  source: 'reported' | 'computed' | null;
}

/** A provider that invoices us in the response. Always preferred over the table. */
export function reportedCost(usd: number | null | undefined): CostResult {
  return typeof usd === 'number' && Number.isFinite(usd)
    ? { usd, source: 'reported' }
    : { usd: null, source: null };
}

/**
 * Our arithmetic, for the providers that report tokens only.
 *
 * An unknown model returns null rather than a guess. A missing cost is honest and
 * visible in an audit; an invented one is a number that looks like measurement and
 * is not, which is the failure mode this whole build keeps designing against.
 */
export function computedCost(
  model: string,
  tokens: { in: number | null; out: number | null; cachedIn?: number | null },
): CostResult {
  const p = resolvePrice(model);
  if (!p) {
    console.warn(
      `No price entry for "${model}". Cost recorded as null rather than estimated. ` +
        `Add it to PRICES in lib/cost.ts.`,
    );
    return { usd: null, source: null };
  }

  const cached = tokens.cachedIn ?? 0;
  const uncached = Math.max(0, (tokens.in ?? 0) - cached);
  const out = tokens.out ?? 0;

  const usd = (uncached * p.in + cached * p.cachedIn + out * p.out) / 1_000_000;
  return { usd: Number(usd.toFixed(6)), source: 'computed' };
}

/**
 * Latency ceilings, per surface, from real measurements rather than a guess.
 *
 * ChatGPT averaged 83 SECONDS across real scans and peaked at 120. The session brief
 * assumed "up to sixty seconds each", which is half the truth - and it is the
 * strongest single argument for one capture per invocation: twenty five of these
 * serially is over half an hour, which no serverless platform will hold open.
 *
 * Generous, because a timeout is a retryable failure that costs a whole capture and
 * pays for the tokens anyway. The tick route's maxDuration sits above all of these.
 */
export const TIMEOUT_MS: Record<string, number> = {
  chatgpt: 240_000,
  grok: 240_000,
  gemini: 120_000,
  perplexity: 120_000,
  google_aio: 60_000,
};
