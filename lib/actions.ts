/**
 * What to do about it - assembled from what the surfaces already said.
 *
 * THE RULE THIS MODULE EXISTS TO HOLD: the report does not invent advice. Every action is
 * a surface's own sentence, quoted, with our line about what would change it. Nothing here
 * writes a recommendation from scratch, and nothing here reads an answer - the extraction
 * pass did that and stored the sentence on the capture.
 *
 * It works because the engines volunteer their reasoning. Zapme's first run: five surfaces
 * knew them, one recommended them, and three of the four that stopped short said why
 * without being asked - ChatGPT could not find enough independent feedback, Perplexity
 * called the evidence mixed and still fairly limited, Google read out a 3.2-star Play Store
 * rating. That is a diagnosis from the systems the buyer is actually asking, and it beats
 * anything we could write about it.
 *
 * THE SPLIT, AND THE SUBSCRIBER CAN SEE IT ON THE PAGE. In quotation marks with a surface's
 * name against it: theirs, verbatim, from an answer printed in full further down the same
 * report. Everything after "What would change it": ours, fixed copy per reason, the same
 * sentence for every subscriber who gets that reason. No model writes a word of it.
 */

import 'server-only';

/**
 * The closed set, mirrored by the check constraint in 0009. Closed because each one selects
 * a remedy sentence, and an open vocabulary would mean either a remedy we did not write or
 * a fallback that says nothing.
 */
export type HedgeReason =
  | 'evidence_thin'
  | 'rating_low'
  | 'reputation_mixed'
  | 'small_or_new'
  | 'coverage_gap'
  | 'price'
  | 'other';

export const HEDGE_REASONS: readonly HedgeReason[] = [
  'evidence_thin',
  'rating_low',
  'reputation_mixed',
  'small_or_new',
  'coverage_gap',
  'price',
  'other',
];

export function isHedgeReason(v: unknown): v is HedgeReason {
  return typeof v === 'string' && (HEDGE_REASONS as readonly string[]).includes(v);
}

/**
 * Sharpest first, and the order is a rule rather than a judgment made per report.
 *
 * A specific published number leads, because it is checkable, it is public, and it is being
 * read aloud to buyers today: Google quoting 3.2 stars is a different kind of problem from
 * a surface feeling unsure about you, and burying it under a general one would be the
 * report choosing the vaguer finding. Reasons that name something concrete come next.
 * 'other' is last: it is real, it is quoted, but we have nothing specific to add to it.
 */
const PRIORITY: Record<HedgeReason, number> = {
  rating_low: 0,
  reputation_mixed: 1,
  coverage_gap: 2,
  evidence_thin: 3,
  small_or_new: 4,
  price: 5,
  other: 6,
};

/**
 * What would change it. Ours, fixed, and deliberately about the SENTENCE rather than about
 * the business: we know what the surface said and we do not know what is true, so every
 * line below is written to be true of any subscriber who draws that reason.
 *
 * `domains` is what that same surface actually cited in the answers we read this month, so
 * the one place a remedy gets specific is a place the evidence supports.
 */
export function whatWouldChangeIt(reason: HedgeReason, ctx: { domains: string[] }): string {
  const reading = ctx.domains.length
    ? ` It is reading ${listOf(ctx.domains.slice(0, 3))} on your category this month.`
    : '';

  switch (reason) {
    case 'evidence_thin':
      return (
        'What would change it: independent write-ups it can find. This is not a complaint ' +
        'about your product. It is a surface saying that outside your own site, there is ' +
        'not much about you to read.' + reading
      );
    case 'rating_low':
      return (
        'What would change it: the number itself. This is a public score being quoted back ' +
        'to buyers, and the answer will quote whatever it says next month. The rating is ' +
        'what the surface reads; it is not the surface’s opinion of you, and it is the ' +
        'most directly fixable thing in this report.'
      );
    case 'reputation_mixed':
      return (
        'What would change it: a more recent record. The surface is repeating what it can ' +
        'find written about dealing with you, so this moves when what is written moves, ' +
        'and the answers follow the record rather than leading it.' + reading
      );
    case 'small_or_new':
      return (
        'What would change it: visible scale. Named customers, published numbers, coverage ' +
        'that treats you as established. The surface is not doubting you, it is saying it ' +
        'cannot see how big you are, and it will not put forward a company it cannot size.'
      );
    case 'coverage_gap':
      return (
        'What would change it: either the gap, or a public statement plain enough that a ' +
        'model reading your site cannot miss it. Check which one applies before you spend ' +
        'anything. A limitation you no longer have is the cheaper of the two to fix.'
      );
    case 'price':
      return (
        'What would change it: a price a machine can read. A surface that cannot find what ' +
        'you cost will hedge on value rather than guess, and it will keep hedging while the ' +
        'number is behind a form.'
      );
    case 'other':
      return (
        'What would change it: the sentence says it. This is the specific objection this ' +
        'surface will keep repeating to buyers until the record it reads from says something ' +
        'else.'
      );
  }
}

