/**
 * Everything a report says, assembled from stored evidence.
 *
 * One function, one shape, used by both the hosted page and the email. Nothing here calls
 * an engine and nothing here re-interprets: the run paid for the captures, the extraction
 * pass interpreted them, and this reads both. A report that could not be rebuilt from the
 * database is a report we cannot stand behind.
 *
 * ORDER MATTERS AND IT IS NOT THE OFFER SHEET'S ORDER. The offer sheet puts the number
 * first and the branded question last, as a control-condition footnote. The first real run
 * showed why that is backwards: Zapme's blended naming rate is 9.3%, which reads as "do
 * more marketing", while the branded question says five surfaces know them and one will
 * recommend them. That is the models having formed a view, and it is a different diagnosis
 * with a different fix. So the diagnosis leads and the branded evidence is second.
 */

import 'server-only';
import { db } from './db';
import { diagnose, THRESHOLD_VERSION, THRESHOLD_NOTE, type DiagnosisResult } from './diagnosis';
import { shareOfModel, aiOverviewStats, type ScoredCapture } from './share';
import { computeDelta, type DeltaReport, type RunSnapshot } from './delta';
import { aiOverviewCoverage, VARIANCE_NOTE, COMPARABILITY_NOTE, CITATION_CAVEAT, geoNote, localityNote, samplingNote, AIO_PROVENANCE_NOTE } from './method';
import { buildActions, isHedgeReason, type HedgeReason, type ReportActions } from './actions';
import { SURFACES, type QuestionSlot, type Surface } from './scope';
import { EXTRACTION_VERSION } from './extract';
import { METRIC_VERSION, NOISE_FLOOR_NOTE } from './metric';
import type { RunRow } from './accounts';
import type { Citation } from './types';
import { marketName } from './geo';
import type { GeoSent, Locality } from './geo';

export const surfaceLabel = (s: string) => SURFACES[s as Surface]?.label ?? s;

/** Report order for the five slots. `branded` is last here because it has its own section. */
const SLOT_ORDER: QuestionSlot[] = ['category', 'situation', 'alternatives', 'how_do_people', 'branded'];

/**
 * THE FOUR STATES A GRID CELL CAN BE IN, AND WHY TWO OF THEM WERE ONE STATE TOO FEW.
 *
 * The first real run printed the same dash in two cells that mean opposite things. Google
 * AI Overviews sat on the category row with a dash because Google generated no overview for
 * that question at all - which is a finding about the subscriber's category, and one the
 * method note treats as intelligence rather than as a hole. Grok sat on the situation row
 * with the same dash because we lost the capture: one of 55, the run went `partial`, and
 * that dash is our failure, not their market's.
 *
 * Absence-as-a-value, in the UI this time. `no_answer` is a measurement; `not_measured` is
 * the absence of one, and a report that cannot tell a subscriber which of the two they are
 * looking at is asking them to trust a mark it has not explained.
 */
export type GridState = 'named' | 'absent' | 'no_answer' | 'not_measured';

interface CaptureRecord extends ScoredCapture {
  id: string;
  answer_text: string | null;
  citations: Citation[] | null;
  domains_cited: string[] | null;
  model_used: string | null;
  provider: string | null;
  grounded: boolean | null;
  geo_sent: GeoSent | null;
  vercel_region: string;
  top_recommendation: string | null;
  target_position: number | null;
  hedge_quote: string | null;
  hedge_reason: string | null;
  hedge_span: string | null;
}

export interface ReportData {
  scope: {
    brandName: string;
    market: string;
    marketCountry: string;
    website: string | null;
    /**
     * Set only on a scope narrower than a country. `localityNote` below is the sentence
     * that goes in the report body; this is here so the renderer can decide whether there
     * is anything to print at all.
     */
    locality: string | null;
  };
  /**
   * Which surfaces the subscriber's town actually reached, and how. Null on a country
   * scope. Generated from captures.geo_sent, never from the scope's intent.
   */
  localityNote: string | null;
  run: { id: string; periodStart: string; status: string; surfaces: string[]; samples: Record<string, number> };
  versions: { threshold: number; extraction: number; metric: number };

