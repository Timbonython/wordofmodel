/**
 * How much does a result move when nothing changes?
 *
 *   npm run noise -- chatgpt 10                 naming, on the category question
 *   npm run noise -- chatgpt 10 branded         the headline verdict, on the branded question
 *   npm run noise -- all 10 branded             every monthly surface, one after another
 *
 * Same question, same surface, same market, N times back to back, nothing altered in between.
 * Whatever moves is the surface moving on its own, and it is the floor beneath every
 * month-to-month figure this product reports. A delta smaller than the floor is not a finding.
 *
 * WHY IT MATTERS MORE THAN IT LOOKS. "What changed since last month" is the retention
 * mechanism. If a two point drop is inside the noise, we have invoiced somebody for a story
 * about their market that is really a story about sampling. No competitor in this market can
 * state their floor, because none of them has measured it.
 *
 * WHAT IT MEASURES, in the order it matters:
 *   recommended  did the surface PUT THEM FORWARD - the headline number, and the reason this
 *                script was extended on 25 Aug 2026. Until then the docblock listed it and
 *                the code did not compute it: the whole file measured naming. The method page
 *                was citing a naming measurement to justify suppressing the arrow on a
 *                recommendation metric, which is measurement A standing in for metric B.
 *   mention      did the brand get named at all - the input to presence
 *   brand set    which companies were named, run to run, as Jaccard against the first run
 *   domains      what got cited - already known to be the noisiest thing we collect
 *
 * TWO SOURCES OF DRIFT, SEPARATED, AND THIS IS THE PART THAT COULD NOT BE GUESSED. The verdict
 * a subscriber reads is the surface's answer PLUS our reading of it, and the reading is an LLM
 * at temperature zero, which is not the same as deterministic. So the first answer from each
 * surface is read REREADS times over. If the surface flips and the extractor never does, the
 * floor is the market. If the extractor flips on identical text, part of the number we sell is
 * ours, and that is a defect rather than a floor.
 *
 * Writes nothing to the database. Captures cost money and these are not evidence about a
 * subscriber's month; they are evidence about the instrument.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const { engineFor } = await import(join(here, '../lib/engines/index.ts'));
const { namesBrand, extractCapture } = await import(join(here, '../lib/extract.ts'));
const { MONTHLY_SURFACES } = await import(join(here, '../lib/scope.ts'));
const { db } = await import(join(here, '../lib/db.ts'));

const which = process.argv[2] ?? 'perplexity';
const runs = Number(process.argv[3] ?? 10);
// Which question. A pair where the brand is solidly absent has a stable answer and understates
// the floor; the informative pair is one seen flipping, which is what the third argument is for.
// The branded slot is the one the headline is computed from.
const slot = process.argv[4] ?? 'category';

/** How many times the SAME answer is re-read, to separate our drift from the surface's. */
const REREADS = 3;

const surfaces = which === 'all' ? [...MONTHLY_SURFACES] : [which];

// A real question from a real scope, so the floor is measured on the kind of question the
// product actually asks rather than something invented for the test.
const { data: scopes } = await db().from('scopes').select('id, brand_name, market_country').limit(1);
const scope = scopes?.[0];
if (!scope) throw new Error('no scope to borrow a question from');

const { data: questions } = await db()
  .from('questions')
  .select('id, slot, text')
  .eq('scope_id', scope.id)
  .eq('slot', slot)
  .limit(1);
const question = questions?.[0];
if (!question) throw new Error(`no ${slot} question on that scope`);

const { data: comps } = await db().from('competitors').select('name').eq('scope_id', scope.id).is('removed_at', null);
const competitors = (comps ?? []).map((c) => c.name);
const known = [scope.brand_name, ...competitors];

console.log(`surfaces  ${surfaces.join(', ')}`);
console.log(`question  ${question.text}`);
console.log(`brand     ${scope.brand_name}  (${scope.market_country})`);
console.log(`runs      ${runs} each, plus ${REREADS} re-reads of the first answer\n`);

const jaccard = (a, b) => {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size && !B.size) return 1;
  const inter = [...A].filter((x) => B.has(x)).length;
  return inter / (A.size + B.size - inter);
};
// null rather than 0 on an empty list. With one answer there is nothing to overlap WITH, and
// printing 0% there says the sets were disjoint, which is a measurement nobody took.
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const pct = (v) => (v === null ? '  n/a' : `${(v * 100).toFixed(0).padStart(3)}%`);

/** Read one answer the way the pipeline reads it. No id that could collide with a real row. */
async function read(text, citations, tag) {
  return extractCapture(
    {
      id: `00000000-0000-0000-0000-${tag}`,
      engine: 'noise',
      outcome: 'answered',
      answer_text: text,
      citations,
      question_id: question.id,
    },
    { brand_name: scope.brand_name },
    competitors,
    question.text,
  );
}

const summaries = [];
let totalCost = 0;

