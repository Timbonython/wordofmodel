/**
 * The one place a geographic parameter is constructed.
 *
 * Every surface is asked from the subscriber's market, which lives in
 * scopes.market_country as an ISO 3166-1 alpha-2 code. Nothing else in the build
 * may hardcode a country, build a `gl=`, or read scopes.market for geography.
 * scopes.market is prose for the question generation prompts; this is the machine
 * half.
 *
 * WHAT EACH SURFACE ACTUALLY SUPPORTS, checked against current documentation on
 * 20 Aug 2026 rather than assumed. They differ far more than they look like they
 * should:
 *
 *   chatgpt     REAL.  web_search tool takes user_location { type, country, city,
 *                      region, timezone }. country is ISO alpha-2.
 *   perplexity  REAL.  Agent API web_search tool takes user_location { country,
 *                      region, city, latitude, longitude }. country is ISO alpha-2.
 *   grok        NONE.  The xAI web_search tool accepts allowed_domains,
 *                      excluded_domains, enable_image_understanding and
 *                      enable_image_search. That is the entire list. The retired
 *                      Live Search API (search_parameters) did have a per-source
 *                      country; it was withdrawn on 12 Jan 2026 and the replacement
 *                      did not carry it over.
 *   gemini      NONE.  Grounding with Google Search documents no location, country
 *                      or locale parameter, on either the current or legacy API.
 *   google_aio  REAL, and the strongest of the five. Both candidate SERP providers
 *                      take real geo targeting; see the provider blocks below.
 *
 * For the two that support nothing, the Vercel function region IS the location, and
 * that is why vercel.json pins iad1 and must never change: the product sells a
 * month-over-month delta, and a network origin that drifts moves the number for a
 * reason that has nothing to do with the market.
 *
 * Returning null is therefore not a failure and must never be treated as one. It is
 * a method note, and an honest one in a category full of people implying otherwise:
 * "we asked Google as a buyer in your market; Gemini and Grok accept no location, so
 * those answers were taken from a US network origin, held constant every month."
 */

import type { Surface } from './scope';

/**
 * Markets we can construct parameters for.
 *
 * Deliberately a closed list. An unknown country throws rather than falling back to
 * the US, for the same reason scopes.market_country has no default: a subscriber
 * silently measured against the wrong market is a number that is wrong in a way
 * nobody can see, and the trend line carries it forward for months.
 *
 * Adding a market is one row here plus a check that the SERP provider recognises the
 * location name. It is not a code change anywhere else.
 */
const MARKETS: Record<string, { name: string; language: string; googleDomain: string }> = {
  US: { name: 'United States',        language: 'en', googleDomain: 'google.com'    },
  AU: { name: 'Australia',            language: 'en', googleDomain: 'google.com.au' },
  GB: { name: 'United Kingdom',       language: 'en', googleDomain: 'google.co.uk'  },
  NZ: { name: 'New Zealand',          language: 'en', googleDomain: 'google.co.nz'  },
  CA: { name: 'Canada',               language: 'en', googleDomain: 'google.ca'     },
  IE: { name: 'Ireland',              language: 'en', googleDomain: 'google.ie'     },
  SG: { name: 'Singapore',            language: 'en', googleDomain: 'google.com.sg' },
  ZA: { name: 'South Africa',         language: 'en', googleDomain: 'google.co.za'  },
  IN: { name: 'India',                language: 'en', googleDomain: 'google.co.in'  },
  AE: { name: 'United Arab Emirates', language: 'en', googleDomain: 'google.ae'     },
  DE: { name: 'Germany',              language: 'de', googleDomain: 'google.de'     },
  FR: { name: 'France',               language: 'fr', googleDomain: 'google.fr'     },
  NL: { name: 'Netherlands',          language: 'nl', googleDomain: 'google.nl'     },
  ES: { name: 'Spain',                language: 'es', googleDomain: 'google.es'     },
  IT: { name: 'Italy',                language: 'it', googleDomain: 'google.it'     },
  JP: { name: 'Japan',                language: 'ja', googleDomain: 'google.co.jp'  },
};

export type MarketCountry = keyof typeof MARKETS;

/**
 * The wizard's country selector, alphabetical.
 *
 * A CLOSED LIST IN THE UI, not a text box, and that is the whole point of this change.
 * The field used to be free text labelled "Primary market", and the only scope that ever
 * existed had "burner phone numbers" in it - a product category sitting in the column
 * every geo parameter derives from. The five generated questions came back naming four
 * different countries, none of them chosen by anybody, and a run against that scope would
 * have computed one Share of Model across four markets.
 *
 * A select cannot produce that. It also cannot produce a market geoFor() would throw on,
 * because it is built from the same table.
 */
export const MARKET_OPTIONS: Array<{ code: string; name: string }> = Object.entries(MARKETS)
  .map(([code, m]) => ({ code, name: m.name }))
  .sort((a, b) => a.name.localeCompare(b.name));

export function isSupportedMarket(country: string): boolean {
  return Object.prototype.hasOwnProperty.call(MARKETS, country);
}

export function marketName(country: string): string {
  return market(country).name;
}

function market(country: string): { name: string; language: string; googleDomain: string } {
  const m = MARKETS[country];
  if (!m) {
    throw new Error(
      `Unsupported market "${country}". Add it to MARKETS in lib/geo.ts after checking ` +
        `the SERP provider recognises the location name. Refusing to fall back to US: ` +
        `a scope measured against the wrong market is wrong invisibly.`,
    );
  }
  return m;
}