  diagnosis: DiagnosisResult;
  /**
   * How often the brand is NAMED. Supporting detail since 23 Aug 2026: the headline is the
   * recommendation count below. The field keeps its shape so stored reports still read.
   */
  presence: { shareOfModel: number | null; pairs: number; numerator: number };
  /** Surfaces that could describe them, for the gap line. Same number as endorsement.recognised. */
  recognised: number;
  endorsement: { recognised: number; endorsed: number; askedDirectly: number };

  bySurface: Array<{ surface: string; label: string; shareOfModel: number | null; pairs: number }>;
  competitors: Array<{ name: string; shareOfModel: number | null; ahead: boolean }>;

  /** What each surface said when asked about them by name. The second section, not the last. */
  branded: Array<{
    surface: string;
    label: string;
    recommended: boolean;
    /**
     * How the samples actually split. Printed whenever `of` is more than one and the readings
     * disagreed, because a surface that recommended you in one reading of three is a different
     * fact from one that did it in three, and the headline flattens both to the same word.
     */
    readings: { recommended: number; of: number };
    excerpt: string | null;
  }>;

  /**
   * What to do about it, in the surfaces' own words, grouped by the cause behind them.
   * Sits directly after the branded section: problem, proof, what to do, then the
   * supporting data.
   */
  actions: ReportActions;

  questions: Array<{
    slot: QuestionSlot;
    text: string;
    surfaces: Array<{ surface: string; label: string; state: GridState; samples: string }>;
  }>;

  domains: Array<{ domain: string; count: number }>;
  aiOverview: { headline: string; whatItMeans: string } | null;

  evidence: Array<{
    slot: QuestionSlot;
    text: string;
    answers: Array<{ label: string; model: string | null; provider: string | null; answer: string; citations: Citation[] }>;
  }>;

  method: string[];
  delta: DeltaReport | null;

  /**
   * Set only on the published specimen at /sample. Never on a subscriber's report.
   *
   * WHAT IT CHANGES, and it is deliberately not cosmetic: it prints a standing banner saying
   * the business and its competitors are invented, it removes the month and the run id from
   * the masthead and colophon so nothing implies a real execution, and it lets the page be
   * indexed - every real report is noindex and private to its account.
   *
   * THE STRUCTURE, THE QUESTIONS AND THE METHOD ARE NOT CHANGED BY IT. That is the point of
   * the page: a reader has to be able to trust that the shape of what they are looking at is
   * exactly the shape of what they would receive.
   */
  specimen?: boolean;
}

