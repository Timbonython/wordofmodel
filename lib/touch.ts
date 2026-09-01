/**
 * First touch: what the URL says about where this visitor came from.
 *
 * ITS OWN MODULE, AND THE REASON IS THE IMPORT GRAPH, not tidiness. This lived in lib/funnel.ts
 * until 1 Sep 2026, and lib/funnel.ts is `server-only` and imports lib/db behind it - the whole
 * Supabase client and an env module whose `required()` throws. proxy.ts runs in front of every
 * request on the site and needs exactly these seventy lines and none of that, so the parsing
 * moved here and lib/funnel.ts re-exports it. Nothing that imported it from there had to change.
 *
 * NO IMPORTS OF ITS OWN, deliberately. The moment this file needs one, check whether that
 * dependency is something you want executing ahead of the front page.
 */

/**
 * The click-time identifiers, in the order they are looked for.
 *
 * ANY VENDOR, NOT JUST META. Hard-coding fbclid would make the next paid channel invisible and
 * nobody would remember why. These five are the click-time parameters of the platforms this
 * business could plausibly buy from: Meta, Google, TikTok, LinkedIn, Microsoft.
 *
 * WHAT MAKES THIS DIFFERENT FROM A UTM. A utm is baked into the ad's destination URL, so
 * anything that fetches that URL carries it - crawlers included. A click id is minted at click
 * time by the platform, so it is the only parameter on the URL that is evidence a person
 * clicked. See 0020 for the 41 rows that proved it.
 */
export const CLICK_ID_PARAMS = ['fbclid', 'gclid', 'ttclid', 'li_fat_id', 'msclkid'] as const;
export type ClickIdParam = (typeof CLICK_ID_PARAMS)[number];

/** First-touch parameters: the ad tagging, plus the one parameter that evidences a click. */
export interface TouchParams {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  fbclid: string | null;
  /** The click-time id, whichever vendor minted it. Null means nothing clicked. */
  click_id: string | null;
  /** Which of CLICK_ID_PARAMS it came from, so a channel is legible without parsing utm_source. */
  click_id_param: ClickIdParam | null;
}

/** Trimmed, length-capped, and null when empty. These arrive from a URL a stranger controls. */
function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, 200);
  return trimmed || null;
}

export function touchFrom(source: Record<string, unknown> | URLSearchParams): TouchParams {
  const get = (k: string) =>
    source instanceof URLSearchParams ? source.get(k) : (source[k] as unknown);
  // First one present wins. A URL carrying two click ids is a tagging mistake, not two clicks.
  let click_id: string | null = null;
  let click_id_param: ClickIdParam | null = null;
  for (const param of CLICK_ID_PARAMS) {
    const value = clean(get(param));
    if (value) {
      click_id = value;
      click_id_param = param;
      break;
    }
  }

  return {
    utm_source: clean(get('utm_source')),
    utm_medium: clean(get('utm_medium')),
    utm_campaign: clean(get('utm_campaign')),
    utm_content: clean(get('utm_content')),
    fbclid: clean(get('fbclid')),
    click_id,
    click_id_param,
  };
}

/**
 * Did a person click an ad to get here?
 *
 * THE ONLY QUESTION THE LANDING GATE MAY ASK. A utm proves an ad URL was fetched; a click id
 * proves it was clicked. 0019 gated on the former and counted crawlers as people.
 */
export function isClick(touch: Partial<TouchParams> | null | undefined): boolean {
  return Boolean(touch?.click_id);
}
