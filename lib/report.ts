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
 * showed why that is backwards: Zapme's blended Share of Model is 9.3%, which reads as "do
 * more marketing", while the branded question says five surfaces know them and one will
 * recommend them. That is the models having formed a view, and it is a different diagnosis
 * with a different fix. So the diagnosis leads and the branded evidence is second.
 */

import 'server-only';
import { db } from './db';
import { diagnose, THRESHOLD_VERSION, THRESHOLD_NOTE, type DiagnosisResult } from './diagnosis';
import { shareOfModel, aiOverviewStats, type ScoredCapture } from './share';
import { computeDelta, type DeltaReport, type RunSnapshot } from './delta';
import { aiOverviewCoverage, VARIANCE_NOTE, COMPARABILITY_NOTE, CITATION_CAVEAT, geoNote, samplingNote, AIO_PROVENANCE_NOTE } from './method';
import { buildActions, isHedgeReason, type HedgeReason, type ReportAction } from './actions';
import { SURFACES, type QuestionSlot, type Surface } from './scope';
import { EXTRACTION_VERSION } from './extract';
import type { RunRow } from './accounts';
import type { Citation } from './types';
import type { GeoSent } from './geo';

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
}

export interface ReportData {
  scope: { brandName: string; market: string; marketCountry: string; website: string | null };
  run: { id: string; periodStart: string; status: string; surfaces: string[]; samples: Record<string, number> };
  versions: { threshold: number; extraction: number };

  diagnosis: DiagnosisResult;
  /** Presence is the FRAME. Share of Model is the metric and keeps its name on the number. */
  presence: { shareOfModel: number | null; pairs: number; numerator: number };
  endorsement: { recognised: number; endorsed: number; askedDirectly: number };

  bySurface: Array<{ surface: string; label: string; shareOfModel: number | null; pairs: number }>;
  competitors: Array<{ name: string; shareOfModel: number | null; ahead: boolean }>;

  /** What each surface said when asked about them by name. The second section, not the last. */
  branded: Array<{ surface: string; label: string; recommended: boolean; excerpt: string | null }>;

  /**
   * What to do about it, in the surfaces' own words. Sits directly after the branded
   * section: problem, proof, what to do, then the supporting data.
   */
  actions: ReportAction[];

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
}

export async function buildReport(run: RunRow): Promise<ReportData> {
  const { data: scopeRow, error: scopeErr } = await db()
    .from('scopes')
    .select('brand_name, market, market_country, website')
    .eq('id', run.scope_id)
    .single();
  if (scopeErr || !scopeRow) throw new Error(`Scope lookup failed: ${scopeErr?.message}`);
  const scope = scopeRow as { brand_name: string; market: string; market_country: string; website: string | null };

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
        'model_used, provider, grounded, geo_sent, vercel_region, hedge_quote, hedge_reason',
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
  const endorsed = brandedUsable.filter((b) => b.usable.some((c) => c.target_recommended)).length;

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
  // - one sample recommending is enough for "recommends you" - while a hedge lives on a
  // single capture. Gemini recommended Zapme in two readings of three, and the third
  // carried a reason. Without this filter the same report said Gemini recommends you at the
  // top and printed Gemini explaining why it did not, four inches below.
  const endorsingSurfaces = new Set(
    brandedUsable.filter((b) => b.usable.some((c) => c.target_recommended)).map((b) => b.surface),
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
    },
    run: {
      id: run.id,
      periodStart: run.period_start,
      status: run.status,
      surfaces: run.surfaces as string[],
      samples: run.samples,
    },
    versions: { threshold: THRESHOLD_VERSION, extraction: EXTRACTION_VERSION },

    diagnosis,
    presence: {
      shareOfModel: som.overall.share,
      pairs: som.overall.pairs,
      numerator: som.overall.mentioned,
    },
    endorsement: { recognised, endorsed, askedDirectly },

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
        const rec = b.usable.find((c) => c.target_recommended) ?? b.usable[0]!;
        return {
          surface: b.surface,
          label: surfaceLabel(b.surface),
          recommended: b.usable.some((c) => c.target_recommended),
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

    method: methodLines(captures, run, scope.market),
    delta: null,
  };
}

/**
 * The method note, generated from what each capture actually recorded rather than from what
 * the pipeline intended. captures.geo_sent, model_used, grounded and vercel_region are the
 * inputs, which is what makes every sentence here checkable.
 */
function methodLines(captures: CaptureRecord[], run: RunRow, market: string): string[] {
  const lines: string[] = [VARIANCE_NOTE, '', THRESHOLD_NOTE, '', COMPARABILITY_NOTE, ''];

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
    if (geo) lines.push(`  ${geoNote(surfaceLabel(surface), geo, market, region)}`);
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
    const { data: qs } = await db().from('questions').select('id, slot').eq('scope_id', r.scope_id);
    const slots = new Map((qs ?? []).map((q) => [(q as { id: string }).id, (q as { slot: string }).slot]));
    const { data: caps } = await db()
      .from('captures')
      .select('engine, question_id, sample, outcome, extracted_at, target_mentioned, target_recommended, brands_named')
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
      surfaces: r.surfaces as string[],
      samples: r.samples,
      captures: (caps ?? []).map((c) => ({
        ...(c as Record<string, unknown>),
        slot: slots.get((c as { question_id: string }).question_id),
      })) as unknown as ScoredCapture[],
      competitors: (comps ?? []).map((c) => (c as { name: string }).name),
    };
  };

  return { ...report, delta: computeDelta(await snapshot(run), await snapshot(prev)) };
}
