/**
 * What the headline number is, what it is not, and the floor beneath every change we report.
 *
 * THE HEADLINE IS A COUNT OF SURFACES THAT RECOMMEND YOU, not a percentage of answers that
 * name you. Named and recommended are different things, the gap between them is the finding
 * this product exists to deliver, and leading with the naming rate buried that gap one column
 * deep behind a number every competitor already reports.
 *
 * IT IS A STATUS, NOT A TREND, and that is a hard rule rather than a stylistic preference. It
 * runs 0 to 5. One surface changing its mind moves it twenty points, and the noise measurement
 * below says a surface changing its mind is something that happens on its own. So the report
 * never draws a month-on-month arrow on it. It says where you stand; the trend lines live on
 * figures with enough denominators under them to carry one.
 */

import 'server-only';

/**
 * Bump when the definition of the headline number changes. Stored on every report, compared by
 * delta.ts, and the reason a trend line cannot silently span two different meanings.
 *
 *   1  Share of Model. How often the brand was NAMED, across the four unbranded questions,
 *      as a fraction of surface-question pairs that produced a usable answer.
 *   2  Recommendation Share. How many surfaces RECOMMEND the brand when asked about it
 *      directly, as a count out of the surfaces that answered the branded question. Presence
 *      survives as supporting detail and keeps its own figure.
 */
export const METRIC_VERSION = 2;

/**
 * THE NOISE FLOOR, MEASURED RATHER THAN ASSUMED. 23 August 2026.
 *
 * Ten runs of one real question on one surface, back to back, market and wording unchanged:
 *
 *   Gemini, "how do people..."   named in 4 of 10 runs. Competitor set 87% stable, cited
 *                                domains 19%.
 *   Perplexity, "who is best"    named in 0 of 10. Competitor set 56%, domains 29%.
 *   ChatGPT, "who is best"       named in 0 of 10. Competitor set 63%, domains 32%. The
 *                                flagship, sampled once, USD 3.11 to find out.
 *
 * The shape of it: a brand solidly outside the answer is reported stably, twice at 0 of 10.
 * A brand near the boundary is a coin flip. The boundary is exactly where a subscriber who is
 * making progress lives, so the instrument is least reliable precisely where the product is
 * supposed to be most useful. And the COMPETITOR SET moves even when the brand mention does
 * not - a third to nearly half of the named companies change between identical runs - so the
 * leaderboard is noisier than the headline it sits under.
 *
 * The Gemini result is the one that matters. A pair sitting at roughly a 40% naming rate is a
 * coin weighted slightly against you, and the pipeline reads it three times and averages: it
 * contributes 0, a third, two thirds or 1. August recorded two thirds. An unchanged September
 * could record zero, which on Zapme's eighteen pairs takes presence from 9.3% to 5.6% - a drop
 * of forty percent of the figure, with nothing whatsoever happening in the market.
 *
 * So one pair is the floor. A change smaller than a whole pair is not distinguishable from the
 * instrument, and this build does not report it as movement. On surfaces sampled once, ChatGPT
 * and Grok, a boundary pair swings a full unit with no averaging at all, which is why the
 * floor is expressed in pairs rather than in percentage points.
 *
 * "We don't report a change we can't distinguish from noise" is a sentence no competitor in
 * this market can write, because none of them has measured their own floor. It is also the
 * same rule the rest of the build already follows: absence is a value, and so is uncertainty.
 */
export const NOISE_FLOOR_PAIRS = 1;

/** Rounding to match the fractional pair arithmetic in share.ts and delta.ts. */
const round = (n: number) => Math.round(n * 10000) / 10000;

/**
 * Does this change clear the floor?
 *
 * Compared on the absolute change in PAIRS, not in percentage points, because a pair is the
 * unit the instrument actually moves in. Exactly at the floor counts as clearing it: one whole
 * pair flipping is a real observation, it is simply the smallest real observation there is.
 */
export function clearsNoiseFloor(changeInPairs: number): boolean {
  return Math.abs(round(changeInPairs)) >= NOISE_FLOOR_PAIRS;
}

/**
 * What the report says where a number would have gone.
 *
 * Not an apology and not a hedge. A subscriber who is told "nothing moved by more than we can
 * measure" has been told something true and useful about their month, and told it by the only
 * product in the category that knows its own error bars.
 */
export const BELOW_FLOOR_NOTE =
  'Nothing changed by more than we can measure. Asked ten times with nothing altered in ' +
  'between, a single question can name you four times out of ten purely on its own, so a ' +
  'movement smaller than one whole reading is the instrument rather than your market. We ' +
  'report the ones that clear that line and stay quiet about the ones that do not.';

/** The method note's paragraph on the floor. Printed in every report. */
export const NOISE_FLOOR_NOTE =
  'We measured how much these surfaces move on their own before we reported any change at ' +
  'all. The same question, asked of the same surface ten times with nothing altered in ' +
  'between, named the brand four times out of ten on one surface and zero times out of ten on ' +
  'another, and the sources cited overlapped by less than a third between runs. So a change ' +
  'smaller than one whole reading is not reported as movement: it cannot be told apart from ' +
  'the surface changing its mind. That is why the number at the top of this report is a count ' +
  'of surfaces rather than a percentage with a decimal place on it.';
