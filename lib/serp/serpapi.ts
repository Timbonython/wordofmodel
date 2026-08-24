/**
 * Google AI Overviews via SerpApi.
 *
 * THE ASYNCHRONOUS TRAP, SERPAPI'S VERSION. AI Overviews load asynchronously on
 * Google's own page, and every provider has to decide what to do about that.
 * DataForSEO exposes it as a flag (load_async_ai_overview). SerpApi exposes it as a
 * SECOND REQUEST: when the overview has not settled, `ai_overview` comes back holding
 * only a `page_token`, and the text is fetched from engine=google_ai_overview.
 *
 * A client that reads text_blocks and gives up when they are absent will report "no
 * AI Overview" for a query that plainly shows one in a browser - intermittently, and
 * more often on exactly the slow, competitive queries a buyer actually types. That is
 * the number becoming a lie, from an integration detail, and it is the single most
 * likely way this surface goes quietly wrong.
 *
 * So the token is followed, and `usedPageToken` is recorded on every result.
 *
 * MEASURED 20 Aug 2026, and the rule tracks QUERY SHAPE rather than being random:
 *   head terms         4 of 4 returned the overview INLINE.  1 request.
 *                      "best HR software", "crm software comparison", 3-7 words.
 *   buyer questions    22 of 22 returned only a PAGE_TOKEN.  2 requests.
 *                      12-25 words, conversational, first person.
 *
 * Every question this product asks is the second kind, because that is what
 * lib/wizard-prompts.ts generates. So plan for TWO billable requests per capture, not
 * one, and never benchmark this surface on head terms: they are cheaper, faster and
 * not what a subscriber is ever measured on.
 *
 * NO_CACHE IS NOT OPTIONAL EITHER. SerpApi serves a cached result for a repeated
 * query, and it does so without populating search_metadata.cached_at - two identical
 * fetches came back byte for byte the same, while the same pair with no_cache=true
 * overlapped only 0.38. A cached overview stored with a fresh captured_at is false
 * provenance: the row would claim an observation at the time we asked, from a page
 * Google rendered up to an hour earlier. Every capture is an independent observation
 * or it is not evidence.
 */

import 'server-only';
import { env } from '../env';
import { serpApiGeo } from '../geo';
import { getJson } from '../engines/http';
import { CaptureError } from '../provenance';
import { domainOf } from '../domain';
import type { Citation } from '../types';
import type { AiOverviewResult, SerpProvider } from './types';

const LABEL = 'SerpApi';
const TIMEOUT_MS = 60_000;

interface TextBlock {
  type?: string;
  snippet?: string;
  title?: string;
  list?: Array<{ title?: string; snippet?: string }>;
}

interface Reference {
  title?: string;
  link?: string;
  source?: string;
}

interface SerpApiResponse {
  ai_overview?: {
    text_blocks?: TextBlock[];
    references?: Reference[];
    page_token?: string;
    error?: string;
  };
  search_metadata?: { status?: string; cached_at?: string };
  error?: string;
}

function url(params: Record<string, string>): string {
  const u = new URL('https://serpapi.com/search.json');
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

/** text_blocks nest one level: a list block carries its items rather than a snippet. */
function flattenBlocks(blocks: TextBlock[] | undefined): string {
  const out: string[] = [];
  for (const b of blocks || []) {
    if (b.title) out.push(b.title);
    if (b.snippet) out.push(b.snippet);
    for (const item of b.list || []) {
      const line = [item.title, item.snippet].filter(Boolean).join(': ');
      if (line) out.push(line);
    }
  }
  return out.join('\n\n').trim();
}

function toCitations(refs: Reference[] | undefined): Citation[] {
  const out: Citation[] = [];
  const seen = new Set<string>();
  for (const r of refs || []) {
    if (!r.link || seen.has(r.link)) continue;
    const domain = domainOf(r.link);
    if (!domain) continue;
    seen.add(r.link);
    out.push({ url: r.link, title: r.title || r.source || null, domain });
  }
  return out;
}

export const serpApiProvider: SerpProvider = {
  name: 'serpapi',

  async fetchAiOverview({ query, country, locality }): Promise<AiOverviewResult> {
    const geo = serpApiGeo(country, locality);
    const params = geo.params as Record<string, string>;
    let requests = 1;

    const first = await getJson<SerpApiResponse>(
      url({ engine: 'google', q: query, api_key: env.serpApiKey, no_cache: 'true', ...params }),
      {},
      TIMEOUT_MS,
      LABEL,
    );

    let ao = first.ai_overview;
    let usedPageToken = false;

    // The overview had not settled when the SERP was fetched. Follow the token.
    if (ao?.page_token && !ao.text_blocks?.length) {
      usedPageToken = true;
      requests += 1;
      const second = await getJson<SerpApiResponse>(
        url({
          engine: 'google_ai_overview',
          page_token: ao.page_token,
          api_key: env.serpApiKey,
          no_cache: 'true',
        }),
        {},
        TIMEOUT_MS,
        LABEL,
      );
      if (second.ai_overview) ao = second.ai_overview;
    }

    const text = flattenBlocks(ao?.text_blocks);
    const present = Boolean(text);

    // An overview with no references at all is the one SILENT failure mode measured on
    // this provider: 1 in 15 calls, where the browser showed multiple sources on all
    // fifteen. Recorded as-is it becomes "Google cited nobody", which is a false zero
    // in the section of the report that tells a subscriber who owns the answer.
    //
    // It is transient, so it is turned into a loud, retryable failure rather than a
    // quiet wrong number. This is the whole principle of the build applied to a
    // one-in-fifteen case: make the skipped step loud.
    if (present && !(ao?.references || []).length) {
      throw new CaptureError(
        `${LABEL} returned an AI Overview with no references. Every browser observation of ` +
          `these queries listed multiple sources, so this is a transient extraction failure ` +
          `rather than Google citing nobody.`,
        'retryable',
      );
    }

    return {
      present,
      text: present ? text : null,
      citations: present ? toCitations(ao?.references) : [],
      // Both hops kept. The first is the evidence that Google returned a token rather
      // than an overview, which is exactly what the bake-off is measuring.
      raw: usedPageToken ? { first, resolved: ao } : first,
      // SerpApi bills by plan, not per response, so there is no figure to report and
      // we will not invent one. requests is the unit that actually converts to money
      // once a plan is chosen.
      costUsd: null,
      costSource: null,
      provider: 'serpapi',
      requests,
      notes: {
        usedPageToken,
        aiOverviewError: ao?.error ?? null,
        searchStatus: first.search_metadata?.status ?? null,
        cachedAt: first.search_metadata?.cached_at ?? null,
      },
    };
  },
};
