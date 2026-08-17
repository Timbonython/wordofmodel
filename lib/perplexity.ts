import 'server-only';
import { assertSonar, env, MODELS } from './env';
import type { Citation } from './types';
import { domainOf } from './domain';

const ENDPOINT = 'https://api.perplexity.ai/v1/agent';

interface AgentEnvelope {
  model?: string;
  output?: Array<{
    type: string;
    content?: Array<{ type: string; text?: string }>;
    results?: Array<{ url?: string; title?: string; snippet?: string }>;
    queries?: string[];
  }>;
  usage?: { cost?: { total_cost?: number } };
  error?: { message?: string };
}

/**
 * The Perplexity capture.
 *
 * Verified 17 Aug 2026:
 *  - The Agent API takes `input`, not a messages array, and mirrors the OpenAI
 *    Responses envelope: a typed `output` array.
 *  - Citations do NOT arrive as annotations on the message. They come back as a
 *    separate `search_results` item inside `output`.
 *  - Without an explicit web_search tool the request still succeeds, but Sonar
 *    answers from memory with zero sources. That is not a Perplexity answer, so
 *    the tool is mandatory here, not optional.
 */
export async function askPerplexity(
  question: string,
  countryIso2: string | null,
): Promise<{ text: string; citations: Citation[]; model: string; cost: number | null; queries: string[] }> {
  const model = assertSonar(MODELS.sonar);
  const tool: Record<string, unknown> = { type: 'web_search' };
  if (countryIso2) tool.user_location = { type: 'approximate', country: countryIso2 };

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 240_000);
  let j: AgentEnvelope;
  try {
    const r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.perplexityKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: question, tools: [tool] }),
      signal: ctl.signal,
    });
    j = (await r.json()) as AgentEnvelope;
    if (r.status === 429) throw new Error('Perplexity is rate limiting us. Try again in a minute.');
    if (!r.ok) throw new Error(`Perplexity ${r.status}: ${j.error?.message || 'request failed'}`);
  } catch (err) {
    if (err instanceof Error && (err.name === 'AbortError' || /aborted/i.test(err.message))) {
      throw new Error('Perplexity took too long to answer');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  const message = (j.output || []).find((o) => o.type === 'message');
  const text = (message?.content || []).find((c) => c.type === 'output_text')?.text?.trim() || '';
  if (!text) throw new Error('Perplexity returned an empty answer');

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

  // The returned model is logged on every capture and surfaced in the method
  // note. If the API ever routes elsewhere, the report says so rather than
  // quietly attributing someone else's model to Perplexity.
  const returned = j.model || model;

  return {
    text,
    citations,
    model: returned,
    cost: j.usage?.cost?.total_cost ?? null,
    queries: searchItem?.queries || [],
  };
}
