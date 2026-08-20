/**
 * The method note, in sentences a subscriber can read.
 *
 * Every claim in here is generated from what a run actually recorded - captures.geo_sent,
 * grounded, outcome, provider, model_used, and how many samples were taken - never from
 * what we intended. That is the whole point of the provenance columns: the note is a
 * report on the evidence, not a description of the design.
 *
 * Session 4 assembles the printed note. These are the fixed sentences and the
 * generators, written here in Session 3 because Session 3 is what established that
 * every one of them is true.
 */

import 'server-only';
import type { GeoSent } from './geo';

/**
 * The framing, and it is deliberately neither of the two easy extremes.
 *
 * Measured 20 Aug 2026 across three runs each of Perplexity, Gemini and Google AI
 * Overviews, plus fifteen browser observations: word overlap between repeat answers ran
 * 0.31 to 0.44, while the brands named held far steadier - Perplexity named the same
 * nine companies in all three runs and varied only on six at the tail. Google's own
 * overviews, read three times each in a clean browser, were "very similar" each time.
 *
 * So: the wording is rewritten every time, the substance mostly is not. Claiming the
 * answers are stable would be false. Claiming they are random would be worse, and would
 * make the whole product sound unreliable when the thing it measures is the steady part.
 */
export const VARIANCE_NOTE =
  'AI answers are non-deterministic in prose and largely stable in substance. Ask the ' +
  'same question twice and the wording is rewritten, but the companies named are mostly ' +
  'the same. We measure who gets named, which is the steady part.';

/**
 * The D4 sampling rule, in one sentence, because a rule that cannot be explained to a
 * subscriber is a rule that was made implicitly inside a function.
 */
export const SAMPLING_NOTE =
  "Google rewrites its AI Overview between searches, so we ask each of your questions " +
  'three times and record how often you appear. That question then counts once, at the ' +
  'share of samples that named you: two of three counts as two thirds. Surfaces we ask ' +
  'once count as one or nothing. No surface is weighted more heavily just because we ' +
  'sampled it more often.';

/**
 * Which surfaces were sampled how often. Honest about the two we cannot afford to
 * repeat: ChatGPT is roughly USD 0.35 a call and Grok USD 0.19, against under a cent
 * for Perplexity, so sampling depth follows cost rather than importance and the note
 * says so rather than implying an evenness that does not exist.
 */
export function samplingNote(samples: Record<string, number>): string {
  const single = Object.entries(samples).filter(([, n]) => n === 1).map(([s]) => s);
  if (!single.length) return '';
  return (
    `${single.join(' and ')} ${single.length === 1 ? 'is' : 'are'} asked once per question ` +
    'rather than three times, because they cost more per answer. Their results are a ' +
    'single reading rather than an average, and are likely to vary between months by more ' +
    'than the sampled surfaces do.'
  );
}

/** Why a surface has no location against it, generated from what was actually sent. */
export function geoNote(surfaceLabel: string, geo: GeoSent, marketLabel: string, region: string): string {
  if (geo.supported) return `${surfaceLabel}: asked as a buyer in ${marketLabel}.`;
  return (
    `${surfaceLabel}: ${geo.reason}, so the answer is location-neutral. Asked from a ` +
    `${region} network origin, held constant every month so month-to-month changes are ` +
    `not caused by where we asked from.`
  );
}

/**
 * GOOGLE AI OVERVIEW COVERAGE. A FINDING FOR THE REPORT BODY, NOT A METHOD NOTE.
 *
 * How often Google chose to answer a question with AI at all is intelligence about the
 * subscriber's category, and it belongs where they will read it. Google declining to
 * generate an overview for a question means classic search still carries the weight for
 * those buyers - which changes what they should do about it. Stated plainly that is
 * useful. Buried in a methodology footnote it reads as an excuse for a missing number.
 *
 * MEASURED on the first real run, 20 Aug 2026, eSIM category, US market, three samples
 * per question:
 *
 *   category        0/3   never
 *   alternatives    0/3   never
 *   situation       2/3   sometimes
 *   how_do_people   3/3   always
 *   branded         3/3   always
 *
 * Two things fall out of that. The rate is a real property of the question, not noise -
 * plain comparison questions got nothing and situational or branded ones always did. And
 * `situation` at 2/3 is exactly why the surface is sampled three times: a single sample
 * had a one in three chance of recording "Google shows nothing here" about a question
 * Google answers most of the time.
 *
 * The earlier bake-off, run on one category, showed 10 out of 10 and I called the trigger
 * risk smaller than feared. This category shows 8 of 15. One category was not enough to
 * generalise from.
 */
export function aiOverviewCoverage(input: {
  questionsAnswered: number;
  questionsAsked: number;
  samplesAnswered: number;
  samplesTaken: number;
}): { headline: string; whatItMeans: string } | null {
  const { questionsAnswered, questionsAsked, samplesAnswered, samplesTaken } = input;
  if (questionsAsked === 0) return null;

  const headline =
    `Google showed an AI Overview for ${questionsAnswered} of your ${questionsAsked} questions ` +
    `this month (${samplesAnswered} of ${samplesTaken} times we asked).`;

  if (questionsAnswered === questionsAsked) {
    return {
      headline,
      whatItMeans:
        'Google answers every question your buyers ask with AI, so the overview is the ' +
        'first thing they read. Being absent from it is being absent from the answer.',
    };
  }

  if (questionsAnswered === 0) {
    return {
      headline,
      whatItMeans:
        'Google is not answering these questions with AI at all. For your buyers, classic ' +
        'search results still carry the weight, and the ranked links matter more here than ' +
        'they do in most categories.',
    };
  }

  return {
    headline,
    whatItMeans:
      `Google answers some of these questions with AI and leaves the rest to ordinary ` +
      `search results. On the ${questionsAsked - questionsAnswered} it left alone, the ` +
      `ranked links are still what your buyers see.`,
  };
}

/**
 * The same fact in method-note form, for the questions excluded from the score.
 * A question Google did not answer is left out of the denominator rather than counted
 * against the subscriber - Google not answering is not Google not mentioning you.
 */
export function noAnswerNote(answered: number, asked: number): string {
  if (answered === asked) return '';
  return (
    `The ${asked - answered} ${asked - answered === 1 ? 'question' : 'questions'} Google did ` +
    'not answer are left out of the score rather than counted against you.'
  );
}

/** A surface that answered without searching answered from memory, and that is worth saying. */
export function ungroundedNote(surfaceLabel: string, count: number): string {
  if (!count) return '';
  return (
    `${surfaceLabel} answered ${count} ${count === 1 ? 'question' : 'questions'} without ` +
    'searching the web, from what it already knew. Those answers describe the market as of ' +
    'its training data rather than today.'
  );
}

/** Google does not say which model wrote an overview, so we do not either. */
export const AIO_PROVENANCE_NOTE =
  'Google does not disclose which model writes an AI Overview, so no model is recorded ' +
  'for that surface. Every other surface records the model that actually answered, read ' +
  'from its own response.';

/**
 * The citation caveat, and it is the least comfortable sentence in the note.
 *
 * Measured: Gemini shared ONE cited domain out of seven between two runs of the same
 * question. Cited domains are by far the noisiest thing we collect, and the offer sheet
 * sells them as "who owns the answer". Saying so is better than a subscriber acting on a
 * domain list that would have looked different ten minutes later.
 */
export const CITATION_CAVEAT =
  'Cited sources vary much more between answers than the companies named do. Treat the ' +
  'source list as the kind of place these answers come from, not as a fixed list.';