for (const surface of surfaces) {
  console.log(`\n${'-'.repeat(70)}\n${surface}\n`);
  const engine = engineFor(surface);
  const results = [];

  for (let i = 0; i < runs; i++) {
    const started = Date.now();
    let r;
    try {
      r = await engine.run({ question: question.text, country: scope.market_country });
    } catch (err) {
      // A surface throwing is data too. Recorded and skipped rather than aborting nine paid
      // captures because the tenth timed out.
      console.log(`  ${String(i + 1).padStart(2)}  ERROR      ${String(err).slice(0, 80)}`);
      results.push({ outcome: 'error', cost: 0 });
      continue;
    }
    const text = r.answerText ?? '';
    const cost = r.costUsd ?? 0;
    totalCost += cost;

    if (r.outcome !== 'answered' || !text) {
      console.log(`  ${String(i + 1).padStart(2)}  ${r.outcome.padEnd(9)} ${((Date.now() - started) / 1000).toFixed(0)}s`);
      results.push({ outcome: r.outcome, cost });
      continue;
    }

    const x = await read(text, r.citations, String(i).padStart(12, '0'));
    const domains = [...new Set(r.citations.map((c) => c.domain).filter(Boolean))];
    results.push({
      outcome: r.outcome,
      text,
      citations: r.citations,
      mentioned: x.targetMentioned,
      recommended: x.targetRecommended,
      named: x.brandsNamed.filter((n) => !namesBrand(n, scope.brand_name)),
      domains,
      cost,
      words: text.split(/\s+/).filter(Boolean).length,
    });
    console.log(
      `  ${String(i + 1).padStart(2)}  answered  ${((Date.now() - started) / 1000).toFixed(0).padStart(3)}s  ` +
        `${x.targetMentioned ? 'named' : 'NOT NAMED'.padEnd(5)}  ` +
        `${x.targetRecommended ? 'RECOMMENDED' : 'not recommended'.padEnd(11)}  ` +
        `${x.brandsNamed.length} brands  ${domains.length} domains`,
    );
  }

  const answered = results.filter((r) => r.outcome === 'answered');
  if (!answered.length) {
    console.log('\n  nothing answered. No floor to report.');
    summaries.push({ surface, answered: 0 });
    continue;
  }

  // Re-read the first answer, unchanged, to see whether OUR reading is stable.
  const rereads = [answered[0].recommended];
  for (let j = 1; j <= REREADS - 1; j++) {
    const again = await read(answered[0].text, answered[0].citations, `reread${String(j).padStart(6, '0')}`);
    rereads.push(again.targetRecommended);
  }
  const extractorStable = new Set(rereads).size === 1;

  const mentions = answered.filter((r) => r.mentioned).length;
  const recommends = answered.filter((r) => r.recommended).length;
  const first = answered[0];
  const brandOverlap = answered.slice(1).map((r) => jaccard(first.named, r.named));
  const domainOverlap = answered.slice(1).map((r) => jaccard(first.domains, r.domains));

  console.log(`\n  answered            ${answered.length} of ${runs}`);
  console.log(`  brand mentioned     ${mentions} of ${answered.length}`);
  console.log(`  RECOMMENDED         ${recommends} of ${answered.length}`);
  console.log(`  our reading         ${extractorStable ? 'stable' : 'UNSTABLE'} across ${REREADS} reads of one answer  [${rereads.map((b) => (b ? 'Y' : 'n')).join('')}]`);
  console.log(`  competitor set      mean overlap with run 1: ${pct(mean(brandOverlap)).trim()}`);
  console.log(`  cited domains       mean overlap with run 1: ${pct(mean(domainOverlap)).trim()}`);
  console.log(`  answer length       ${Math.min(...answered.map((r) => r.words))} to ${Math.max(...answered.map((r) => r.words))} words`);

  summaries.push({
    surface,
    answered: answered.length,
    runs,
    mentions,
    recommends,
    extractorStable,
    rereads,
    brandOverlap: mean(brandOverlap),
    domainOverlap: mean(domainOverlap),
  });
}

console.log(`\n${'='.repeat(70)}\nTHE FLOOR, ON THE ${slot.toUpperCase()} QUESTION\n`);
console.log('surface       answered  named   recommended  our reading  competitors  domains');
for (const s of summaries) {
  if (!s.answered) {
    console.log(`${s.surface.padEnd(13)} 0 of ${s.runs}`);
    continue;
  }
  console.log(
    `${s.surface.padEnd(13)} ${String(s.answered).padStart(2)} of ${s.runs}  ` +
      `${String(s.mentions).padStart(2)}/${s.answered}   ` +
      `${String(s.recommends).padStart(2)}/${s.answered}        ` +
      `${(s.extractorStable ? 'stable' : 'UNSTABLE').padEnd(11)}  ` +
      `${pct(s.brandOverlap)}         ${pct(s.domainOverlap)}`,
  );
}

// The headline is a COUNT OF SURFACES out of five, so the thing that matters is how many
// surfaces are capable of flipping their verdict on their own. A surface that answered the
// same way ten times out of ten is not the problem; one that split is a fifth of the headline
// moving with nothing happening in the market.
const split = summaries.filter((s) => s.answered && s.recommends > 0 && s.recommends < s.answered);
const unstableReadings = summaries.filter((s) => s.answered && !s.extractorStable);

console.log(`\n${split.length} of ${summaries.filter((s) => s.answered).length} surfaces changed their verdict at least once with nothing altered.`);
if (split.length) {
  console.log(`That is ${split.length} of five points on the headline moving on its own: ${split.map((s) => s.surface).join(', ')}.`);
} else {
  console.log('Every surface that answered gave the same verdict every time.');
}
if (unstableReadings.length) {
  console.log(`\nWARNING: our own reading was unstable on ${unstableReadings.map((s) => s.surface).join(', ')},`);
  console.log('on IDENTICAL text. That part of the drift is ours, and it is a defect rather than a floor.');
} else {
  console.log('Our reading of an identical answer never changed, so the drift above is the surfaces.');
}
console.log(`\nspend               USD ${totalCost.toFixed(3)} in reported capture costs`);
console.log('(surfaces that do not report a cost, google_aio in particular, are not in that figure)');
