/**
 * The Gemini capture. generateContent with the google_search grounding tool.
 *
 * THREE THINGS HERE WERE FOUND BY CALLING IT, AND ALL THREE WOULD HAVE BEEN SILENT.
 *
 * 1. THE CITATION URLS ARE GOOGLE'S, NOT THE SOURCE'S. Every groundingChunk.web.uri
 *    is a vertexaisearch.cloud.google.com/grounding-api-redirect/... link. Running
 *    domainOf() over them - which is what every other surface does - would record
 *    Google as the source of one hundred percent of Gemini's citations, and "most
 *    cited domains, so the subscriber can see who owns the answer" is section five of
 *    the report. The real domain is in web.title, which holds a bare hostname like
 *    "techradar.com" rather than a page title.
 *
 * 2. GROUNDING IS NOT GUARANTEED BY A 200. gemini-3.6-flash returns a fluent answer
 *    with no groundingMetadata at all: it ignores the tool and recites training data.
 *    promptTokenCount gives it away - 7 tokens against 772 when search results are
 *    actually present. We pin 3.5-flash, which grounds reliably, AND check every
 *    capture anyway, because a model's choice is not a contract.
 *
 * 3. THINKING TOKENS ARE BILLED AND ARE NOT IN candidatesTokenCount.
 *    promptTokenCount 788 + candidatesTokenCount 1804 + thoughtsTokenCount 1778 =
 *    totalTokenCount 4370. Costing output as candidates alone understates Gemini by
 *    roughly half.
 *
 * Gemini accepts no location parameter of any kind, so like Grok it is located only by
 * the network origin.
 */

import 'server-only';
import { env, MODELS } from '../env';
import { assertModelFamily, groundingOf, CaptureError } from '../provenance';
import { computedCost, TIMEOUT_MS } from '../cost';
import { geminiGeo } from '../geo';
import { postJson } from './http';
import { normaliseDomain } from '../domain';
import type { Citation } from '../types';
import type { CaptureResult, Engine, EngineInput } from './types';

const LABEL = 'Gemini';

interface GeminiEnvelope {
  modelVersion?: string;
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
    groundingMetadata?: {
      groundingChunks?: Array<{ web?: { uri?: string; title?: string; domain?: string } }>;
      webSearchQueries?: string[];
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    cachedContentTokenCount?: number;
    totalTokenCount?: number;
  };
}

/** Anything that is not the model finishing its sentence. */
const REFUSAL_REASONS = new Set(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION']);

export const geminiEngine: Engine = {
  surface: 'gemini',
  captureMethod: 'api',
  pinnedModel: MODELS.gemini,

  async run({ question, country }: EngineInput): Promise<CaptureResult> {
    const geo = geminiGeo(country);
    const started = Date.now();

    const j = await postJson<GeminiEnvelope>(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODELS.gemini}:generateContent`,
      {
        headers: { 'x-goog-api-key': env.googleKey },
        body: {
          contents: [{ parts: [{ text: question }] }],
          tools: [{ google_search: {} }],
        },
      },
      TIMEOUT_MS.gemini ?? 120_000,
      LABEL,
    );

    const latencyMs = Date.now() - started;
    const modelUsed = assertModelFamily(LABEL, MODELS.gemini, j.modelVersion);

    const candidate = j.candidates?.[0];
    const finish = candidate?.finishReason;
    const text = (candidate?.content?.parts || [])
      .map((p) => p.text || '')
      .join('')
      .trim();

    if (!text && !REFUSAL_REASONS.has(finish || '')) {
      throw new CaptureError(
        `${LABEL} returned an empty answer (finishReason ${finish ?? 'none'})`,
        'retryable',
      );
    }

    const gm = candidate?.groundingMetadata;
    const grounded = groundingOf(gm?.groundingChunks, gm?.webSearchQueries);

    const citations: Citation[] = [];
    const seen = new Set<string>();
    for (const chunk of gm?.groundingChunks || []) {
      const web = chunk.web;
      if (!web?.uri) continue;
      // web.domain when Google provides it, else web.title, which is a bare hostname
      // for search grounding. NEVER domainOf(web.uri) - see the note at the top.
      const domain = normaliseDomain(web.domain || web.title || '');
      if (!domain || seen.has(web.uri)) continue;
      seen.add(web.uri);
      // The uri is kept as returned even though it is a redirect: it is the evidence
      // link Google actually gave us, and rewriting it would be inventing a source.
      citations.push({ url: web.uri, title: web.title || null, domain });
    }

    const u = j.usageMetadata || {};
    const tokensIn = u.promptTokenCount ?? null;
    const tokensOut =
      u.candidatesTokenCount === undefined && u.thoughtsTokenCount === undefined
        ? null
        : (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0);

    const cost = computedCost(modelUsed, {
      in: tokensIn,
      out: tokensOut,
      cachedIn: u.cachedContentTokenCount ?? null,
    });

    return {
      outcome: REFUSAL_REASONS.has(finish || '') ? 'refused' : 'answered',
      answerText: REFUSAL_REASONS.has(finish || '') ? null : text,
      modelUsed,
      provider: null,
      grounded,
      searchCalls: gm?.webSearchQueries?.length ?? 0,
      citations,
      raw: j,
      tokensIn,
      tokensOut,
      tokensTotal: u.totalTokenCount ?? null,
      costUsd: cost.usd,
      costSource: cost.source,
      geoSent: geo,
      latencyMs,
    };
  },
};
