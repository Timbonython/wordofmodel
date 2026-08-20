/**
 * Share of Model.
 *
 * THE UNIT OF THE DENOMINATOR IS ONE SURFACE ANSWERING ONE QUESTION. Not one API call,
 * not one row. Every surface is estimating the same quantity - the probability that this
 * surface names you when a buyer asks this question - and a call is one draw from it. One
 * draw gives 0 or 1. Three draws give 0, a third, two thirds or 1.
 *
 * So a surface sampled three times contributes a FRACTION to the numerator and exactly ONE
 * to the denominator. Two of three counts as two thirds. It is not thresholded to a yes,
 * which would put a cliff between one third and two thirds where a single wobbling sample
 * flips the headline. And it is not three rows, which would give Google three times the
 * weight of ChatGPT for no reason but our budget.
 *
 * That is also what lets sampling depth differ per surface - ChatGPT once at USD 0.35 an
 * answer, Perplexity three times at under a cent - without the metric changing meaning.
 *
 * WHAT IS EXCLUDED, AND WHY IT IS NOT THE SAME AS ZERO:
 *   no_answer    the surface was asked and showed nothing. Google AI Overviews do not fire
 *                on every query - measured at 8 of 15 samples on the first real run.
 *                Scored as an absence, Google's trigger rate would look like the
 *                subscriber's market position, and it moves every month for reasons that
 *                are not the market. Excluded, and reported as its own finding.
 *   refused      the surface declined. Also not evidence of absence.
 *   unextracted  not yet interpreted. Scoring these silently would compute a number over
 *                whatever happened to be parsed so far.
 *
 * THE BRANDED QUESTION IS THE CONTROL. It is nearly always 100%, it never counts toward
 * the unbranded score, and the gap between it and the other four is the headline finding
 * in every report.
 */

import 'server-only';
import { brandKey } from './score';
import type { QuestionSlot } from './scope';

export interface ScoredCapture {
  engine: string;
  question_id: string;
  slot: QuestionSlot;
  sample: number;
  outcome: 'answered' | 'no_answer' | 'refused';
  extracted_at: string | null;
  target_mentioned: boolean | null;
  target_recommended: boolean | null;
  brands_named: string[];
}

export interface Score {
  /** Surface-question pairs that produced at least one usable answer. The denominator. */
  pairs: number;
  /** Sum of per-pair mention rates. Fractional by design. */
  mentioned: number;
  recommended: number;
  /** null rather than 0 when nothing was answered: no data is not a score of zero. */
  share: number | null;
  recommendShare: number | null;
}

export interface ShareOfModel {
  overall: Score;
  bySurface: Array<{ surface: string; score: Score }>;
  /** The control, reported separately and never folded into overall. */
  branded: Score;
  competitors: Array<{ name: string; score: Score }>;
  excluded: { noAnswerPairs: number; refusedPairs: number };
  coverage: { captures: number; extracted: number };
}

const UNBRANDED: QuestionSlot[] = ['category', 'situation', 'alternatives', 'how_do_people'];

const round = (n: number) => Math.round(n * 10000) / 10000;

function groupIntoPairs(captures: ScoredCapture[]): ScoredCapture[][] {
  const pairs = new Map<string, ScoredCapture[]>();
  for (const c of captures) {
    const key = `${c.engine} ${c.question_id}`;
    const existing = pairs.get(key);
    if (existing) existing.push(c);
    else pairs.set(key, [c]);
  }
  return [...pairs.values()];
}

/**
 * Collapse each surface-question pair's samples into one fractional observation.
 *
 * This function IS the mixing rule. Nothing else in the build may compute a share.
 */
