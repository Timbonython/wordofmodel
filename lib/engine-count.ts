import type { FreeResult } from './types';

/**
 * How many engines actually answered, and the words that follow from it.
 *
 * WHY THIS EXISTS. The free scan attempts two engines and keeps the ones that answered
 * (app/api/scan/route.ts:251, filtered at :255), so a completed run can hold one capture. Ten
 * rendered sentences said "two engines", "both answers" or "neither engine" as literals, and on
 * a one-engine run every one of them was a confident lie to the visitor about what we had just
 * done on their behalf. The caption "One question, two engines" is the subscription argument in
 * miniature, so it was the worst possible sentence to be wrong.
 *
 * They are here together rather than fixed in place, because the defect was not any one
 * sentence - it was ten copies of a number nothing connected to the run. Ten literals become one
 * function, and a new sentence that needs the count has somewhere to get it.
 */

/**
 * THE COUNT, with a fallback that has an end date.
 *
 * `engines` did not exist before 5 Sep 2026, and /api/detect serves the stored FreeResult JSON
 * for 24 hours, so a cached row from before the change has `engines_run` and no `engines`.
 * buildVerdict now writes engines_run as engines.length, so the two cannot disagree on anything
 * written since. When no pre-5-Sep row can still be served, drop the `??` and the field with it.
 *
 * Deliberately NOT a default of 2. A guess that happens to be right most of the time is how the
 * literals survived this long.
 */
export function engineCount(free: Pick<FreeResult, 'engines' | 'engines_run'>): number {
  return free.engines?.length ?? free.engines_run;
}

/** "one engine" / "two engines". */
export function engineWord(n: number): string {
  return n === 1 ? 'one engine' : `${numberWord(n)} engines`;
}

/** "one answer" / "two answers". */
export function answerWord(n: number): string {
  return n === 1 ? 'one answer' : `${numberWord(n)} answers`;
}

/**
 * WHOLE CLAUSES, NOT SUBJECTS, and this cost a rewrite to learn.
 *
 * The first version returned a subject - "Neither engine" / "The engine that answered" - to drop
 * in front of "named a single company." It produced:
 *
 *     The engine that answered named a single company.
 *
 * which states the opposite of the sentence it replaced. "Neither engine named a single company"
 * carries its negation in the subject; swap the subject and the negation leaves with it. That is
 * the countPhrase defect again - a substitution that reads correctly on both sides of a boundary
 * it does not respect - and it was caught by running the one-engine case rather than by reading.
 *
 * So the negative findings return the whole clause. There is no arrangement of these that can
 * lose the "no".
 */
export function noCompanyNamed(n: number): string {
  return n === 1
    ? 'The one engine that answered named no company at all.'
    : 'Neither engine named a single company.';
}

export function noSourceCited(n: number): string {
  return n === 1
    ? 'The one engine that answered cited no source, which is its own finding.'
    : 'Neither engine cited a source, which is its own finding.';
}

/** "the answer" / "both answers", for a list of what is being held back. */
export function theAnswers(n: number): string {
  return n === 1 ? 'The answer' : 'Both answers';
}

/** "that engine" / "either engine", for "every company ___ named". */
export function eitherEngine(n: number): string {
  return n === 1 ? 'that engine' : 'either engine';
}

/* Small on purpose. Beyond two the free scan does not go, and a number spelled out past three
   would be a guess about a product decision nobody has made. */
function numberWord(n: number): string {
  return n === 2 ? 'two' : n === 3 ? 'three' : String(n);
}
