import type { Capture, EngineId, FreeResult, GatedResult } from './types';
import { ENGINE_LABEL } from './types';
import { sameBrand } from './score';

/**
 * Step 5 of the spec, the three result variants. Copy follows the spec except for
 * one deviation: the spec writes "Good news — you came up first on [engine]" and
 * the brand's copy rules forbid em dashes, so that line is split into two
 * sentences.
 *
 * Every number here is counted from the captures. The spec is explicit that a
 * genuine win is reported as a win, because a scan that always says you are
 * invisible gets found out in a week.
 *
 * `**bold**` in these strings is rendered by the result component.
 */
export function buildVerdict(brandName: string, captures: Capture[]): FreeResult {
  // Callers refuse to save a scan with no captures, but a verdict built from an
  // empty list would read "We asked  the question above", so it is guarded here
  // too rather than depending on the caller getting it right.
  if (!captures.length) {
    throw new Error('Cannot build a verdict with no captured answers');
  }

  const competitors = competitorNames(brandName, captures);
  const competitor_count = competitors.length;
  const engines_run = captures.length;
  const naming = captures.filter((c) => c.score.target_mentioned);
  const recommending = captures.filter((c) => c.score.target_recommended);
  const engineNames = captures.map((c) => ENGINE_LABEL[c.engine]);

  const top = pickTopRecommendation(brandName, captures);

  if (recommending.length > 0) {
    const winner = recommending[0]!;
    const others = captures.filter((c) => c.engine !== winner.engine);
    const lines: string[] = [];

    for (const other of others) {
      const label = ENGINE_LABEL[other.engine];
      if (other.score.target_recommended) {
        lines.push(`${label} recommended you too. ${countPhrase(competitor_count)} came up alongside you.`);
      } else if (other.score.target_mentioned) {
        lines.push(`But ${label} named you without recommending you, and ${countPhrase(competitor_count)} came up.`);
      } else {
        lines.push(`But ${label} didn't name you at all, and ${countPhrase(competitor_count)} did come up.`);
      }
    }
    lines.push('One question, two engines. The full picture takes twenty five.');

    return {
      kind: 'recommended',
      headline: `Good news. You came up first on ${ENGINE_LABEL[winner.engine]}.`,
      lines,
      competitor_count,
      engines_run,
      engines_naming_you: naming.length,
      top_recommendation: top?.brand ?? null,
      winning_engine: winner.engine,
    };
  }

  if (naming.length > 0) {
    const positioned = naming.find((c) => typeof c.score.target_position === 'number');
    const lines: string[] = [];

    const namedLine = `Named in ${naming.length} of ${engines_run} answers`;
    if (positioned && positioned.score.target_position) {
      const total = positioned.score.brands_named.length;
      lines.push(`${namedLine}, position ${positioned.score.target_position} of ${total}.`);
    } else {
      lines.push(`${namedLine}. Recommended in none.`);
    }

    if (top) {
      lines.push(
        top.engines === engines_run && engines_run > 1
          ? `**${top.brand}** was the recommendation both times.`
          : `**${top.brand}** was recommended ahead of you.`,
      );
    }

    return {
      kind: 'named_not_recommended',
      headline: "You were mentioned. You weren't recommended.",
      lines,
      competitor_count,
      engines_run,
      engines_naming_you: naming.length,
      top_recommendation: top?.brand ?? null,
      winning_engine: null,
    };
  }

  // Neither engine named anybody at all. Reporting "0 companies were named, you
  // weren't one of them" would be nonsense dressed as a finding, and the spec is
  // clear that the honesty is the whole brand. Say what happened instead.
  if (competitor_count === 0) {
    return {
      kind: 'no_brands',
      headline: 'Nobody came up. Not you, not anyone.',
      lines: [
        `We asked ${joinList(engineNames)} the question above.`,
        '**Neither engine named a single company.**',
        'That happens when a category has no clear answer online yet. It is an opening, not a verdict.',
      ],
      competitor_count: 0,
      engines_run,
      engines_naming_you: 0,
      top_recommendation: null,
      winning_engine: null,
    };
  }

  const lines = [`We asked ${joinList(engineNames)} the question above.`];
  lines.push(`**${countWasNamed(competitor_count)} named. You weren't one of them.**`);
  if (top) lines.push(`${ENGINE_LABEL[top.engine]} recommended **${top.brand}** first.`);

  return {
    kind: 'absent',
    headline: "You didn't come up.",
    lines,
    competitor_count,
    engines_run,
    engines_naming_you: 0,
    top_recommendation: top?.brand ?? null,
    winning_engine: null,
  };
}

/**
 * The bare noun phrase: "1 company", "6 companies".
 *
 * IT CARRIES NO VERB, and that is the correction. It used to return "1 company was" / "6
 * companies were", which reads correctly in exactly one of its four call sites - "6 companies
 * were named" - and produced "6 companies were came up" in the other three. That sentence was
 * live on the free scan result, which is the hero of the home page and the only thing most
 * visitors ever read. The verb belongs to the sentence, so each sentence supplies its own.
 */
function countPhrase(n: number): string {
  return n === 1 ? '1 company' : `${n} companies`;
}

/** The same phrase where the sentence needs the copula: "1 company was named". */
function countWasNamed(n: number): string {
  return n === 1 ? '1 company was' : `${n} companies were`;
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Every brand named across both answers that is not the target. */
export function competitorNames(brandName: string, captures: Capture[]): string[] {
  const out: string[] = [];
  for (const c of captures) {
    for (const b of c.score.brands_named) {
      if (sameBrand(b, brandName)) continue;
      if (out.some((existing) => sameBrand(existing, b))) continue;
      out.push(b);
    }
  }
  return out;
}

/** The brand pushed hardest, preferring one both engines agreed on. */
function pickTopRecommendation(
  brandName: string,
  captures: Capture[],
): { brand: string; engine: EngineId; engines: number } | null {
  const picks = captures
    .map((c) => ({ engine: c.engine, brand: c.score.top_recommendation }))
    .filter((p): p is { engine: EngineId; brand: string } => !!p.brand && !sameBrand(p.brand, brandName));
  if (!picks.length) return null;

  for (const p of picks) {
    const agreeing = picks.filter((q) => sameBrand(q.brand, p.brand));
    if (agreeing.length > 1) return { brand: p.brand, engine: p.engine, engines: agreeing.length };
  }
  const first = picks[0]!;
  return { brand: first.brand, engine: first.engine, engines: 1 };
}

/** Step 6. Only ever sent after an email is captured. */
export function buildGated(brandName: string, captures: Capture[]): GatedResult {
  const counts = new Map<string, number>();
  for (const c of captures) for (const d of c.domains) counts.set(d, (counts.get(d) ?? 0) + 1);

  const top = pickTopRecommendation(brandName, captures);

  return {
    captures: captures.map((c) => ({
      engine: c.engine,
      engine_label: ENGINE_LABEL[c.engine],
      model: c.model,
      answer: c.answer,
      citations: c.citations,
      mentioned: c.score.target_mentioned,
      recommended: c.score.target_recommended,
      position: c.score.target_position,
    })),
    brands_named: competitorNames(brandName, captures),
    domains_cited: [...counts.entries()]
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain)),
    beaten_by: top?.brand ?? null,
  };
}
