/**
 * Presence and endorsement: the two-number diagnosis at the top of the report.
 *
 * WHY TWO NUMBERS AND NOT ONE. A blended naming rate of 9.3% says "do more marketing".
 * The same data split says: five surfaces named you when asked, one endorsed you. That is
 * the models having formed a view and it being unfavourable, which is a different diagnosis
 * with a different fix. Blending them destroys the distinction, and the distinction is the
 * finding.
 *
 * NAMING, CHANGED 23 AUG 2026. The headline metric is **Recommendation Share**, a count of
 * the surfaces that recommend the brand when asked about it directly. **Presence** is the
 * naming rate and is supporting detail. The old name, Share of Model, is retired: Jellyfish
 * holds Share of Model(TM) in this category, and the number it named was the wrong one to
 * lead with anyway. Never abbreviate Recommendation Share to a percentage with a decimal on
 * it - it is a count out of five, and see lib/metric.ts for why that matters.
 *
 * THE HEADLINE IS A COUNT, NEVER A PERCENTAGE. "1 of 5 surfaces recommend you". Five
 * observations cannot carry a percentage: one engine changing its mind would swing one
 * twenty points with nothing real behind it, and on 23 Aug 2026 we measured a single
 * question naming a brand four times out of ten with nothing changed in between. The
 * denominator is always shown, the same way the AI Overview coverage line shows "4 of 5
 * questions".
 */

import 'server-only';

/**
 * THE THRESHOLDS. Written down here, printed in the method note, and CHOSEN RATHER THAN
 * DERIVED - which the method note says in those words.
 *
 * A categorical label pulled from two continuous numbers is a guess wearing a label unless
 * the rule is stated, and a subscriber must never move category for a reason we cannot
 * explain. So the lines are absolute and fixed.
 *
 * WHY NOT RELATIVE TO THE COMPETITOR SET, which would be derived rather than arbitrary and
 * was the tempting option: because the competitor set is configuration. A subscriber who
 * adds a weak competitor would drop the median and could change category without anything
 * in the market moving. That is precisely the failure 0002, 0005 and 0007 each warn about,
 * and it is worse than an arbitrary line that at least holds still.
 *
 * Stability beats derivation here. Both numbers are printed alongside the label so anyone
 * can check the arithmetic.
 */
/**
 * Bump when any threshold below changes.
 *
 * Stored on every report the way extraction_version sits on every capture. The lines are
 * chosen rather than calculated, and at ten subscribers they will be revisited against a
 * real distribution - at which point a subscriber's history must not silently re-label
 * itself. A report generated under version 1 keeps saying what it said.
 */
export const THRESHOLD_VERSION = 1;

export const PRESENCE_HIGH = 0.25; // named in more than one unbranded answer in four
export const ENDORSEMENT_HIGH = 3; // endorsed by a majority of the surfaces that answered
export const RECOGNITION_LOW = 3; // named by fewer than this when asked by name

export type Diagnosis =
  | 'unknown'
  | 'known_not_endorsed'
  | 'endorsed_not_surfacing'
  | 'surfacing_not_endorsed'
  | 'established';

export interface DiagnosisInput {
  /** The naming rate across the four unbranded questions. null when nothing was answered. */
  presence: number | null;
  /** Surfaces that NAMED the brand on the branded question. */
  recognised: number;
  /** Surfaces that RECOMMENDED it on the branded question. */
  endorsed: number;
  /** Surfaces that answered the branded question at all. The denominator for both counts. */
  askedDirectly: number;
}

export interface DiagnosisResult {
  /** For storage and comparison between months. NEVER rendered. */
  kind: Diagnosis;
  /**
   * What the subscriber reads as the label. The enum is a database value; a report that
   * printed "endorsed_not_surfacing" at somebody paying USD 149 a month would be the
   * product showing its plumbing.
   */
  label: string;
  /** The first thing the subscriber reads. Two clauses: what is true, then what it means. */
  headline: string;
  meaning: string;
}

/** "1 recommends you", "2 recommend you", and "None recommend you" rather than "0 recommend". */
const endorsedClause = (n: number) =>
  n === 0 ? 'None recommend you' : `${n} ${n === 1 ? 'recommends' : 'recommend'} you`;

/** "All 5 of 5" is right; "All 4 of 5" is not. */
const knownPhrase = (recognised: number, asked: number) =>
  recognised === asked ? `All ${recognised} of ${asked} surfaces know you` : `${recognised} of ${asked} surfaces know you`;

/**
 * RECOGNITION IS A GATE, NOT AN AXIS, and that is why there are five states rather than a
 * tidy four quadrants.
 *
 * The branded question is the control: it is nearly always 100%, so it carries almost no
 * information - until it does not, and then it is the most urgent thing in the report.
 * Surfaces that cannot describe a company when asked about it by name is a different and
 * worse problem than surfaces that know it and stay quiet, and forcing it into a quadrant
 * grid would bury it.
 *
 * Zapme's first run is the case that shaped this: presence 9.3% and endorsement 1 of 5 puts
 * it in the low-low corner, which a four-quadrant model would label "invisible". It is not
 * invisible. All five surfaces named it when asked. It is known and unendorsed, which is
 * the opposite advice.
 */
export function diagnose(input: DiagnosisInput): DiagnosisResult {
  return describe(classify(input), input);
}