export async function buildReport(run: RunRow): Promise<ReportData> {
  const { data: scopeRow, error: scopeErr } = await db()
    .from('scopes')
    .select(
      'brand_name, market, market_country, website, locality, locality_canonical, locality_city, locality_region',
    )
    .eq('id', run.scope_id)
    .single();
  if (scopeErr || !scopeRow) throw new Error(`Scope lookup failed: ${scopeErr?.message}`);
  const scope = scopeRow as {
    brand_name: string;
    market: string;
    market_country: string;
    website: string | null;
    locality: string | null;
    locality_canonical: string | null;
    locality_city: string | null;
    locality_region: string | null;
  };
  const locality: Locality | null = scope.locality
    ? {
        input: scope.locality,
        canonical: scope.locality_canonical,
        city: scope.locality_city,
        region: scope.locality_region,
      }
    : null;

  const { data: qRows } = await db()
    .from('questions')
    .select('id, slot, text')
    .eq('scope_id', run.scope_id);
  const questions = (qRows ?? []) as Array<{ id: string; slot: QuestionSlot; text: string }>;
  const slotOf = new Map(questions.map((q) => [q.id, q.slot]));

  const { data: cRows } = await db()
    .from('competitors')
    .select('name')
    .eq('scope_id', run.scope_id)
    .is('removed_at', null);
  const competitorNames = (cRows ?? []).map((c) => (c as { name: string }).name);

  const { data: capRows, error: capErr } = await db()
    .from('captures')
    .select(
      'id, engine, question_id, sample, outcome, extracted_at, target_mentioned, target_recommended, ' +
        'target_position, top_recommendation, brands_named, domains_cited, answer_text, citations, ' +
        'model_used, provider, grounded, geo_sent, vercel_region, hedge_quote, hedge_reason, hedge_span, ' +
        'extraction_version',
    )
    .eq('run_id', run.id);
  if (capErr) throw new Error(`Capture lookup failed: ${capErr.message}`);

  // Cast through unknown: supabase-js cannot infer a row type from a select string built by
  // concatenation, and returns GenericStringError rather than failing at runtime.
  const rawCaptures = (capRows ?? []) as unknown as Array<Record<string, unknown>>;
  const captures = rawCaptures.map((c) => ({
    ...c,
    slot: slotOf.get(c.question_id as string),
  })) as unknown as CaptureRecord[];

  const som = shareOfModel({ captures, competitors: competitorNames });

  // Endorsement, always a count with its denominator. The branded question is asked of every
  // surface; recognised is how many named them, endorsed is how many put them forward.
  const brandedPairs = new Map<string, CaptureRecord[]>();
  for (const c of captures) {
    if (c.slot !== 'branded') continue;
    const list = brandedPairs.get(c.engine);
    if (list) list.push(c);
    else brandedPairs.set(c.engine, [c]);
  }
  const brandedUsable = [...brandedPairs.entries()].map(([surface, samples]) => {
    const usable = samples.filter((s) => s.outcome === 'answered' && s.extracted_at);
    return { surface, usable };
  });
  const askedDirectly = brandedUsable.filter((b) => b.usable.length).length;
  const recognised = brandedUsable.filter((b) => b.usable.some((c) => c.target_mentioned)).length;
  const endorsed = brandedUsable.filter((b) => endorses(b.usable)).length;

  const diagnosis = diagnose({ presence: som.overall.share, recognised, endorsed, askedDirectly });

  // Cited domains across every answered capture. The noisiest thing we collect, which is why
  // the method note carries a caveat about it rather than presenting it as a fixed list.
  const domainCounts = new Map<string, number>();
  for (const c of captures) {
    for (const d of new Set(c.domains_cited ?? [])) domainCounts.set(d, (domainCounts.get(d) ?? 0) + 1);
  }
  const domains = [...domainCounts.entries()]
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain))
    .slice(0, 12);

  // WHAT TO DO ABOUT IT, and every word of the diagnosis in it belongs to a surface.
  //
  // A hedge is a capture that NAMED them and stopped short of recommending them, carrying a
  // sentence the extraction pass found verbatim in the answer. Nothing is written here and
  // nothing is re-read: an answer with no stated reason produces no action, which is the
  // honest outcome and is why this section can be empty.
  //
  // TWO FILTERS THAT LOOK LIKE BELT AND BRACES AND ARE NOT.
  //
  // THE BRANDED QUESTION ONLY. On an unbranded question a surface writing about the whole
  // category produces sentences that are true, verbatim, and not about the subscriber:
  // "Most global travel eSIMs are data-only" is a fact about eSIMs, and printed under a
  // surface's name in a section about why that surface stopped short of recommending them,
  // it becomes a reason it never was. The branded question is the one asked directly about
  // them, so a reason given there is a reason about them. v3 of the extraction prompt says
  // the same thing to the model; this is the half that does not depend on it complying.
  //
  // NEVER CONTRADICT THE BRANDED VERDICT. Endorsement is decided across a surface's samples
  // by endorses() below, while a hedge lives on a single capture. Without this filter a
  // report could say a surface recommends you at the top and print that same surface
  // explaining why it did not, four inches below.
  const endorsingSurfaces = new Set(
    brandedUsable.filter((b) => endorses(b.usable)).map((b) => b.surface),
  );
  const actions = buildActions(
    captures
      .filter(
        (c) =>
          c.slot === 'branded' &&
          !endorsingSurfaces.has(c.engine) &&
          c.outcome === 'answered' &&
          c.extracted_at &&
          c.target_mentioned === true &&
          c.target_recommended !== true &&
          c.hedge_quote &&
          isHedgeReason(c.hedge_reason),
      )
      .map((c) => ({
        surface: c.engine,
        label: surfaceLabel(c.engine),
        quote: c.hedge_quote!,
        reason: c.hedge_reason as HedgeReason,
        // What this surface cited across the whole month, most-cited first. The only place
        // a remedy gets specific, and it is specific about evidence we hold.
        domains: topDomainsFor(captures, c.engine),
        branded: c.slot === 'branded',
        sample: c.sample,
        span: c.hedge_span,
      })),
  );

  const aio = aiOverviewStats(captures);
  const orderedQuestions = questions
    .slice()
    .sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));

  return {
    scope: {
      brandName: scope.brand_name,
      market: scope.market,
      marketCountry: scope.market_country,
      website: scope.website,
      locality: locality?.input ?? null,
    },
    localityNote: locality
      ? localityReach(captures, run, locality, marketName(scope.market_country))
      : null,
    run: {
      id: run.id,
      periodStart: run.period_start,
      status: run.status,
      surfaces: run.surfaces as string[],
      samples: run.samples,
    },
    versions: { threshold: THRESHOLD_VERSION, extraction: EXTRACTION_VERSION, metric: METRIC_VERSION },

    diagnosis,
    presence: {
      shareOfModel: som.overall.share,
      pairs: som.overall.pairs,
      numerator: som.overall.mentioned,
    },
    endorsement: { recognised, endorsed, askedDirectly },
    recognised,

    bySurface: som.bySurface.map((s) => ({
      surface: s.surface,
      label: surfaceLabel(s.surface),
      shareOfModel: s.score.share,
      pairs: s.score.pairs,
    })),

    competitors: som.competitors.map((c) => ({
      name: c.name,
      shareOfModel: c.score.share,
      ahead: (c.score.share ?? 0) > (som.overall.share ?? 0),
    })),

    branded: brandedUsable
      .filter((b) => b.usable.length)
      .map((b) => {
        const yes = endorses(b.usable);
        // Quote a reading that agrees with the verdict. Quoting the one dissenting sample
        // under a "recommends you" heading, or the reverse, is the contradiction the filter
        // above exists to prevent, reproduced inside a single row.
        const rec =
          b.usable.find((c) => c.target_recommended === yes) ?? b.usable[0]!;
        return {
          surface: b.surface,
          label: surfaceLabel(b.surface),
          recommended: yes,
          readings: {
            recommended: b.usable.filter((c) => c.target_recommended).length,
            of: b.usable.length,
          },
          excerpt: firstSentences(rec.answer_text, 2),
        };
      })
      .sort((a, b) => Number(b.recommended) - Number(a.recommended) || a.label.localeCompare(b.label)),

    actions,

    questions: orderedQuestions.map((q) => ({
      slot: q.slot,
      text: q.text,
      surfaces: (run.surfaces as string[]).map((surface) => {
        const samples = captures.filter((c) => c.question_id === q.id && c.engine === surface);
        const usable = samples.filter((s) => s.outcome === 'answered' && s.extracted_at);
        const hits = usable.filter((s) => s.target_mentioned).length;

        // The surface was asked and showed nothing: every reading we hold says so. A single
        // answered sample is enough to make this a reading rather than a silence, which is
        // why it is `every` and not `some` - Google answering one of three questions is
        // measured, not silent.
        const showedNothing =
          samples.length > 0 && samples.every((s) => s.outcome === 'no_answer' || s.outcome === 'refused');

        const state: GridState = usable.length
          ? hits
            ? 'named'
            : 'absent'
          : showedNothing
            ? 'no_answer'
            : 'not_measured';

        return {
          surface,
          label: surfaceLabel(surface),
          state,
          // Shown as a count, never a percentage: three observations cannot carry one.
          samples: usable.length ? `${hits} of ${usable.length}` : state === 'no_answer' ? 'no answer' : 'not measured',
        };
      }),
    })),

    domains,
    aiOverview: aio.samplesTaken ? aiOverviewCoverage(aio) : null,

    evidence: orderedQuestions.map((q) => ({
      slot: q.slot,
      text: q.text,
      answers: captures
        .filter((c) => c.question_id === q.id && c.outcome === 'answered' && c.answer_text)
        .sort((a, b) => a.engine.localeCompare(b.engine) || a.sample - b.sample)
        .map((c) => ({
          label: c.sample > 1 ? `${surfaceLabel(c.engine)} (reading ${c.sample})` : surfaceLabel(c.engine),
          model: c.model_used,
          provider: c.provider,
          answer: c.answer_text!,
          citations: c.citations ?? [],
        })),
    })),

    method: methodLines(captures, run, scope.market, locality),
    delta: null,
  };
}

