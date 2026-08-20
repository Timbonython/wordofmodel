/**
 * The ChatGPT capture. OpenAI Responses API, web search on, located in the
 * subscriber's market.
 *
 * The most expensive surface in the run by a distance: three real scans averaged
 * 61,855 tokens per capture and peaked at 98,612, which is roughly USD 0.35 a call and
 * about 60% of the whole run. It is also the slowest - 83 seconds average, 120 at
 * worst - which is the measurement that decided one capture per invocation.
 */

import 'server-only';
import { env, MODELS } from '../env';
import { assertModelFamily } from '../provenance';
import { computedCost, TIMEOUT_MS } from '../cost';
import { chatgptGeo } from '../geo';
import { postJson } from './http';
import { walkResponses, type ResponsesEnvelope } from './responses-envelope';
import type { CaptureResult, Engine, EngineInput } from './types';

const ENDPOINT = 'https://api.openai.com/v1/responses';
const LABEL = 'ChatGPT';

export const chatgptEngine: Engine = {
  surface: 'chatgpt',
  captureMethod: 'api',
  pinnedModel: MODELS.answer,

  async run({ question, country }: EngineInput): Promise<CaptureResult> {
    const geo = chatgptGeo(country);
    const started = Date.now();

    const j = await postJson<ResponsesEnvelope>(
      ENDPOINT,
      {
        headers: { Authorization: `Bearer ${env.openaiKey}` },
        body: {
          model: MODELS.answer,
          input: question,
          tools: [{ type: 'web_search', user_location: geo.params }],
        },
      },
      TIMEOUT_MS.chatgpt ?? 240_000,
      LABEL,
    );

    const latencyMs = Date.now() - started;
    const w = walkResponses(j, LABEL);

    // From the response, never from the request. We pin gpt-5.5 and the API answers
    // as gpt-5.5-2026-04-23, which is the same model dated - hence a family match
    // rather than equality. A different model entirely is a failed capture.
    const modelUsed = assertModelFamily(LABEL, MODELS.answer, j.model);

    // OpenAI reports tokens only, so this figure is our arithmetic and is marked as
    // such. If OpenAI also bills per web_search call, it is an underestimate.
    const cost = computedCost(modelUsed, {
      in: w.tokensIn,
      out: w.tokensOut,
      cachedIn: w.cachedIn,
    });

    return {
      outcome: w.refusal ? 'refused' : 'answered',
      answerText: w.refusal ? null : w.text,
      modelUsed,
      provider: null,
      grounded: w.searchCalls > 0,
      searchCalls: w.searchCalls,
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
