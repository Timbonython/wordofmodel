/**
 * Asking an approved question about a different town.
 *
 * NOT server-only, and deliberately. This is pure string work with no database and no secret in
 * it, the wizard needs it in the browser to show a subscriber what their second location will
 * actually be asked, and lib/locations.ts is `server-only` for the same reason lib/accounts.ts
 * is. Constants and pure functions live on this side of that line; anything touching the
 * database stays on the other. Same split as lib/scope.ts against lib/accounts.ts.
 */

/** A place name inside a sentence, matched on word boundaries so Geelong never matches Geelongshire. */
function placePattern(place: string): RegExp {
  const escaped = place.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'giu');
}

export class LocalisationError extends Error {}

/**
 * Rewrite one approved question to ask about a different town.
 *
 * FAILS CLOSED, LOUDLY, AND THAT IS THE POINT. If the place cannot be found in the text there is
 * no safe fallback: sending the text unchanged asks about the wrong town and files the answer
 * under the right one, and the resulting Share of Model is wrong in a way no reader could ever
 * detect. Throwing costs a run. Guessing costs the methodology.
 *
 * Two forms are accepted because a model told to write a place "exactly as written" writes
 * "Geelong, Australia" most of the time and "Geelong" some of the time. Both are the place; a
 * third thing is not, and gets no benefit of the doubt.
 *
 * The BRANDED slot is exempt. `questionsPrompt` deliberately does not ask for a place in slot 5 -
 * "is Acme any good, and what do people say about it" is about the brand, and the geo parameter
 * carries the location. Requiring a place there would fail every run for a correctly written
 * question.
 */
export function localiseQuestion(input: {
  text: string;
  slot: string;
  fromPlace: string;
  toPlace: string;
  fromLocality: string;
  toLocality: string;
}): string {
  if (input.slot === 'branded') return input.text;

  const full = placePattern(input.fromPlace);
  if (full.test(input.text)) return input.text.replace(placePattern(input.fromPlace), input.toPlace);

  const bare = placePattern(input.fromLocality);
  if (bare.test(input.text)) return input.text.replace(placePattern(input.fromLocality), input.toLocality);

  throw new LocalisationError(
    `Cannot ask the ${input.slot} question from ${input.toLocality}: it does not name ` +
      `"${input.fromPlace}" or "${input.fromLocality}", so there is nothing to substitute. ` +
      `Sending it unchanged would ask about ${input.fromLocality} and file the answer under ` +
      `${input.toLocality}. Refusing. The question text is: ${input.text}`,
  );
}

/** The prose place for a scope's own locality, and for an additional one. Same builder, so they cannot drift. */
