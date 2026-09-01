import 'server-only';
import { askText } from './openai';
import { questionPrompt } from './prompts';
import { constraintBlock, missingForQuestion, type BusinessProfile } from './profile';

/**
 * Thrown when the profile is missing a fact the question cannot be written without.
 *
 * A distinct type rather than a string, so the scan route can tell "we could not write a
 * question" from "we do not yet know who is choosing" and route the second to the confirm card
 * instead of to an error.
 */
export class MissingFactError extends Error {
  // A plain field, not a constructor parameter property: Node's type-stripping loader refuses
  // those, and scripts/grounding-check.mjs imports this module directly.
  readonly field: 'buyer' | 'sells';
  constructor(field: 'buyer' | 'sells') {
    super(`The profile has no ${field}, so no question can be written from it.`);
    this.field = field;
  }
}

/**
 * A guard around the spec's question prompt. The prompt itself is used verbatim
 * and is not edited here.
 *
 * Why this exists. Sampling the spec's prompt fifteen times across three real
 * domains on 17 Aug 2026 produced four questions that ask an assistant to name
 * companies, and eleven addressed to the supplier itself: "Can you show recent
 * Australian client work", "Do you offer a US deployment". A vendor-addressed
 * question makes both engines answer "I can't claim I've handled projects" and
 * name nobody, and the scan then reports that zero companies were named, which is
 * useless and destroys the credibility of the result. The spec is explicit that a
 * wrong question does exactly that.
 *
 * So: draw several candidates from the verbatim prompt in parallel, take the
 * first that a buyer could actually put to an assistant, and only if every draw
 * fails, rewrite the best one into shortlist form.
 */

const DRAWS = 4;

/** Second person means the question is aimed at the supplier, not an assistant. */
const ADDRESSES_VENDOR = /\b(you|your|yours|we|our|us)\b/i;

/*
 * EXCEPT WHEN "YOU" IS THE ASSISTANT, which is the commonest phrasing there is.
 *
 * "What Adelaide keynote speaking businesses would you recommend?" is addressed to the assistant,
 * asks for a shortlist and names a category - and was rejected, because ADDRESSES_VENDOR saw the
 * bare "you". Every such draw went to a repair pass it did not need, which is most of what the
 * note about half the repairs being of good questions was describing. Found on 1 Sep 2026 by
 * break 3 failing on a draw that was perfectly good.
 *
 * The idiom is stripped and the REMAINDER is tested, rather than the whole string being
 * exempted: "would you recommend your own service" still has a vendor-addressed "your" left over
 * once "would you recommend" is removed, and is still refused. "Can you show recent client work"
 * - the shape this guard was built for - is not an idiom match at all and is untouched.
 */
const ASSISTANT_IDIOM = /\b(would|do|can|could|should)\s+you\s+(recommend|suggest|rate|say|rank|pick|choose|go with)\b/gi;

/** Asking for a set of companies rather than for a supplier's own credentials. */
const ASKS_FOR_A_SHORTLIST = /\b(which|who|what|whose|best|top|leading|recommend|recommended|options)\b/i;

/*
 * WIDENED 1 Sep 2026. Every entry here was a business-shaped noun, so a category whose members
 * are PEOPLE - a speaker, a coach, a mentor, a dentist - matched nothing and a perfectly good
 * question was sent to the repair pass. Half the observed repairs were of questions that were
 * already fine.
 *
 * Still a list rather than a pattern. A generic plural-agent-noun rule ("\w+ers") reads
 * "conference organisers" and "business leaders" as categories, which are the people ASKING in
 * the question that started all this - so it would have stamped the defect as clean.
 *
 * "business" WAS MISSING UNTIL IT WAS REVIEWED, and it is the most generic business-shaped noun
 * there is. The list had gained restaurant, cafe, pub, gym and salon and skipped the word itself,
 * so "What Adelaide keynote speaking businesses would you recommend?" failed the category check
 * and came back unverified - while `constraintBlock` was at the same time telling the model that
 * what the buyer wants is "the kind of BUSINESS or person". The prompt steered toward a word the
 * guard refused. Found by break 3 failing on a draw that was perfectly good.
 */
const NAMES_A_CATEGORY =
  /\b(compan|agenc|vendor|supplier|provider|firm|studio|platform|tool|software|brand|installer|manufacturer|consultan|contractor|service|team|shop|practice|specialist|speaker|coach|mentor|trainer|advis|dentist|doctor|clinic|lawyer|solicitor|accountant|plumb|electric|builder|photograph|designer|developer|restaurant|cafe|pub|bar|hotel|venue|school|gym|salon|store|retailer|wholesaler|business)/i;

