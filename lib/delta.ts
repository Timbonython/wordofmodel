/**
 * What moved since last month, and what we refuse to claim moved.
 *
 * The offer sheet calls this the retention mechanism: "without it, month two has nothing to
 * say". It is also the single easiest place in the product to publish a lie, because a
 * delta is a subtraction and a subtraction does not know whether its two operands describe
 * the same thing.
 *
 * FOUR WAYS THE TWO OPERANDS CAN DIFFER WITHOUT THE MARKET MOVING. Each is a configuration
 * change already flagged in a migration, and delta is where they all come home:
 *
 *   the competitor set   0002. A competitor added in month three did not overtake anybody.
 *   the surface set      0005. Four surfaces and five are different populations.
 *   the sampling depth   0007. Three samples narrow the error bars on their own.
 *   a lost capture       a partial run's figures are computed over fewer pairs.
 *
 * And a fifth the migrations do not cover: a REWRITTEN QUESTION. 0002 makes changing a
 * question mean a new row, so the question_id differs and the pair is simply not the same
 * question. That is why comparability is checked per question id rather than per slot.
 *
 * A SIXTH, and the only one that can move a number without anything about the RUN
 * changing at all: THE EXTRACTION VERSION. Same questions, same surfaces, same samples,
 * same stored answers - read by a different version of our own reading. captures carries
 * extraction_version precisely because a re-parse is cheap and will happen; the prompt
 * changed twice on 21 Aug 2026 alone. Two months read by different versions differ in how
 * we interpreted them, and a subtraction across that is comparing readings rather than
 * movement. It is the same rule as the other five, applied to us instead of to the run.
 *
 * A SEVENTH, and the first that changes what the headline MEANS rather than how it was
 * gathered: THE METRIC VERSION. The headline was Share of Model, a naming rate across the
 * unbranded questions. It is now Recommendation Share, a count of surfaces that recommend the
 * brand when asked directly. Those are different numbers over different denominators, and a
 * trend line spanning the change would compare one to the other and call it movement.
 * threshold_version would not have caught it: that versions the mapping from numbers to a
 * label, and nothing in this file has ever read it.
 *
 *
 * THE RULE. A surface is compared only when everything about how it was measured is
 * identical in both months. The overall figure is compared only when every surface is. When
 * the overall is suppressed the per-surface figures that DO hold are still shown, because a
 * subscriber should not lose their entire delta over one lost capture - and the suppression
 * is named, with its reason, rather than the number quietly going missing.
 */

import 'server-only';
import { brandKey } from './score';
import { clearsNoiseFloor } from './metric';
import { SURFACES, type Surface } from './scope';
import type { ScoredCapture } from './share';

/** "Grok", not "grok". The subscriber never sees an internal key. */
const label = (surface: string) => SURFACES[surface as Surface]?.label ?? surface;

/** Everything about one run that delta needs to decide comparability. */
export interface RunSnapshot {
  runId: string;
  periodStart: string;
  status: string;
  /** The headline definition this month was produced under. Null for a month never reported. */
  metricVersion: number | null;
  surfaces: string[];
  samples: Record<string, number>;
  captures: ScoredCapture[];
  competitors: string[];
}

export interface SurfaceDelta {
  surface: string;
  comparable: boolean;
  /** Compared, and the difference was too small to tell apart from the surface itself. */
  belowFloor?: boolean;
  /** Plain language, shown to the subscriber where the number would have been. */
  reason?: string;
  /** Fractional numerator out of pairs, this month and last. Only when comparable. */
  now?: number;
  before?: number;
  pairs?: number;
  change?: number;
}

export interface DeltaReport {
  previousPeriod: string;
  /** null when every surface is comparable: nothing to explain. */
  configurationChanges: string[];
  overall: {
    comparable: boolean;
    reason?: string;
    now?: number;
    before?: number;
    change?: number;
    /** Comparable, and smaller than the measured floor. Reported as steady, not as a number. */
    belowFloor?: boolean;
  };
  bySurface: SurfaceDelta[];
  endorsement: { comparable: boolean; reason?: string; now?: number; before?: number; asked?: number };
  competitors: Array<{ name: string; now: number; before: number; change: number }>;
  competitorsSuppressed: string[];
}

const UNBRANDED = new Set(['category', 'situation', 'alternatives', 'how_do_people']);

/** Pairs a surface actually delivered a usable answer for, keyed by question. */
function usablePairs(caps: ScoredCapture[], surface: string, branded: boolean): Map<string, ScoredCapture[]> {
  const out = new Map<string, ScoredCapture[]>();
  for (const c of caps) {
    if (c.engine !== surface) continue;
    if (branded ? c.slot !== 'branded' : !UNBRANDED.has(c.slot)) continue;
    const existing = out.get(c.question_id);
    if (existing) existing.push(c);
    else out.set(c.question_id, [c]);
  }
  return out;
}

