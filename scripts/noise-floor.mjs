/**
 * How much does a result move when nothing changes?
 *
 *   npm run noise -- chatgpt 10
 *   npm run noise -- perplexity 10
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
 *   mention      did the brand get named at all - the input to Share, a coin flip if unstable
 *   recommended  did the surface put them forward - the new headline number
 *   brand set    which companies were named, run to run, as Jaccard against the first run
 *   domains      what got cited - already known to be the noisiest thing we collect
 *
 * Writes nothing to the database. Captures cost money and these are not evidence about a
 * subscriber's month; they are evidence about the instrument.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const { engineFor } = await import(join(here, '../lib/engines/index.ts'));
const { namesBrand } = await import(join(here, '../lib/extract.ts'));
const { db } = await import(join(here, '../lib/db.ts'));

const surface = process.argv[2] ?? 'perplexity';
const runs = Number(process.argv[3] ?? 10);
// Which question. A pair where the brand is solidly absent has a stable answer and understates
// the floor; the informative pair is one seen flipping, which is what the third argument is for.
const slot = process.argv[4] ?? 'category';

// A real question from a real scope, so the floor is measured on the kind of question the
// product actually asks rather than something invented for the test.
const { data: scopes } = await db().from('scopes').select('id, brand_name, market_country').limit(1);
const scope = scopes?.[0];
if (!scope) throw new Error('no scope to borrow a question from');

const { data: questions } = await db()
  .from('questions')
  .select('slot, text')
  .eq('scope_id', scope.id)
  .eq('slot', slot)
  .limit(1);
const question = questions?.[0];
if (!question) throw new Error(`no ${slot} question on that scope`);

const { data: comps } = await db().from('competitors').select('name').eq('scope_id', scope.id).is('removed_at', null);
const known = [scope.brand_name, ...(comps ?? []).map((c) => c.name)];

console.log(`surface   ${surface}`);
console.log(`question  ${question.text}`);
console.log(`brand     ${scope.brand_name}  (${scope.market_country})`);
console.log(`runs      ${runs}\n`);

const engine = engineFor(surface);
const results = [];

for (let i = 0; i < runs; i++) {
  const started = Date.now();
  const r = await engine.run({ question: question.text, country: scope.market_country });
  const text = r.answerText ?? '';
  const named = known.filter((b) => namesBrand(text, b));
  const domains = [...new Set(r.citations.map((c) => c.domain).filter(Boolean))];
  results.push({
    outcome: r.outcome,
    mentioned: namesBrand(text, scope.brand_name),
    named: named.filter((n) => n !== scope.brand_name),
    domains,
    cost: r.costUsd ?? 0,
    words: text.split(/\s+/).filter(Boolean).length,
  });
  console.log(
    `  ${String(i + 1).padStart(2)}  ${r.outcome.padEnd(9)} ${(Date.now() - started) / 1000}s  ` +
      `${namesBrand(text, scope.brand_name) ? 'NAMED' : 'not named'}  ` +
      `${named.filter((n) => n !== scope.brand_name).length} known competitors  ${domains.length} domains`,
  );
}

const answered = results.filter((r) => r.outcome === 'answered');
const mentions = answered.filter((r) => r.mentioned).length;
const jaccard = (a, b) => {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size && !B.size) return 1;
  const inter = [...A].filter((x) => B.has(x)).length;
  return inter / (A.size + B.size - inter);
};

const first = answered[0];
const brandOverlap = answered.slice(1).map((r) => jaccard(first.named, r.named));
const domainOverlap = answered.slice(1).map((r) => jaccard(first.domains, r.domains));
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

console.log(`\nanswered            ${answered.length} of ${runs}`);
console.log(`brand mentioned     ${mentions} of ${answered.length}  (${((mentions / answered.length) * 100).toFixed(0)}%)`);
console.log(`competitor set      mean overlap with run 1: ${(mean(brandOverlap) * 100).toFixed(0)}%`);
console.log(`cited domains       mean overlap with run 1: ${(mean(domainOverlap) * 100).toFixed(0)}%`);
console.log(`answer length       ${Math.min(...answered.map((r) => r.words))} to ${Math.max(...answered.map((r) => r.words))} words`);
console.log(`spend               USD ${results.reduce((t, r) => t + r.cost, 0).toFixed(3)}`);

// The floor, in the unit the report actually prints: one surface answering one question is
// one pair, so a flip of the mention is a whole pair moving.
const p = mentions / answered.length;
const sd = Math.sqrt((p * (1 - p)) / answered.length);
console.log(`\nOn this pair the mention rate is ${(p * 100).toFixed(0)}% with a standard error of`);
console.log(`${(sd * 100).toFixed(0)} points at ${answered.length} observations. One unsampled pair can therefore`);
console.log(`move the reported figure by a full pair on its own.`);