/*
 * THE SHAPE THAT PASSED EVERY OTHER TEST AND WAS STILL WRONG.
 *
 *   "Who in Adelaide, SA can help conference organisers and business leaders choose between
 *    keynote speaking and business mentoring for an event?"
 *
 * Third person, asks for a shortlist, names a place from the profile. It reads as a buyer
 * question and it is not one: it asks for somebody to ADVISE ON the decision, so the engines
 * answer with consultants and event agencies, and the business that prompted it is not in the
 * running. The generator's prompt is fixed so this is not written in the first place; this is
 * the check behind it, because a prompt is not a guard.
 */
const ASKS_FOR_AN_ADVISER =
  /\b(help|helps|assist|advise|guide|support)\b[^?]{0,80}\b(choose|choosing|decide|deciding|pick|picking|select|selecting|compare|comparing|work out|figure out)\b/i;

export function isBuyerQuestion(question: string): boolean {
  const q = question.trim();
  if (q.length < 20 || q.length > 320) return false;
  if (ADDRESSES_VENDOR.test(q.replace(ASSISTANT_IDIOM, ' '))) return false;
  if (ASKS_FOR_AN_ADVISER.test(q)) return false;
  return ASKS_FOR_A_SHORTLIST.test(q) && NAMES_A_CATEGORY.test(q);
}

function tidy(raw: string): string {
  return raw
    .trim()
    .replace(/^question:\s*/i, '')
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Not the spec's prompt. A repair pass, used only when every draw from the spec's
 * prompt came back addressed to the supplier. It rewrites, it does not invent: the
 * buyer's own requirements are carried across.
 */
/*
 * THE REPAIR CARRIED THE SAME TWO DEFECTS AS THE PROMPT IT REPAIRS, which is what made it worth
 * reading rather than assuming. It said "choosing a supplier of X in {country}" and instructed
 * "Include {country} or the region" - so a draw that was rescued here came back with the
 * inversion reinstated and a country the profile never held. It now takes the same constraints
 * the generator did and adds no geography of its own.
 */
function repairPrompt(question: string, profile: BusinessProfile, brandName: string): string {
  return `The question below was meant to be one a real person would type into an AI assistant
while deciding which business to choose. Instead it is addressed to the business itself, as if
filling in a tender.

Rewrite it as a question put to an assistant, asking which businesses to consider.

CONSTRAINTS. These are the only facts you have. Use them and add nothing.
${constraintBlock(profile)}

Rules:
- Keep the specific requirements, sizes and constraints already in it.
- Never mention ${brandName} or any brand name.
- Never address the reader as "you" or refer to "we" or "our".
- Introduce no place name that is not in the constraints above.
- One sentence. No preamble.

Return only the rewritten question.

QUESTION: ${question}`;
}

export async function writeBuyerQuestion(
  profile: BusinessProfile,
  brandName: string,
): Promise<{
  question: string;
  attempts: number;
  repaired: boolean;
  /**
   * Did the question we are returning pass isBuyerQuestion?
   *
   * ADDED 1 Sep 2026, AND IT IS PRINCIPLE §5 AGAIN. When every draw failed the guard and the
   * repair failed it too, this function returned the longest draw anyway and told nobody. A
   * question the guard rejected and a question it passed left here in the same shape, so the
   * card showed both with the same confidence. There is always a question to return - the run
   * has to continue and the visitor can now edit it - but which of the two it is has to reach
   * the screen.
   */
  verified: boolean;
}> {
  /*
   * §4: IF buyer IS NULL, DO NOT WRITE A QUESTION. It is the one field a run cannot proceed
   * without - everything else degrades honestly, and a question with no geography is a
   * defensible question, but without knowing who is choosing there is no way to write one that
   * runs in the right direction. Refusing here is what sends the visitor to the confirm card,
   * which is where the field gets filled.
   */
  const missing = missingForQuestion(profile);
  if (missing) {
    throw new MissingFactError(missing);
  }

  const prompt = questionPrompt(profile, brandName);

  const drawn = await Promise.all(
    Array.from({ length: DRAWS }, () =>
      askText(prompt).then(
        (t) => tidy(t),
        () => '',
      ),
    ),
  );
  const candidates = drawn.filter(Boolean);
  if (!candidates.length) throw new Error('Could not write the question. Try again in a moment.');

  const clean = candidates.find(isBuyerQuestion);
  if (clean) return { question: clean, attempts: candidates.length, repaired: false, verified: true };

  // Repair the longest draw, since it carries the most of the buyer's detail.
  const best = candidates.reduce((a, b) => (b.length > a.length ? b : a));
  const repaired = tidy(await askText(repairPrompt(best, profile, brandName)));
  const ok = isBuyerQuestion(repaired);
  return {
    question: ok ? repaired : best,
    attempts: candidates.length + 1,
    repaired: true,
    verified: ok,
  };
}