function scoreOver(
  captures: ScoredCapture[],
  hit: (c: ScoredCapture) => boolean,
  rec: (c: ScoredCapture) => boolean,
): Score {
  let pairs = 0;
  let mentioned = 0;
  let recommended = 0;

  for (const samples of groupIntoPairs(captures)) {
    // Only answered, extracted samples carry information. A pair with none of those is not
    // a zero - it is a pair we have nothing to say about, and it leaves the denominator.
    const usable = samples.filter((s) => s.outcome === 'answered' && s.extracted_at);
    if (!usable.length) continue;

    pairs += 1;
    mentioned += usable.filter(hit).length / usable.length;
    recommended += usable.filter(rec).length / usable.length;
  }

  return {
    pairs,
    mentioned: round(mentioned),
    recommended: round(recommended),
    share: pairs ? round(mentioned / pairs) : null,
    recommendShare: pairs ? round(recommended / pairs) : null,
  };
}

export function shareOfModel(input: {
  captures: ScoredCapture[];
  competitors: string[];
}): ShareOfModel {
  const all = input.captures;
  const unbranded = all.filter((c) => UNBRANDED.includes(c.slot));
  const branded = all.filter((c) => c.slot === 'branded');

  const mentionedHit = (c: ScoredCapture) => c.target_mentioned === true;
  const recommendedHit = (c: ScoredCapture) => c.target_recommended === true;
  const never = () => false;

  const surfaces = [...new Set(unbranded.map((c) => c.engine))].sort();

  // Competitors are scored on the IDENTICAL denominator as the target: the same pairs, the
  // same exclusions. A leaderboard where the subscriber and their competitors are measured
  // over different sets of answers is not a leaderboard.
  const competitorScore = (name: string) =>
    scoreOver(
      unbranded,
      (c) => (c.brands_named ?? []).some((b) => brandKey(b) === brandKey(name)),
      never,
    );

  const countPairsWhere = (pred: (s: ScoredCapture[]) => boolean) =>
    groupIntoPairs(all).filter(pred).length;

  return {
    overall: scoreOver(unbranded, mentionedHit, recommendedHit),
    bySurface: surfaces.map((surface) => ({
      surface,
      score: scoreOver(unbranded.filter((c) => c.engine === surface), mentionedHit, recommendedHit),
    })),
    branded: scoreOver(branded, mentionedHit, recommendedHit),
    competitors: input.competitors
      .map((name) => ({ name, score: competitorScore(name) }))
      .sort((a, b) => (b.score.share ?? 0) - (a.score.share ?? 0)),
    excluded: {
      noAnswerPairs: countPairsWhere((s) => s.every((c) => c.outcome === 'no_answer')),
      refusedPairs: countPairsWhere((s) => s.every((c) => c.outcome === 'refused')),
    },
    coverage: {
      captures: all.length,
      extracted: all.filter((c) => c.extracted_at).length,
    },
  };
}

/**
 * Google AI Overview coverage, counted per question as well as per sample.
 *
 * Feeds aiOverviewCoverage() in lib/method.ts, which puts it in the REPORT BODY. A low
 * rate is a finding about the subscriber's category - Google declining to answer means
 * classic search still carries the weight for their buyers - and stated plainly that is
 * intelligence rather than an excuse for a missing number.
 */
export function aiOverviewStats(captures: ScoredCapture[]): {
  questionsAnswered: number;
  questionsAsked: number;
  samplesAnswered: number;
  samplesTaken: number;
} {
  const aio = captures.filter((c) => c.engine === 'google_aio');
  const byQuestion = new Map<string, ScoredCapture[]>();
  for (const c of aio) {
    const existing = byQuestion.get(c.question_id);
    if (existing) existing.push(c);
    else byQuestion.set(c.question_id, [c]);
  }

  let questionsAnswered = 0;
  for (const samples of byQuestion.values()) {
    if (samples.some((c) => c.outcome === 'answered')) questionsAnswered++;
  }

  return {
    questionsAnswered,
    questionsAsked: byQuestion.size,
    samplesAnswered: aio.filter((c) => c.outcome === 'answered').length,
    samplesTaken: aio.length,
  };
}
