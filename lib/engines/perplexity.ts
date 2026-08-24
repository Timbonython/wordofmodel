/**
 * The Perplexity capture. Agent API, pinned to Sonar.
 *
 * THE CHECK THAT DID NOT EXIST. lib/env.ts has refused to SEND a non-Sonar model
 * since the free scan was built, and the free scan's askPerplexity then returns
 * `j.model || model` and succeeds whatever comes back. The Agent API is model
 * agnostic and fronts OpenAI, Anthropic, Google and xAI, so the half that actually
 * protects the methodology is the response check - and it was the half that was
 * missing. assertSonarResponse is that check, and a mismatch is a permanent failure:
 * retrying cannot turn somebody else's model into a Perplexity answer.
 *
 * The web_search tool is mandatory, not optional. Without it the request still
 * succeeds and Sonar answers from memory with zero sources, which is the same failure
 * gemini-3.6-flash exhibits and is not a measurement of what a buyer sees today.
 *
 * Perplexity invoices us in the response, so no price table is involved. Measured at
 * roughly USD 0.0066 a capture across real scans - the cheapest surface by an order of
 * magnitude.
 */

import 'server-only';
import { env, MODELS } from '../env';
import { assertSonar } from '../env';
import { assertSonarResponse, CaptureError } from '../provenance';
import { reportedCost, TIMEOUT_MS } from '../cost';
import { perplexityGeo } from '../geo';
import { postJson } from './http';
import { domainOf } from '../domain';
import type { Citation } from '../types';
import type { CaptureResult, Engine, EngineInput } from './types';

const ENDPOINT = 'https://api.perplexity.ai/v1/agent';
const LABEL = 'Perplexity';

interface AgentEnvelope {
  model?: string;
  output?: Array<{
    type: string;
    content?: Array<{ type: string; text?: string; refusal?: string }>;
    results?: Array<{ url?: string; title?: string }>;
    queries?: string[];
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    cost?: { total_cost?: number };
  };
}

export const perplexityEngine: Engine = {
  surface: 'perplexity',
  captureMethod: 'api',
  pinnedModel: MODELS.sonar,

  async run({ question, country, locality }: EngineInput): Promise<CaptureResult> {
    // Refuses at the request, as it always has.
    const model = assertSonar(MODELS.sonar);
    const geo = perplexityGeo(country, locality);
    const started = Date.now();

    const j = await postJson<AgentEnvelope>(
      ENDPOINT,
      {
        headers: { Authorization: `Bearer ${env.perplexityKey}` },
        body: {
          model,
          input: question,
          tools: [{ type: 'web_search', user_location: geo.params }],
        },
      },
      TIMEOUT_MS.perplexity ?? 120_000,
      LABEL,
    );

    const latencyMs = Date.now() - started;

    // And now refuses at the response, which is the check that matters.
    const modelUsed = assertSonarResponse(j.model);

    const message = (j.output || []).find((o) => o.type === 'message');
    const parts = message?.content || [];
    const text = parts.find((c) => c.type === 'output_text')?.text?.trim() || '';
    const refusal = parts.find((c) => c.type === 'refusal')?.refusal?.trim() || null;

    if (!text && !refusal) {
      throw new CaptureError(`${LABEL} returned an empty answer`, 'retryable');
    }

    // Citations arrive as a separate search_results item inside output, not as
    // annotations on the message. Verified 17 Aug 2026 and unchanged.
    const searchItem = (j.output || []).find((o) => o.type === 'search_results');
    const citations: Citation[] = [];
    const seen = new Set<string>();
    for (const res of searchItem?.results || []) {
      if (!res.url || seen.has(res.url)) continue;
      const domain = domainOf(res.url);
      if (!domain) continue;
      seen.add(res.url);
      citations.push({ url: res.url, title: res.title || null, domain });
    }

    const queries = searchItem?.queries || [];
    const cost = reportedCost(j.usage?.cost?.total_cost);

    return {
      outcome: refusal ? 'refused' : 'answered',
      answerText: refusal ? null : text,
      modelUsed,
      provider: null,
      // Sonar answering with zero sources is the memory answer the spec warns about.
      grounded: citations.length > 0 || queries.length > 0,
      searchCalls: queries.length,
      citations,
      raw: j,
      tokensIn: j.usage?.input_tokens ?? null,
      tokensOut: j.usage?.output_tokens ?? null,
      tokensTotal: j.usage?.total_tokens ?? null,
      costUsd: cost.usd,
      costSource: cost.source,
      geoSent: geo,
      latencyMs,
    };
  },
};
