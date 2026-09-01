/**
 * The business profile the question is written from.
 *
 * THE INVARIANT, from §2 of word-of-model-scan-grounding-and-confirm.md: question generation
 * consumes a typed profile whose every field is extracted, or user-confirmed, or null. There is
 * no fourth state, and a null renders as absence rather than as a default.
 *
 * WHAT MAKES A WRONG CITY UNREPRESENTABLE RATHER THAN UNLIKELY. `questionPrompt` takes this
 * object and a brand name, and nothing else - no site text, no country string, no request
 * context. So the only place name that can reach the generator is `location.value`, which came
 * either from the page or from the visitor. There is no post-check looking for wrong cities
 * afterwards, deliberately: principle §1 says the strongest guard makes the defect
 * unrepresentable, and a checker that hunts for Melbourne in the output is the second-best
 * version of this.
 *
 * WHAT WAS THERE BEFORE, so nobody restores it by accident. `confirmProfile` in the scan route
 * read `country: (p?.country?.trim() || 'Australia')`. A country the model could not determine
 * became Australia, in the same shape as a found fact, and the prompt then instructed the model
 * to "include the country or region" - so it chose one. That is principle §5 exactly: a failed
 * read and a genuine answer, identical downstream. One observed run put an Adelaide pub in
 * metro Melbourne.
 *
 * Not server-only: the confirm card renders this in the browser and must agree with what the
 * generator is handed, field for field.
 */

/**
 * Where a fact came from. There is no 'inferred', deliberately - see §2 of the brief. Adding one
 * later as a convenience is the defect with a name.
 */
export type Provenance = 'extracted' | 'confirmed';

export interface Fact {
  value: string;
  from: Provenance;
}

export interface BusinessProfile {
  /** What the business sells or offers, in the words the page uses. */
  sells: Fact | null;
  /**
   * Who is choosing. NOT who they sell to in a trade sense - the person deciding.
   *
   * The run cannot proceed without it (§4). It is the field that decides which direction the
   * question runs, and dropping it is what turned a pub into a pub supplier.
   */
  buyer: Fact | null;
  /**
   * Where the business is, quoted from the page or typed by the visitor. Singular for this
   * build, decided 1 Sep 2026: one location, one string. The paid path bills additional
   * locations separately and models them separately; this is not that.
   */
  location: Fact | null;
}

/**
 * Build a fact, or nothing.
 *
 * ABSENCE IS CONSTRUCTED HERE AND NOWHERE ELSE. Every caller goes through this, so there is one
 * place where "the model returned an empty string" becomes null rather than becoming a value
 * that looks found. Also refuses the strings a model returns when it means nothing.
 */
export function fact(value: string | null | undefined, from: Provenance): Fact | null {
  const v = (value ?? '').trim();
  if (!v) return null;
  const low = v.toLowerCase();
  if (low === 'null' || low === 'unknown' || low === 'n/a' || low === 'none') return null;
  return { value: v.slice(0, 200), from };
}

export const EMPTY_PROFILE: BusinessProfile = { sells: null, buyer: null, location: null };

/**
 * The one field a run cannot proceed without.
 *
 * §4: if `buyer` is null, do not write a question. Everything else degrades - a question with no
 * geography is a defensible question - but without knowing who is choosing there is no way to
 * write one that runs in the right direction, and guessing is what this whole change removes.
 */
export function missingForQuestion(p: BusinessProfile): 'buyer' | 'sells' | null {
  if (!p.buyer) return 'buyer';
  if (!p.sells) return 'sells';
  return null;
}

/**
 * The facts, rendered as CONSTRAINTS for the generator.
 *
 * §3: facts supplied as background get overridden by a strong prior; facts supplied as
 * constraints do not, and when they are absent the constraint is absent too - which is what
 * makes the null case behave rather than merely be quiet.
 *
 * A null location produces an explicit instruction to write no geography, not silence. Silence
 * is what the model fills in.
 */
export function constraintBlock(p: BusinessProfile): string {
  const lines: string[] = [];
  if (p.buyer) lines.push(`Who is choosing: ${p.buyer.value}`);
  if (p.sells) lines.push(`What they are choosing between: ${p.sells.value}`);
  lines.push(
    p.location
      ? `Where: ${p.location.value}`
      : 'Where: NOT KNOWN. Write the question with no city, state, region or country in it at all.',
  );
  return lines.join('\n');
}

/** True when the visitor edited it, which is what turns an extracted fact into a confirmed one. */
export function confirmFact(previous: Fact | null, typed: string): Fact | null {
  const next = fact(typed, 'confirmed');
  if (!next) return null;
  if (previous && previous.value === next.value) return previous;
  return next;
}
