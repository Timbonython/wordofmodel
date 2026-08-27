import 'server-only';
import { env, MODELS } from './env';
import type { CaptureUsage, Citation } from './types';
import { domainOf } from './domain';

const ENDPOINT = 'https://api.openai.com/v1/responses';

interface ResponsesEnvelope {
  model?: string;
  output?: Array<{
    type: string;
    content?: Array<{
      type: string;
      text?: string;
      annotations?: Array<{ type: string; url?: string; title?: string }>;
    }>;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
  };
  error?: { message?: string };
}

/**
 * Pull the assistant text out of a Responses envelope.
 *
 * Verified 17 Aug 2026: this API version does NOT return the `output_text`
 * convenience field, and `output` is a mixed array of reasoning / web_search_call
 * / message items. Walk it.
 */
function readEnvelope(j: ResponsesEnvelope): { text: string; citations: Citation[] } {
  const message = (j.output || []).find((o) => o.type === 'message');
  const part = (message?.content || []).find((c) => c.type === 'output_text');
  const text = part?.text?.trim() || '';

  const citations: Citation[] = [];
  const seen = new Set<string>();
  for (const a of part?.annotations || []) {
    if (a.type !== 'url_citation' || !a.url) continue;
    // Search citations arrive tagged with ?utm_source=openai. Strip it.
    let url = a.url;
    try {
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
  return { text, citations };
}

async function post(body: unknown, timeoutMs: number, label: string): Promise<ResponsesEnvelope> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    const j = (await r.json()) as ResponsesEnvelope;
    if (!r.ok) throw new Error(`OpenAI ${r.status}: ${j.error?.message || 'request failed'}`);
    return j;
  } catch (err) {
    // "This operation was aborted" is not a sentence to put in front of a
    // prospect, and it reads as a bug rather than a slow upstream.
    if (err instanceof Error && (err.name === 'AbortError' || /aborted/i.test(err.message))) {
      throw new Error(`${label} took too long to answer`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** The ChatGPT capture. Web search on, located in the buyer's country. */
export async function askChatGpt(
  question: string,
  countryIso2: string | null,
): Promise<{ text: string; citations: Citation[]; model: string; usage: CaptureUsage }> {
  const tool: Record<string, unknown> = { type: 'web_search' };
  if (countryIso2) tool.user_location = { type: 'approximate', country: countryIso2 };

  // A flagship model running five or six web searches took 20 seconds on a quiet
  // API and over two minutes when calls overlapped, so this sits well clear of
  // both. maxDuration on the scan route is 300.
  const j = await post({ model: MODELS.answer, input: question, tools: [tool] }, 240_000, 'ChatGPT');
  const { text, citations } = readEnvelope(j);
  if (!text) throw new Error('ChatGPT returned an empty answer');
  // OpenAI reports no cost, only tokens, so the split is what makes a scan's cost a
  // measurement rather than an inference. Input and output differ by six times on gpt-5.5
  // and a search-backed answer is mostly input, so a total alone cannot be priced without
  // assuming a ratio. cached is a tenth of uncached input and is counted separately.
  return {
    text,
    citations,
    model: j.model || MODELS.answer,
    usage: {
      input: j.usage?.input_tokens ?? null,
      output: j.usage?.output_tokens ?? null,
      cached: j.usage?.input_tokens_details?.cached_tokens ?? null,
      total: j.usage?.total_tokens ?? null,
    },
  };
}

/** Utility calls: detect, question writing, scoring. */
export async function askJson<T>(prompt: string, schemaName: string, schema: object): Promise<T> {
  const j = await post(
    {
      model: MODELS.utility,
      input: prompt,
      text: { format: { type: 'json_schema', name: schemaName, strict: true, schema } },
      reasoning: { effort: 'low' },
    },
    60_000,
    schemaName,
  );
  const { text } = readEnvelope(j);
  if (!text) throw new Error(`Empty ${schemaName} response`);
  return JSON.parse(text) as T;
}

export async function askText(prompt: string): Promise<string> {
  const j = await post({ model: MODELS.utility, input: prompt, reasoning: { effort: 'low' } }, 60_000, 'The model');
  const { text } = readEnvelope(j);
  if (!text) throw new Error('Empty response');
  return text;
}

/**
 * A utility call with web search on. Used by the onboarding wizard's competitor
 * proposal, which the spec specifies as one call with search enabled and JSON
 * only.
 *
 * Search is not optional there. Asked without it the model returns the four
 * best known names in the category from training data, which for a small market
 * is a list of the wrong companies, and the competitor screen only earns its
 * place if it surfaces someone the customer had not thought of.
 *
 * Longer timeout than askJson for the same reason askChatGpt has one: a search
 * backed answer runs several queries before it writes anything.
 */
export async function askJsonSearched<T>(
  prompt: string,
  schemaName: string,
  schema: object,
  countryIso2: string | null,
): Promise<T> {
  const tool: Record<string, unknown> = { type: 'web_search' };
  if (countryIso2) tool.user_location = { type: 'approximate', country: countryIso2 };

  const j = await post(
    {
      model: MODELS.utility,
      input: prompt,
      tools: [tool],
      text: { format: { type: 'json_schema', name: schemaName, strict: true, schema } },
    },
    120_000,
    schemaName,
  );
  const { text } = readEnvelope(j);
  if (!text) throw new Error(`Empty ${schemaName} response`);
  return JSON.parse(text) as T;
}

/**
 * A utility call pinned as reproducibly as this API allows: temperature 0, no reasoning.
 *
 * VERIFIED 20 Aug 2026, and the combination is not free choice. `temperature: 0` alone
 * returns 200. `temperature: 0` WITH `reasoning: { effort }` returns 400, "Unsupported
 * parameter: 'temperature' is not supported with this model." So the extractor gives up
 * reasoning tokens to get temperature, which is the right trade for a reading task that
 * has to give the same answer twice.
 *
 * TEMPERATURE 0 IS NOT DETERMINISM, and the code must not imply otherwise. Batching, MoE
 * routing and hardware still move the output. It is as reproducible as the API allows,
 * which is why every extracted row carries extraction_version and extractor_model: a
 * re-parse is comparable to the one before it because we know what produced each.
 *
 * Deliberately separate from askJson rather than a flag on it. askJson serves the free
 * scan, which is live and taking traffic.
 */
export async function askJsonExact<T>(
  prompt: string,
  schemaName: string,
  schema: object,
): Promise<{ value: T; model: string }> {
  const j = await post(
    {
      model: MODELS.utility,
      input: prompt,
      temperature: 0,
      text: { format: { type: 'json_schema', name: schemaName, strict: true, schema } },
    },
    60_000,
    schemaName,
  );
  const { text } = readEnvelope(j);
  if (!text) throw new Error(`Empty ${schemaName} response`);
  return { value: JSON.parse(text) as T, model: j.model || MODELS.utility };
}
