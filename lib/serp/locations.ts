/**
 * Turning what the subscriber typed into a place Google will accept.
 *
 * THE FAILURE THIS EXISTS TO PREVENT. SerpApi's `location` is matched against their own
 * gazetteer, not parsed. "Geelong" is not a location string; "Geelong,Victoria,Australia"
 * is. Sending the raw box either errors or, worse, matches something else with a similar
 * name in another country, and the capture is then filed under a town the subscriber never
 * chose, with a report that says we asked from their town. That is a guessed input rendered
 * as a read one, which is the failure LOCAL-TARGETING-BRIEF.md names and then walks into by
 * proposing free text with no resolution step.
 *
 * So the box is free text and the parameter is not. The wizard resolves once, at approval,
 * and stores the canonical name. Nothing at capture time guesses.
 *
 * WHEN NOTHING MATCHES, THAT IS A RESULT. The scope keeps the locality for the question
 * text, Google is asked at country level, and the report says so in as many words. A
 * subscriber in a village SerpApi has never heard of still gets their village named in all
 * five questions, which is where most of the effect lives anyway.
 */

import 'server-only';
import { getJson } from '../engines/http';
import { marketName, type Locality } from '../geo';

const TIMEOUT_MS = 15_000;
const LABEL = 'SerpApi locations';

/**
 * One entry in SerpApi's locations database. `canonical_name` is the string the search
 * endpoint takes; `name` is the display form and is NOT interchangeable with it.
 */
interface LocationRow {
  id?: string;
  name?: string;
  canonical_name?: string;
  country_code?: string;
  target_type?: string;
  reach?: number;
}

/**
 * Which target types are a place a buyer would say they are in.
 *
 * SerpApi returns airports, universities, postal codes and TV regions alongside cities.
 * A subscriber typing "Bay Area" should not be resolved to an airport, so the list is
 * closed and anything outside it is treated as no match rather than as a near miss.
 */
const USABLE = new Set([
  'City',
  'Region',
  'State',
  'Province',
  'County',
  'Municipality',
  'Borough',
  'Territory',
]);

/** The display parts, pulled off the canonical name: "Geelong,Victoria,Australia". */
function partsOf(canonical: string): { city: string | null; region: string | null } {
  const bits = canonical
    .split(',')
    .map((b) => b.trim())
    .filter(Boolean);
  if (bits.length >= 3) return { city: bits[0] ?? null, region: bits[1] ?? null };
  if (bits.length === 2) return { city: bits[0] ?? null, region: null };
  return { city: bits[0] ?? null, region: null };
}

/**
 * Resolve free text against SerpApi, inside the country the subscriber already chose.
 *
 * The country filter is the important line. "Richmond" exists in Australia, the United
 * Kingdom, the United States and Canada, and an unfiltered match returns whichever has the
 * most reach - which is how an Australian subscriber's report comes back measured against
 * Virginia. `market_country` is already NOT NULL and already chosen from a closed list, so
 * there is no case where we do not know which country to filter to.
 *
 * Never throws. A locations lookup failing is not a reason to refuse somebody's signup: it
 * costs the Google parameter, and the report states that it did.
 */
export async function resolveLocality(input: string, country: string): Promise<Locality> {
  const typed = input.trim().replace(/\s+/g, ' ').slice(0, 120);
  const unresolved: Locality = { input: typed, canonical: null, city: null, region: null };
  if (!typed) return { ...unresolved, input: '' };

  let rows: LocationRow[];
  try {
    const u = new URL('https://serpapi.com/locations.json');
    u.searchParams.set('q', typed);
    u.searchParams.set('limit', '20');
    // No api_key: the locations endpoint is public and unbilled. Sending one would be the
    // only place in the build that spends a request to read a gazetteer.
    rows = await getJson<LocationRow[]>(u.toString(), {}, TIMEOUT_MS, LABEL);
  } catch (err) {
    console.error(`Could not resolve "${typed}" against SerpApi: ${(err as Error).message}`);
    return unresolved;
  }

  if (!Array.isArray(rows)) return unresolved;

  const wanted = country.toUpperCase();
  const candidates = rows.filter((r) => {
    if (!r.canonical_name) return false;
    if ((r.country_code ?? '').toUpperCase() !== wanted) return false;
    return USABLE.has(r.target_type ?? '');
  });
  if (!candidates.length) return unresolved;

  // Reach is SerpApi's own audience size for the target. Within one country it is a
  // reasonable tie-break for "Springfield" and it is theirs rather than ours.
  candidates.sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0));
  const best = candidates[0];
  if (!best?.canonical_name) return unresolved;
  const canonical = best.canonical_name;
  const { city, region } = partsOf(canonical);

  return { input: typed, canonical, city, region };
}

/** For the wizard, which has to tell somebody what their box turned into. */
export function localityStatement(locality: Locality | null, country: string): string {
  if (!locality?.input) return `Your questions will name ${marketName(country)}.`;
  if (!locality.canonical) {
    return (
      `Your questions will name ${locality.input}. We could not match it to a Google search ` +
      `location, so Google will be asked at ${marketName(country)} level.`
    );
  }
  return (
    `Your questions will name ${locality.input}, and Google will be searched from ` +
    `${locality.canonical.replace(/,/g, ', ')}.`
  );
}