/**
 * What was actually sent to a surface, stored verbatim on captures.geo_sent.
 *
 * `supported: false` with `params: null` is a real, recorded observation - the
 * surface takes no location - and is what the method note is generated from. It is
 * not the same as a capture that failed, and it is not the same as a null column
 * because nobody bothered.
 */
export interface GeoSent {
  supported: boolean;
  params: Record<string, unknown> | null;
  /** Why, when unsupported. Printed in the method note. */
  reason?: string;
}

const UNSUPPORTED = (reason: string): GeoSent => ({ supported: false, params: null, reason });

/** OpenAI Responses web_search. country is a two letter ISO 3166-1 code. */
export function chatgptGeo(country: string): GeoSent {
  market(country);
  return { supported: true, params: { type: 'approximate', country } };
}

/** Perplexity Agent API web_search. Same ISO alpha-2 country. */
export function perplexityGeo(country: string): GeoSent {
  market(country);
  return { supported: true, params: { country } };
}

/**
 * xAI. The web_search tool has no geographic parameter at all. The Live Search API
 * that did was retired on 12 Jan 2026.
 */
export function grokGeo(_country: string): GeoSent {
  return UNSUPPORTED('the xAI web search tool accepts no location parameter');
}

/** Gemini. Grounding with Google Search documents no location control. */
export function geminiGeo(_country: string): GeoSent {
  return UNSUPPORTED('Gemini grounding accepts no location parameter');
}

/**
 * SerpApi.
 *
 * Both `location` and `gl` are sent, and that is not belt and braces. SerpApi's own
 * documentation warns that with `location` alone "Google may still take into account
 * the proxy's country", so the country filter has to be stated explicitly or the
 * result quietly depends on which exit node they happened to use. That is exactly the
 * kind of invisible drift the bake-off exists to catch.
 */
export function serpApiGeo(country: string): GeoSent {
  const m = market(country);
  return {
    supported: true,
    params: {
      location: m.name,
      gl: country.toLowerCase(),
      hl: m.language,
      google_domain: m.googleDomain,
    },
  };
}

/**
 * DataForSEO.
 *
 * location_name rather than location_code on purpose. Their country level codes
 * follow 2000 + the ISO 3166-1 numeric, which is a pattern rather than a promise, and
 * a wrong numeric code is a silently different country. The name is checkable against
 * their locations endpoint.
 *
 * load_async_ai_overview is the important one and it is NOT optional. Left unset it
 * defaults to false, which their docs describe as returning ai_overview items "from
 * cache" only. AI Overviews load asynchronously on Google's own page, so cache-only
 * means a query that genuinely shows an overview to a real buyer can come back with
 * no ai_overview item at all - indistinguishable, downstream, from Google having
 * shown nothing. That is the number becoming a lie on a default setting. It costs a
 * flat $0.002, refunded when the element turns out not to be asynchronous.
 */
export function dataForSeoGeo(country: string): GeoSent {
  const m = market(country);
  return {
    supported: true,
    params: {
      location_name: m.name,
      language_code: m.language,
      device: 'desktop',
      os: 'windows',
      load_async_ai_overview: true,
    },
  };
}

/** Dispatch, so the engine modules never choose a geo function by hand. */
export function geoFor(surface: Surface, country: string, provider?: string): GeoSent {
  switch (surface) {
    case 'chatgpt':
      return chatgptGeo(country);
    case 'perplexity':
      return perplexityGeo(country);
    case 'grok':
      return grokGeo(country);
    case 'gemini':
      return geminiGeo(country);
    case 'google_aio':
      if (provider === 'dataforseo') return dataForSeoGeo(country);
      if (provider === 'serpapi') return serpApiGeo(country);
      throw new Error(
        `google_aio needs a committed SERP provider before a geo parameter can be built. ` +
          `Set SERP_PROVIDER once the bake-off has decided.`,
      );
    // Browser surfaces are located by the operator's machine, not by a parameter.
    // Session 6 records that on the capture as the operator plus their location.
    case 'claude':
    case 'copilot':
      return UNSUPPORTED('captured by hand in a browser; located by the operator');
  }
}

/**
 * "an iad1 network origin", not "a iad1".
 *
 * Deliberately small. The only values that reach it are Vercel region codes, which a reader
 * sounds out letter by letter, plus the 'US' fallback for a run that recorded no region -
 * and "a US network origin" is correct there, because the U is read "you". A general a/an
 * function is a much larger problem than this sentence has.
 */
export function article(word: string): 'a' | 'an' {
  if (/^U[A-Z]/.test(word)) return 'a';
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}

/**
 * The method note line for one surface, generated from what was actually sent rather
 * than from what we intended to send. captures.geo_sent is the input, so a surface
 * whose parameters change mid-life tells the truth about each month separately.
 */
export function methodNoteFor(surfaceLabel: string, geo: GeoSent, marketLabel: string, region: string): string {
  if (geo.supported) {
    return `${surfaceLabel}: asked as a buyer in ${marketLabel}.`;
  }
  return `${surfaceLabel}: ${geo.reason}, so the answer is location-neutral. Asked from ${article(region)} ${region} network origin, held constant every month.`;
}
