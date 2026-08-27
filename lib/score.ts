import 'server-only';
import { askJson } from './openai';
import { scorePrompt } from './prompts';
import { computedCost, reportedCost } from './cost';
import type { Capture, CaptureUsage, Citation, EngineId, Score } from './types';

const SCORE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'target_mentioned',
    'target_recommended',
    'target_position',
    'brands_named',
    'top_recommendation',
    'domains_cited',
  ],
  properties: {
    target_mentioned: { type: 'boolean' },
    target_recommended: { type: 'boolean' },
    target_position: { type: ['integer', 'null'] },
    brands_named: { type: 'array', items: { type: 'string' } },
    top_recommendation: { type: ['string', 'null'] },
    domains_cited: { type: 'array', items: { type: 'string' } },
  },
} as const;

/** Company suffixes and punctuation, so "Acme Pty Ltd" matches "Acme". */
export function brandKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(pty|ltd|limited|inc|incorporated|llc|plc|gmbh|bv|nv|co|corp|corporation|group|company)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

export function sameBrand(a: string, b: string): boolean {
  const ka = brandKey(a);
  const kb = brandKey(b);
  if (!ka || !kb) return false;
  return ka === kb || (ka.length >= 5 && kb.length >= 5 && (ka.includes(kb) || kb.includes(ka)));
}

export async function scoreAnswer(input: {
  engine: EngineId;
  model: string;
  brand_name: string;
  question: string;
  answer: string;
  citations: Citation[];
  ms: number;
  /** Perplexity's own figure, when the provider gave us one. */
  cost: number | null;
  /** OpenAI's token counts, when it gave us those instead. */
  usage: CaptureUsage | null;
}): Promise<Capture> {
  const raw = await askJson<Score>(
    scorePrompt({ brand_name: input.brand_name, question: input.question, answer: input.answer }),
    'answer_score',
    SCORE_SCHEMA,
  );

  // The provider's invoice if there is one, our arithmetic if there is not, and a record of
  // which. Computed here rather than left for later: the token counts are in hand exactly
  // once, and a cost worked out afterwards from a stored total has to assume an input/output
  // ratio, which is what made the first per-scan figure an estimate.
  const cost = input.cost !== null
    ? reportedCost(input.cost)
    : computedCost(input.model, {
        in: input.usage?.input ?? null,
        out: input.usage?.output ?? null,
        cachedIn: input.usage?.cached ?? null,
      });

  const brands_named = dedupeBrands(raw.brands_named || []);

  // The scorer reads brands out of the prose, but it can only report domains it
  // can see in the text, and neither engine writes URLs inline. The engine's own
  // citation payload is the real source. Union the two, engine data first.
  const domains = Array.from(
    new Set([
      ...input.citations.map((c) => c.domain),
      ...(raw.domains_cited || [])
        .map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] || '')
        .filter(Boolean),
    ]),
  );

  // Trust the flags, but keep them consistent with each other. A brand cannot be
  // recommended without being mentioned.
  const mentioned = raw.target_mentioned || brands_named.some((b) => sameBrand(b, input.brand_name));
  const recommended = raw.target_recommended && mentioned;

  return {
    engine: input.engine,
    model: input.model,
    answer: input.answer,
    citations: input.citations,
    domains,
    ms: input.ms,
    cost_usd: cost.usd,
    cost_source: cost.source,
    usage: input.usage,
    score: {
      target_mentioned: mentioned,
      target_recommended: recommended,
      target_position: raw.target_position ?? null,
      brands_named,
      top_recommendation: raw.top_recommendation?.trim() || null,
      domains_cited: domains,
    },
  };
}

function dedupeBrands(names: string[]): string[] {
  const out: string[] = [];
  for (const n of names) {
    const name = n.trim();
    if (!name) continue;
    if (!out.some((existing) => sameBrand(existing, name))) out.push(name);
  }
  return out;
}
