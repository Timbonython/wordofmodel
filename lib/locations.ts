/**
 * Additional locations: the same five approved questions, asked from another town.
 *
 * THE APPROVED QUESTIONS ARE NOT REGENERATED. A subscriber approves five questions, and that
 * approval is the credibility mechanic the whole product is sold on. Generating a fresh five per
 * town would mean approving five and receiving answers to fifteen nobody had seen. So the text is
 * reused and the place inside it is substituted, which is the only version of "the same questions"
 * that is actually true.
 *
 * The place is IN THE TEXT, not just in the geo parameter. `questionsPrompt` instructs "Name the
 * place in questions 1 to 4, exactly as it is written above", so an approved question reads "who
 * is best at emergency dentistry in Geelong, Australia". Sending that text with a Ballarat geo
 * parameter would ask about Geelong from Ballarat and file the answer under Ballarat - a wrong
 * number that looks completely normal, which is the expensive kind.
 */

import 'server-only';
import { db } from './db';
import { placeLabel } from './geo';
import type { Locality } from './geo';
export { localiseQuestion, LocalisationError } from './location-text';

export interface ScopeLocation {
  id: string;
  scopeId: string;
  locality: string;
  localityCanonical: string | null;
  localityCity: string | null;
  localityRegion: string | null;
}

export function localityOfLocation(l: ScopeLocation): Locality {
  return {
    input: l.locality,
    canonical: l.localityCanonical,
    city: l.localityCity,
    region: l.localityRegion,
  };
}

/** The additional locations on a scope, oldest first, so run order is stable across months. */
export async function locationsForScope(scopeId: string): Promise<ScopeLocation[]> {
  const { data, error } = await db()
    .from('scope_locations')
    .select('id, scope_id, locality, locality_canonical, locality_city, locality_region')
    .eq('scope_id', scopeId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Could not read locations for scope ${scopeId}: ${error.message}`);
  return (data ?? []).map((r) => {
    const row = r as Record<string, string | null>;
    return {
      id: row.id as string,
      scopeId: row.scope_id as string,
      locality: row.locality as string,
      localityCanonical: row.locality_canonical ?? null,
      localityCity: row.locality_city ?? null,
      localityRegion: row.locality_region ?? null,
    };
  });
}

export async function getLocation(locationId: string): Promise<ScopeLocation | null> {
  const { data, error } = await db()
    .from('scope_locations')
    .select('id, scope_id, locality, locality_canonical, locality_city, locality_region')
    .eq('id', locationId)
    .maybeSingle();
  if (error) throw new Error(`Could not read location ${locationId}: ${error.message}`);
  if (!data) return null;
  const row = data as Record<string, string | null>;
  return {
    id: row.id as string,
    scopeId: row.scope_id as string,
    locality: row.locality as string,
    localityCanonical: row.locality_canonical ?? null,
    localityCity: row.locality_city ?? null,
    localityRegion: row.locality_region ?? null,
  };
}

/** The prose place for a scope's own locality, and for an additional one. Same builder, so they cannot drift. */
export function placeFor(country: string, locality: Locality | null): string {
  return placeLabel(country, locality);
}