/**
 * Which of the five states these two numbers put a subscriber in, at TODAY's thresholds.
 *
 * Split out from the copy on purpose, and the split is what makes 0008's promise real. A
 * report stores the kind it was issued under; rendering it again months later calls
 * describe() with the stored kind rather than classify(), so a threshold revised at ten
 * subscribers cannot reach back and re-label a report somebody has already read. The
 * classification is versioned by THRESHOLD_VERSION; the sentences are not, because they
 * say the same thing about the same state whenever they are read.
 */
export function classify(input: DiagnosisInput): Diagnosis {
  const { presence, recognised, endorsed, askedDirectly } = input;
  if (askedDirectly > 0 && recognised < RECOGNITION_LOW) return 'unknown';
  if (presence === null) return endorsed >= ENDORSEMENT_HIGH ? 'endorsed_not_surfacing' : 'known_not_endorsed';
  const high = presence >= PRESENCE_HIGH;
  const backed = endorsed >= ENDORSEMENT_HIGH;
  if (high && backed) return 'established';
  if (high && !backed) return 'surfacing_not_endorsed';
  if (!high && backed) return 'endorsed_not_surfacing';
  return 'known_not_endorsed';
}

/** The label and the two sentences for one state. Pure copy, given the numbers. */
export function describe(kind: Diagnosis, input: DiagnosisInput): DiagnosisResult {
  const { presence, recognised, endorsed, askedDirectly } = input;

  if (kind === 'unknown') {
    return {
      kind: 'unknown',
      label: 'Not yet known',
      headline: `Only ${recognised} of ${askedDirectly} surfaces could tell a buyer who you are.`,
      meaning:
        'Asked about you by name, most of these surfaces had nothing to say. That is not a ' +
        'ranking problem, it is an evidence problem: there is not enough about you on the ' +
        'open web for them to draw on. Everything else in this report is downstream of it.',
    };
  }

  // No unbranded question was answered by anything, so there is no presence to be high or
  // low. Falling through to a presence-based label would state a finding we do not have -
  // the same class of error as scoring a no_answer as an absence. Keyed off presence rather
  // than off the kind, because both of the kinds it can produce have an ordinary meaning
  // too and this is the sentence that has to win when there is no presence figure at all.
  if (presence === null) {
    return {
      kind,
      label: kind === 'endorsed_not_surfacing' ? 'Recommended, but not coming up' : 'Known, not recommended',
      headline: `${knownPhrase(recognised, askedDirectly)}. ${endorsedClause(endorsed)}.`,
      meaning:
        'None of your unbranded questions were answered this month, so there is no ' +
        'presence figure to report. What is above is only what the surfaces said when ' +
        'asked about you directly.',
    };
  }

  if (kind === 'established') {
    return {
      kind: 'established',
      label: 'Established',
      headline: `You come up unprompted, and ${endorsed} of ${askedDirectly} surfaces endorse you by name.`,
      meaning:
        'You are in the conversation and the answers are favourable. The work from here is ' +
        'holding position and watching who is moving toward you.',
    };
  }

  if (kind === 'surfacing_not_endorsed') {
    return {
      kind: 'surfacing_not_endorsed',
      label: 'Coming up, not recommended',
      headline: `You come up unprompted, but only ${endorsed} of ${askedDirectly} surfaces ${endorsed === 1 ? 'endorses' : 'endorse'} you by name.`,
      meaning:
        'These surfaces know you well enough to mention you and are not willing to ' +
        'recommend you. That is a reputation problem rather than a visibility one, and ' +
        'more coverage will not fix it. What they cite when hedging is the place to look.',
    };
  }

  if (kind === 'endorsed_not_surfacing') {
    return {
      kind: 'endorsed_not_surfacing',
      label: 'Recommended, but not coming up',
      headline: `${endorsed} of ${askedDirectly} surfaces ${endorsed === 1 ? 'endorses' : 'endorse'} you by name, but you rarely come up unprompted.`,
      meaning:
        'When a buyer asks about you the answer is good. When they ask about the category ' +
        'you are not in it. That is a distribution problem: the favourable material exists ' +
        'but is not attached to the questions buyers actually ask.',
    };
  }

  return {
    kind: 'known_not_endorsed',
    label: 'Known, not recommended',
    headline: `${knownPhrase(recognised, askedDirectly)}. ${endorsedClause(endorsed)}.`,
    meaning:
      'They know who you are and decline to put you forward. That is a different problem ' +
      'from never having been heard of, and it points somewhere different: the models have ' +
      'formed a view from what is on the open web, and it is not favourable enough to act ' +
      'on. More visibility will not move this. Changing what there is to read will.',
  };
}

/**
 * The thresholds, in plain language, for the method note.
 *
 * Printed in every report. If a subscriber changes category between months, this paragraph
 * is what lets them see why - and check whether the change was theirs or ours.
 */
export const THRESHOLD_NOTE =
  `We call presence high when you are named in more than one unbranded answer in four ` +
  `(${Math.round(PRESENCE_HIGH * 100)}%), and endorsement strong when a majority of the ` +
  `surfaces that answered your branded question recommend you (${ENDORSEMENT_HIGH} of 5). ` +
  `Those two lines are chosen, not calculated: there is no natural boundary in either ` +
  `number, and we would rather pick a line and hold it still than move yours because your ` +
  `competitor set changed. Both figures are printed above the label so you can check them.`;