/**
 * Which surfaces the town reached, read off the captures rather than off the surface list.
 *
 * geo_sent.precision is written by the engine at the moment of asking, so a surface that
 * silently stopped accepting a city would move itself out of the parameterised group and
 * into the question-only one, and the report would say so without anybody noticing first.
 * That is the difference between a claim and a reading.
 */
function localityReach(
  captures: CaptureRecord[],
  run: RunRow,
  locality: Locality,
  countryLabel: string,
): string {
  const groups = { sentTown: [] as string[], sentCountry: [] as string[], noParameter: [] as string[] };
  for (const surface of run.surfaces as string[]) {
    const geo = captures.find((c) => c.engine === surface)?.geo_sent;
    if (!geo) continue;
    if (geo.precision === 'locality') groups.sentTown.push(surfaceLabel(surface));
    else if (geo.precision === 'country') groups.sentCountry.push(surfaceLabel(surface));
    else groups.noParameter.push(surfaceLabel(surface));
  }
  return localityNote(locality, groups, countryLabel);
}

/**
 * The method note, generated from what each capture actually recorded rather than from what
 * the pipeline intended. captures.geo_sent, model_used, grounded and vercel_region are the
 * inputs, which is what makes every sentence here checkable.
 */
function methodLines(
  captures: CaptureRecord[],
  run: RunRow,
  market: string,
  locality: Locality | null,
): string[] {
  const lines: string[] = [VARIANCE_NOTE, '', NOISE_FLOOR_NOTE, '', THRESHOLD_NOTE, '', COMPARABILITY_NOTE, ''];

  const region = captures[0]?.vercel_region ?? 'US';
  for (const surface of run.surfaces as string[]) {
    const mine = captures.filter((c) => c.engine === surface);
    const first = mine[0];
    if (!first) continue;
    const model = first.model_used;
    const geo = first.geo_sent;
    const n = run.samples[surface] ?? 1;
    const asked = `Asked ${n === 1 ? 'once' : `${n} times`} per question`;
    const who = model
      ? `answered by ${model}, which it reported itself`
      : `captured through ${first.provider ?? 'a search provider'}`;
    lines.push(`${surfaceLabel(surface)}. ${asked}, ${who}.`);
    if (geo) lines.push(`  ${geoNote(surfaceLabel(surface), geo, market, region, locality)}`);
    const ungrounded = mine.filter((c) => c.grounded === false).length;
    if (ungrounded) {
      lines.push(
        `  ${surfaceLabel(surface)} answered ${ungrounded} ${ungrounded === 1 ? 'question' : 'questions'} ` +
          `without searching the web, from what it already knew.`,
      );
    }
  }

  const single = Object.fromEntries(
    (run.surfaces as string[]).filter((s) => (run.samples[s] ?? 1) === 1).map((s) => [surfaceLabel(s), 1]),
  );
  const sampling = samplingNote(single);
  if (sampling) lines.push('', sampling);

  lines.push('', AIO_PROVENANCE_NOTE, '', CITATION_CAVEAT);
  return lines;
}