/** The fractional contribution of one surface: sum over pairs of (hits / usable samples). */
function numeratorFor(
  pairs: Map<string, ScoredCapture[]>,
  hit: (c: ScoredCapture) => boolean,
): { numerator: number; pairs: number } {
  let numerator = 0;
  let n = 0;
  for (const samples of pairs.values()) {
    const usable = samples.filter((s) => s.outcome === 'answered' && s.extracted_at);
    if (!usable.length) continue;
    n += 1;
    numerator += usable.filter(hit).length / usable.length;
  }
  return { numerator: round(numerator), pairs: n };
}

const round = (n: number) => Math.round(n * 10000) / 10000;

/**
 * Which extraction versions read this surface's usable answers, as one comparable string.
 *
 * A set rather than a max, because "all v3" and "half v2, half v3" are different states and
 * the second is worth refusing to compare even against another month that also holds both.
 * Null when the surface has no usable answers: there is nothing to have read, and the caller
 * already refuses that case with a better sentence than this one would produce.
 */
function versionsOf(pairs: Map<string, ScoredCapture[]>): string | null {
  const versions = new Set<number>();
  for (const samples of pairs.values()) {
    for (const c of samples) {
      if (c.outcome === 'answered' && c.extracted_at) versions.add(c.extraction_version ?? 0);
    }
  }
  return versions.size ? [...versions].sort((a, b) => a - b).join(',') : null;
}

/**
 * Why this surface cannot be compared, or null if it can.
 *
 * Every check is about HOW it was measured, never about what it found. A surface that
 * simply scored differently is comparable - that is the whole point.
 */
function surfaceObjection(now: RunSnapshot, before: RunSnapshot, surface: string): string | null {
  if (!before.surfaces.includes(surface)) {
    return `We started measuring ${label(surface)} this month, so there is nothing to compare it against yet.`;
  }
  if (!now.surfaces.includes(surface)) {
    return `We did not measure ${label(surface)} this month.`;
  }
  if (now.samples[surface] !== before.samples[surface]) {
    const times = (n: number | undefined) => (n === 1 ? 'once' : `${n} times`);
    return (
      `We asked ${label(surface)} ${times(now.samples[surface])} this month and ` +
      `${times(before.samples[surface])} last month. Those are not the same measurement, so we ` +
      `are not putting a change against it.`
    );
  }

  const nowQs = usablePairs(now.captures, surface, false);
  const beforeQs = usablePairs(before.captures, surface, false);

  // The sixth path, and the one that leaves no trace in the run. Everything about the two
  // months can be identical and the numbers still differ, because we re-read the answers
  // with a different version of the extraction prompt. Compared per surface like the rest,
  // and stated in the same terms: what changed was ours, not theirs.
  const nowVersions = versionsOf(nowQs);
  const beforeVersions = versionsOf(beforeQs);
  if (nowVersions && beforeVersions && nowVersions !== beforeVersions) {
    return (
      `We improved how we read answers between these two months, so ${label(surface)}'s two ` +
      `figures were produced by different versions of that reading. The difference would ` +
      `partly be us rather than your market, so we are not putting a change against it. The ` +
      `answers themselves are unchanged and are printed in full below.`
    );
  }
  const nowKeys = [...nowQs.keys()].sort().join(',');
  const beforeKeys = [...beforeQs.keys()].sort().join(',');
  if (!nowKeys || !beforeKeys) {
    return `${label(surface)} gave us nothing usable in one of the two months, so there is no change to report.`;
  }
  if (nowKeys !== beforeKeys) {
    // Either a question was rewritten - 0002 makes that a new row and a new id - or a
    // capture was lost, which is what a partial run means. Both change the base.
    return (
      `${label(surface)} answered a different set of your questions in the two months, so ` +
      `its two figures would be counting different things.`
    );
  }
  return null;
}

