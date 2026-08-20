/**
 * The Grok capture. xAI Responses API with the web_search tool.
 *
 * TWO THINGS THE SPEC GOT WRONG, both found by calling it:
 *
 * 1. "Grok - xAI API, live search enabled" names a retired API. The search_parameters
 *    Live Search API was withdrawn on 12 Jan 2026; the replacement is a web_search
 *    entry in `tools` on /v1/responses.
 * 2. The old Live Search accepted a per-source country. The replacement does not
 *    accept a location of any kind, so Grok is location-neutral and the network
 *    origin is the only geography it has. That is a method note, not a defect.
 *
 * Cost: xAI invoices us in the response, so no price table is involved. It is also
 * the surface most likely to surprise on spend - it chose to run ELEVEN web searches
 * for a single question, against a build plan that budgeted USD 0.03 a month for the
 * whole surface. It is not capped, deliberately: capping tool calls produces an answer
 * Grok would not have given, which is the same substitution this product refuses
 * everywhere else. search_calls is recorded on every capture instead, so the spend is
 * visible rather than merely large.
 */

import 'server-only';
import { env, MODELS } from '../env';
import { assertModelFamily } from '../provenance';
import { reportedCost, usdFromXaiTicks, TIMEOUT_MS } from '../cost';
import { grokGeo } from '../geo';
import { postJson } from './http';
import { walkResponses, type ResponsesEnvelope } from './responses-envelope';
import type { CaptureResult, Engine, EngineInput } from './types';

const ENDPOINT = 'https://api.x.ai/v1/responses';
const LABEL = 'Grok';

export const grokEngine: Engine = {
  surface: 'grok',
  captureMethod: 'api',
  pinnedModel: MODELS.grok,

  async run({ question, country }: EngineInput): Promise<CaptureResult> {
    // Called for the record, not for the request: it returns supported: false with the
    // reason, which is what the method note prints. No geo parameter is sent because
    // none exists.
    const geo = grokGeo(country);
    const started = Date.now();

    const j = await postJson<ResponsesEnvelope>(
      ENDPOINT,
      {
        headers: { Authorization: `Bearer ${env.xaiKey}` },
        body: {
          model: MODELS.grok,
          input: question,
          tools: [{ type: 'web_search' }],
        },
      },
      TIMEOUT_MS.grok ?? 240_000,
      LABEL,
    );

    const latencyMs = Date.now() - started;
    const w = walkResponses(j, LABEL);
    const modelUsed = assertModelFamily(LABEL, MODELS.grok, j.model);

    // xAI's own number, in ticks of 1e-10 USD. Verified to the cent against the
    // published rate card: 1,898,420,000 ticks == USD 0.189842 for a call whose token
    // and search counts price out at exactly that.
    const cost = reportedCost(usdFromXaiTicks(j.usage?.cost_in_usd_ticks));

    // Prefer xAI's own count over walking the output array. Both were present and
    // agreed at eleven, but the usage block is the provider's statement of what it
    // billed us for.
    const searchCalls = j.usage?.server_side_tool_usage_details?.web_search_calls ?? w.searchCalls;

    return {
      outcome: w.refusal ? 'refused' : 'answered',
      answerText: w.refusal ? null : w.text,
      modelUsed,
      provider: null,
      grounded: searchCalls > 0,
      searchCalls,
      citations: w.citations,
      raw: j,
      tokensIn: w.tokensIn,
      tokensOut: w.tokensOut,
      tokensTotal: w.tokensTotal,
      costUsd: cost.usd,
      costSource: cost.source,
      geoSent: geo,
      latencyMs,
    };
  },
};