/** What one surface cited most across the month, for the specific clause in a remedy. */
function topDomainsFor(captures: CaptureRecord[], surface: string): string[] {
  const counts = new Map<string, number>();
  for (const c of captures) {
    if (c.engine !== surface) continue;
    for (const d of new Set(c.domains_cited ?? [])) counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([d]) => d);
}

/** A short excerpt for the branded section. The full answer is in the evidence. */
function firstSentences(text: string | null, count: number): string | null {
  if (!text) return null;
  const clean = text.replace(/\s+/g, ' ').replace(/\[+\d*\]+\([^)]*\)/g, '').trim();
  const parts = clean.split(/(?<=[.!?])\s+/).slice(0, count).join(' ');
  return parts.length > 400 ? `${parts.slice(0, 397)}...` : parts;
}

/**
 * DOES THIS SURFACE RECOMMEND THEM? One rule, used by the headline count, by the branded
 * section and by the filter that stops the two contradicting each other.
 *
 * MAJORITY OF USABLE SAMPLES, and it used to be `.some()`, which is the defect the branded
 * noise floor measurement exposed on 25 August 2026.
 *
 * Under `.some()` a single sample recommending promoted the whole surface to "recommends
 * you". On Zapme's August run Gemini recommended them in ONE reading of three and was
 * counted as a full endorsement, so the headline read 1 of 5 on the strength of a third of
 * one surface. The bias is large and it is entirely in the flattering direction: at a true
 * rate of one in three, `.some()` over three samples reports "recommends you" about 70% of
 * the time, and a majority rule reports it about 26%.
 *
 * It also contradicted the build's own mixing rule, which says repeated samples average into
 * one surface-question unit rather than multiplying its weight. share.ts had it right all
 * along - `usable.filter(rec).length / usable.length` - and the headline was using the other
 * rule. Two rules for one question, and the headline was on the wrong one.
 *
 * A fraction cannot be the answer here, because the headline is a count out of five and the
 * method page says in as many words that it carries no decimal place. Majority is the
 * discretisation of the same idea: it asks what this surface typically does. Ties go to NOT
 * endorsed, which only arises on an even number of usable samples, and which is the direction
 * this product fails in by policy.
 *
 * The split is not thrown away. It is printed next to the verdict, so a subscriber sees
 * "recommended you in one reading of three" rather than a word that hides it.
 */