export function computeDelta(now: RunSnapshot, before: RunSnapshot): DeltaReport {
  const configurationChanges: string[] = [];

  // THE METRIC ITSELF CHANGED, so nothing below is comparable and no amount of per surface
  // care would make it so. Returned before any arithmetic rather than suppressed line by line:
  // a report that compares half of two different metrics is worse than one that says plainly
  // that the history restarts here.
  if (
    now.metricVersion !== null &&
    before.metricVersion !== null &&
    now.metricVersion !== before.metricVersion
  ) {
    const reason =
      `We changed what the headline number measures between these two months. It used to be ` +
      `how often you were named; it is now how many surfaces recommend you when asked about ` +
      `you directly. Those are different measurements, so putting a change against them would ` +
      `be comparing two different things. Your history starts again from this month, and the ` +
      `answers behind both months are unchanged and still printed below.`;
    return {
      previousPeriod: before.periodStart,
      configurationChanges: [reason],
      overall: { comparable: false, reason },
      bySurface: [],
      endorsement: { comparable: false, reason },
      competitors: [],
      competitorsSuppressed: [],
    };
  }

  const surfaces = [...new Set([...now.surfaces, ...before.surfaces])].sort();
  const bySurface: SurfaceDelta[] = surfaces.map((surface) => {
    const objection = surfaceObjection(now, before, surface);
    if (objection) {
      configurationChanges.push(objection);
      return { surface, comparable: false, reason: objection };
    }
    const n = numeratorFor(usablePairs(now.captures, surface, false), (c) => c.target_mentioned === true);
    const b = numeratorFor(usablePairs(before.captures, surface, false), (c) => c.target_mentioned === true);
    const change = round(n.numerator - b.numerator);

    // BELOW THE FLOOR IS NOT MOVEMENT. Measured 23 Aug 2026: the same question asked of the
    // same surface ten times, nothing altered, named the brand four times out of ten. A pair
    // that sits near the boundary contributes a different amount every month on its own, so a
    // change smaller than one whole pair is the instrument and not the market. Reported as
    // steady rather than as a number, because printing "down 0.3" invites a subscriber to
    // explain something that did not happen.
    return {
      surface,
      comparable: true,
      now: n.numerator,
      before: b.numerator,
      pairs: n.pairs,
      change,
      belowFloor: !clearsNoiseFloor(change),
    };
  });

  // THE OVERALL FIGURE NEEDS EVERY SURFACE, because it is a sum over all of them. One
  // suppressed surface makes the total a comparison between a five-surface month and a
  // four-surface month, which is the surface-set trap in a different costume.
  const suppressed = bySurface.filter((s) => !s.comparable);
  const overall = suppressed.length
    ? {
        comparable: false,
        // COPY, not a log line. The subscriber reads this where a number should have been,
        // and a sentence that reads like a stack trace tells them the number is missing
        // without telling them we know why.
        reason:
          `We are not putting a single number on this month's change. ` +
          `${suppressed.map((s) => label(s.surface)).join(' and ')} ` +
          `${suppressed.length === 1 ? 'was not measured' : 'were not measured'} the same way ` +
          `in both months, and a total that mixes the two would move for a reason that is not ` +
          `your market. The surfaces we can compare are below, and they are compared properly.`,
      }
    : (() => {
        const sum = (r: RunSnapshot) =>
          surfaces.reduce(
            (t, s) => t + numeratorFor(usablePairs(r.captures, s, false), (c) => c.target_mentioned === true).numerator,
            0,
          );
        const n = round(sum(now));
        const b = round(sum(before));
        const change = round(n - b);
        return { comparable: true, now: n, before: b, change, belowFloor: !clearsNoiseFloor(change) };
      })();

  // Endorsement is a COUNT of surfaces, so it is comparable only when the same surfaces
  // answered the branded question in both months. A count over four is not a count over
  // five, and expressing either as a percentage is what this metric exists to avoid.
  const endorsement = (() => {
    const answered = (r: RunSnapshot) =>
      surfaces.filter((s) => {
        const pairs = usablePairs(r.captures, s, true);
        return [...pairs.values()].some((v) => v.some((c) => c.outcome === 'answered' && c.extracted_at));
      });
    const nowAnswered = answered(now).sort();
    const beforeAnswered = answered(before).sort();
    if (nowAnswered.join(',') !== beforeAnswered.join(',')) {
      return {
        comparable: false,
        reason:
          'A different set of surfaces answered the question about you by name in the two ' +
          'months, so the count is not comparable. A count out of four is not a count out of five.',
      };
    }
    const count = (r: RunSnapshot) =>
      nowAnswered.filter((s) =>
        [...usablePairs(r.captures, s, true).values()].some((v) =>
          v.some((c) => c.outcome === 'answered' && c.extracted_at && c.target_recommended === true),
        ),
      ).length;
    return { comparable: true, now: count(now), before: count(before), asked: nowAnswered.length };
  })();

  // 0002's rule, applied. A competitor added or removed between runs did not overtake or
  // retreat, it was configured. Only the ones live in both months are compared, and only
  // when the overall base is comparable, because their denominator is the same as ours.
  const nowSet = new Set(now.competitors.map(brandKey));
  const beforeSet = new Set(before.competitors.map(brandKey));
  const competitorsSuppressed: string[] = [];
  const competitors: DeltaReport['competitors'] = [];

  for (const name of now.competitors) {
    if (!beforeSet.has(brandKey(name))) {
      competitorsSuppressed.push(
        `${name} was added to your competitor set this month. It has not gained ground on you; ` +
          `it was not being measured before.`,
      );
      continue;
    }
    if (!overall.comparable) continue;
    const named = (r: RunSnapshot) =>
      round(
        surfaces.reduce(
          (t, s) =>
            t +
            numeratorFor(usablePairs(r.captures, s, false), (c) =>
              (c.brands_named ?? []).some((b) => brandKey(b) === brandKey(name)),
            ).numerator,
          0,
        ),
      );
    const n = named(now);
    const b = named(before);
    competitors.push({ name, now: n, before: b, change: round(n - b) });
  }
  for (const name of before.competitors) {
    if (!nowSet.has(brandKey(name))) {
      competitorsSuppressed.push(
        `${name} was removed from your competitor set this month. Its absence below is not a retreat.`,
      );
    }
  }

  competitors.sort((a, b) => b.now - a.now);

  return {
    previousPeriod: before.periodStart,
    configurationChanges,
    overall,
    bySurface,
    endorsement,
    competitors,
    competitorsSuppressed,
  };
}