/**
 * The same remedy, said once. Two surfaces often stop short for the same reason - on the
 * first real run ChatGPT and Perplexity both could not find enough independent evidence -
 * and printing the identical paragraph twice makes fixed copy look like padding, which
 * makes the reader trust the quotes above it less. The second occurrence points at the
 * first instead, which is also the more useful reading: two surfaces, one problem.
 */
const SHORT: Record<HedgeReason, string> = {
  evidence_thin: 'independent write-ups it can find',
  rating_low: 'the published number itself',
  reputation_mixed: 'a more recent record to read',
  small_or_new: 'visible scale it can see',
  coverage_gap: 'the gap closed, or said plainly enough that a model cannot miss it',
  price: 'a price a machine can read',
  other: 'what the sentence itself names',
};

function alsoWouldChangeIt(reason: HedgeReason, firstLabel: string, ctx: { domains: string[] }): string {
  const reading = ctx.domains.length
    ? ` It is reading ${listOf(ctx.domains.slice(0, 3))} on your category this month.`
    : '';
  return `What would change it: the same thing ${firstLabel} is asking for: ${SHORT[reason]}.${reading}`;
}

/** "a.com, b.com and c.com" - an Oxford-free list, because it is read aloud in a sentence. */
function listOf(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export interface HedgeCandidate {
  surface: string;
  label: string;
  quote: string;
  reason: HedgeReason;
  /** Cited domains for this surface this month, for the one specific clause in the remedy. */
  domains: string[];
  /** Branded-question hedges lead: that is the question asked directly about them. */
  branded: boolean;
  /** Which reading this was. The tiebreak, and the reason the report is reproducible. */
  sample: number;
}

export interface ReportAction {
  surface: string;
  label: string;
  quote: string;
  reason: HedgeReason;
  whatWouldChangeIt: string;
}

/**
 * One action per surface, sharpest reason first.
 *
 * ONE PER SURFACE IS THE POINT. Google sampled three times will hedge three times, in three
 * rewordings of the same objection, and printing all three would make a sampling depth look
 * like a pile-on. The branded question wins the tie because it is the question asked
 * directly about them; after that the sharpest reason wins.
 *
 * AND THEN THE LOWEST SAMPLE NUMBER, which is not a detail. Google's three readings of the
 * branded question produced two rating_low quotes; without a third tiebreak, which one the
 * subscriber read would depend on the order Postgres happened to return the rows in, and
 * re-rendering the same stored run could quietly change the report. Every input here is
 * already fixed on the capture, so the output has no business moving.
 */
export function buildActions(candidates: HedgeCandidate[]): ReportAction[] {
  const bySurface = new Map<string, HedgeCandidate>();
  for (const c of candidates) {
    if (!c.quote.trim()) continue;
    const held = bySurface.get(c.surface);
    if (!held || beats(c, held)) bySurface.set(c.surface, c);
  }

  const ordered = [...bySurface.values()].sort(
    (a, b) => PRIORITY[a.reason] - PRIORITY[b.reason] || a.label.localeCompare(b.label),
  );

  const statedFirstBy = new Map<HedgeReason, string>();
  return ordered.map((c) => {
    const first = statedFirstBy.get(c.reason);
    if (!first) statedFirstBy.set(c.reason, c.label);
    return {
      surface: c.surface,
      label: c.label,
      quote: c.quote.trim(),
      reason: c.reason,
      whatWouldChangeIt: first
        ? alsoWouldChangeIt(c.reason, first, { domains: c.domains })
        : whatWouldChangeIt(c.reason, { domains: c.domains }),
    };
  });
}

/** Branded first, then the sharpest reason, then the earliest reading. Total, and stable. */
function beats(candidate: HedgeCandidate, held: HedgeCandidate): boolean {
  if (candidate.branded !== held.branded) return candidate.branded;
  if (PRIORITY[candidate.reason] !== PRIORITY[held.reason]) {
    return PRIORITY[candidate.reason] < PRIORITY[held.reason];
  }
  return candidate.sample < held.sample;
}
