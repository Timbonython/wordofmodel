/**
 * The OpenAI Responses envelope, walked once for the two surfaces that speak it.
 *
 * xAI's /v1/responses mirrors OpenAI's shape deliberately, down to the typed `output`
 * array and the usage block, so ChatGPT and Grok share this walker and differ only in
 * endpoint, geo support and how cost arrives.
 *
 * Deliberately NOT shared with lib/openai.ts. That module serves the free scan, which
 * is live and taking traffic, and it reads a different subset - no token split, no
 * search-call count, no raw payload. Forty lines of duplication is a smaller risk than
 * refactoring the one path in this build that already earns money.
 *
 * Verified against both live APIs on 20 Aug 2026.
 */

import 'server-only';
import { CaptureError } from '../provenance';
import { domainOf } from '../domain';
import type { Citation } from '../types';

export interface ResponsesEnvelope {
  model?: string;
  output?: Array<{
    type: string;
    content?: Array<{
      type: string;
      text?: string;
      refusal?: string;
      annotations?: Array<{ type?: string; url?: string; title?: string }>;
    }>;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
    cost_in_usd_ticks?: number;
    server_side_tool_usage_details?: { web_search_calls?: number };
  };
}

export interface WalkedEnvelope {
  text: string;
  refusal: string | null;
  citations: Citation[];
  searchCalls: number;
  tokensIn: number | null;
  tokensOut: number | null;
  tokensTotal: number | null;
  cachedIn: number | null;
}

export function walkResponses(j: ResponsesEnvelope, surfaceLabel: string): WalkedEnvelope {
  const message = (j.output || []).find((o) => o.type === 'message');
  const parts = message?.content || [];

  const textPart = parts.find((c) => c.type === 'output_text');
  const refusalPart = parts.find((c) => c.type === 'refusal');
  const text = textPart?.text?.trim() || '';
  const refusal = refusalPart?.refusal?.trim() || null;

  if (!text && !refusal) {
    // A 200 with nothing in it is not a refusal and not an answer. It is almost always
    // a transient upstream problem, so it goes back in the queue rather than being
    // recorded as the surface having said nothing.
    throw new CaptureError(`${surfaceLabel} returned an empty answer`, 'retryable');
  }

  const citations: Citation[] = [];
  const seen = new Set<string>();
  for (const a of textPart?.annotations || []) {
    if (!a.url) continue;
    if (a.type && a.type !== 'url_citation') continue;
    let url = a.url;
    try {
      // Search citations arrive tagged with ?utm_source=openai. Strip it, or the same
      // page cited by two surfaces looks like two different sources.
      const u = new URL(url);
      u.searchParams.delete('utm_source');
      url = u.toString();
    } catch {
      /* keep the raw string */
    }
    const domain = domainOf(url);
    if (!domain || seen.has(url)) continue;
    seen.add(url);
    citations.push({ url, title: a.title || null, domain });
  }

  // Both APIs emit one output item per search. xAI also reports the count in usage,
  // and the caller prefers that where it exists; this is the fallback and the only
  // source for OpenAI.
  const searchCalls = (j.output || []).filter((o) => o.type === 'web_search_call').length;

  const u = j.usage || {};
  return {
    text,
    refusal,
    citations,
    searchCalls,
    tokensIn: u.input_tokens ?? null,
    tokensOut: u.output_tokens ?? null,
    tokensTotal: u.total_tokens ?? null,
    cachedIn: u.input_tokens_details?.cached_tokens ?? null,
  };
}
