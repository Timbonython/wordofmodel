/**
 * Google AI Overviews via DataForSEO.
 *
 * THE ASYNCHRONOUS TRAP, DATAFORSEO'S VERSION, and it is a default rather than an
 * omission: load_async_ai_overview defaults to FALSE, which their documentation
 * describes as returning ai_overview items "from cache" only. AI Overviews load
 * asynchronously on Google's page, so cache-only means a query that plainly shows an
 * overview to a real buyer can come back with no ai_overview item at all.
 *
 * Downstream that is indistinguishable from Google having shown nothing, which would
 * put a fabricated zero into the Share of Model denominator every month. It costs a
 * flat USD 0.002 to turn on, refunded when the element turns out not to have been
 * asynchronous. lib/geo.ts sends it as true and says why.
 *
 * asynchronous_ai_overview comes back on the item and is recorded, because "we had to
 * wait for this one" and "this was already cached" are different facts about how fresh
 * the evidence is.
 *
 * Unlike SerpApi, DataForSEO reports what the request cost in the response, so the
 * money here is a fact rather than our arithmetic.
 */

import 'server-only';
import { env } from '../env';
import { dataForSeoGeo } from '../geo';
import { postJson } from '../engines/http';
import { CaptureError } from '../provenance';
import { normaliseDomain } from '../domain';
import type { Citation } from '../types';
import type { AiOverviewResult, SerpProvider } from './types';

const ENDPOINT = 'https://api.dataforseo.com/v3/serp/google/organic/live/advanced';
const LABEL = 'DataForSEO';
const TIMEOUT_MS = 60_000;

interface AiOverviewItem {
  type?: string;
  markdown?: string;
  asynchronous_ai_overview?: boolean;
  items?: Array<{ text?: string; title?: string }>;
  references?: Array<{ url?: string; domain?: string; title?: string; source?: string }>;
}

interface DfsResponse {
  status_code?: number;
  status_message?: string;
  cost?: number;
  tasks?: Array<{
    status_code?: number;
    status_message?: string;
    cost?: number;
    result?: Array<{ items?: AiOverviewItem[] }>;
  }>;
}

function auth(): string {
  return Buffer.from(`${env.dataForSeoLogin}:${env.dataForSeoPassword}`).toString('base64');
}

function toCitations(refs: AiOverviewItem['references']): Citation[] {
  const out: Citation[] = [];
  const seen = new Set<string>();
  for (const r of refs || []) {
    if (!r.url || seen.has(r.url)) continue;
    // DataForSEO gives the domain outright. Prefer it over parsing the url, which can
    // be a tracking wrapper.
    const domain = normaliseDomain(r.domain || '') || normaliseDomain(r.url) || null;
    if (!domain) continue;
    seen.add(r.url);
    out.push({ url: r.url, title: r.title || r.source || null, domain });
  }
  return out;
}

export const dataForSeoProvider: SerpProvider = {
  name: 'dataforseo',

  async fetchAiOverview({ query, country }): Promise<AiOverviewResult> {
    const geo = dataForSeoGeo(country);

    const j = await postJson<DfsResponse>(
      ENDPOINT,
      {
        headers: { Authorization: `Basic ${auth()}` },
        body: [{ keyword: query, ...(geo.params as Record<string, unknown>) }],
      },
      TIMEOUT_MS,
      LABEL,
    );

    // DataForSEO returns HTTP 200 with the real outcome in the body, so a failed task
    // would otherwise look like a query with no AI Overview. That is the one confusion
    // this surface cannot afford.
    const task = j.tasks?.[0];
    if (j.status_code !== 20000 || !task) {
      throw new CaptureError(
        `${LABEL} rejected the request: ${j.status_message ?? 'unknown'} (${j.status_code})`,
        j.status_code === 40402 || j.status_code === 50000 ? 'retryable' : 'permanent',
      );
    }
    if (task.status_code !== 20000) {
      throw new CaptureError(
        `${LABEL} task failed: ${task.status_message ?? 'unknown'} (${task.status_code})`,
        'retryable',
      );
    }

    const items = task.result?.[0]?.items ?? [];
    const ao = items.find((i) => i.type === 'ai_overview');

    const text =
      ao?.markdown?.trim() ||
      (ao?.items || [])
        .map((i) => [i.title, i.text].filter(Boolean).join(': '))
        .filter(Boolean)
        .join('\n\n')
        .trim() ||
      '';
    const present = Boolean(ao && text);

    return {
      present,
      text: present ? text : null,
      citations: present ? toCitations(ao?.references) : [],
      raw: j,
      costUsd: typeof task.cost === 'number' ? task.cost : (j.cost ?? null),
      costSource: typeof task.cost === 'number' || typeof j.cost === 'number' ? 'reported' : null,
      provider: 'dataforseo',
      requests: 1,
      notes: {
        asynchronous: ao?.asynchronous_ai_overview ?? null,
        itemTypes: [...new Set(items.map((i) => i.type).filter(Boolean))],
      },
    };
  },
};