function endorses(usable: CaptureRecord[]): boolean {
  if (!usable.length) return false;
  const yes = usable.filter((c) => c.target_recommended).length;
  return yes * 2 > usable.length;
}

/** Attach a delta by comparing against the previous comparable run for this scope. */
export async function attachDelta(report: ReportData, run: RunRow): Promise<ReportData> {
  const { data: prevRows } = await db()
    .from('runs')
    .select('*')
    .eq('scope_id', run.scope_id)
    .eq('period', run.period)
    .lt('period_start', run.period_start)
    .order('period_start', { ascending: false })
    .limit(1);
  const prev = (prevRows?.[0] as RunRow | undefined) ?? null;
  // Month one. No delta, and the report leads on the diagnosis instead of apologising for
  // a comparison that cannot exist yet.
  if (!prev) return report;

  const snapshot = async (r: RunRow): Promise<RunSnapshot> => {
    // The definition this run's report was ISSUED under, not the one in the code today. A run
    // that was never reported gets today's, because if we reported it now that is what it
    // would be, and inventing a break against a month nobody has seen helps nobody.
    const { data: reportRow } = await db()
      .from('reports')
      .select('metric_version')
      .eq('run_id', r.id)
      .maybeSingle();
    const metricVersion = (reportRow as { metric_version: number } | null)?.metric_version ?? METRIC_VERSION;

    const { data: qs } = await db().from('questions').select('id, slot').eq('scope_id', r.scope_id);
    const slots = new Map((qs ?? []).map((q) => [(q as { id: string }).id, (q as { slot: string }).slot]));
    const { data: caps } = await db()
      .from('captures')
      .select(
        'engine, question_id, sample, outcome, extracted_at, target_mentioned, target_recommended, ' +
          'brands_named, extraction_version',
      )
      .eq('run_id', r.id);
    const { data: comps } = await db()
      .from('competitors')
      .select('name')
      .eq('scope_id', r.scope_id)
      .is('removed_at', null);
    return {
      runId: r.id,
      periodStart: r.period_start,
      status: r.status,
      metricVersion,
      surfaces: r.surfaces as string[],
      samples: r.samples,
      // Same cast-through-unknown as buildReport, and for the same reason: a select string
      // built by concatenation defeats supabase-js's row inference and it hands back
      // GenericStringError rather than failing at runtime.
      captures: ((caps ?? []) as unknown as Array<Record<string, unknown>>).map((c) => ({
        ...c,
        slot: slots.get(c.question_id as string),
      })) as unknown as ScoredCapture[],
      competitors: (comps ?? []).map((c) => (c as { name: string }).name),
    };
  };

  return { ...report, delta: computeDelta(await snapshot(run), await snapshot(prev)) };
}
