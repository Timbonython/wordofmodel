/** Domain handling. Shared by client and server, so no server-only import here. */

/**
 * Normalise whatever someone types into the hero field into a bare hostname.
 * "HTTPS://WWW.Example.com/pricing?x=1" -> "example.com"
 * Returns null if it cannot possibly be a domain.
 */
export function normaliseDomain(input: string): string | null {
  let s = input.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^[a-z]+:\/\//, '');
  s = s.replace(/^www\./, '');
  s = s.split('/')[0] ?? '';
  s = s.split('?')[0] ?? '';
  s = s.split('#')[0] ?? '';
  s = s.split('@').pop() ?? '';
  s = s.replace(/:\d+$/, '');
  s = s.replace(/\.+$/, '');
  if (!s || s.length > 253) return null;
  // At least one dot, valid label characters, a plausible TLD.
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(s)) return null;
  const tld = s.split('.').pop() ?? '';
  if (tld.length < 2 || /^\d+$/.test(tld)) return null;
  return s;
}

/** Hostname out of a URL, www stripped. Null if unparseable. */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

/**
 * ISO country name to ISO 3166-1 alpha-2, for the web search tool's
 * user_location. The detect prompt returns a country name, and both engines want
 * a two letter code. Covers the markets this is realistically sold into; unknown
 * names return null, which simply means the search is not geo-located.
 */
const ISO2: Record<string, string> = {
  australia: 'AU',
  'new zealand': 'NZ',
  'united states': 'US',
  'united states of america': 'US',
  usa: 'US',
  'united kingdom': 'GB',
  'great britain': 'GB',
  england: 'GB',
  scotland: 'GB',
  wales: 'GB',
  ireland: 'IE',
  canada: 'CA',
  singapore: 'SG',
  'hong kong': 'HK',
  india: 'IN',
  japan: 'JP',
  'south korea': 'KR',
  'korea, republic of': 'KR',
  china: 'CN',
  germany: 'DE',
  france: 'FR',
  spain: 'ES',
  italy: 'IT',
  netherlands: 'NL',
  belgium: 'BE',
  switzerland: 'CH',
  austria: 'AT',
  sweden: 'SE',
  norway: 'NO',
  denmark: 'DK',
  finland: 'FI',
  poland: 'PL',
  portugal: 'PT',
  'czech republic': 'CZ',
  'south africa': 'ZA',
  'united arab emirates': 'AE',
  'saudi arabia': 'SA',
  israel: 'IL',
  brazil: 'BR',
  mexico: 'MX',
  argentina: 'AR',
  chile: 'CL',
  colombia: 'CO',
  philippines: 'PH',
  indonesia: 'ID',
  malaysia: 'MY',
  thailand: 'TH',
  vietnam: 'VN',
  turkey: 'TR',
  greece: 'GR',
  romania: 'RO',
  hungary: 'HU',
  nigeria: 'NG',
  kenya: 'KE',
  egypt: 'EG',
  pakistan: 'PK',
  bangladesh: 'BD',
  'sri lanka': 'LK',
  taiwan: 'TW',
};

export function iso2(countryName: string | null): string | null {
  if (!countryName) return null;
  const key = countryName.trim().toLowerCase();
  if (/^[a-z]{2}$/.test(key)) return key.toUpperCase();
  return ISO2[key] ?? null;
}
