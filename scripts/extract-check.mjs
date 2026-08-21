/**
 * Does the extraction still read known answers the way it is supposed to?
 *
 *   npm run extract:check          one pass per case
 *   npm run extract:check -- 5     five passes per case, to catch a coin flip
 *
 * WHY THIS EXISTS. On 21 Aug 2026 a field added for a report section - the sentence in which
 * a surface explains its hesitation - silently changed how the same prompt read ChatGPT's
 * branded answer about Zapme. "Promising, not proven", with a list of five rivals to compare
 * first, started coming back as a recommendation, five times out of five. Endorsement went
 * from 1 of 5 to 2 of 5. That is the headline number of the report and the metric the
 * product is sold on, moved by our own re-reading, in a pass that costs nothing to run and
 * gets run often.
 *
 * Nothing in the build would have caught it. It typechecks, the copy rules pass, the render
 * is clean, and the number is simply different. It was found by re-rendering a stored run
 * and noticing the figure had changed - which only works if somebody remembers what it was.
 *
 * So the judgments the report depends on have fixtures now, with the answers stored verbatim
 * and the correct reading argued out in `why`. RUN THIS BEFORE BUMPING EXTRACTION_VERSION.
 * A prompt change that costs a case here is a prompt change that would have moved a
 * subscriber's numbers without moving their market.
 *
 * It calls the real extraction path. A check that runs its own copy of the prompt is a check
 * on the copy.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const { extractCapture, EXTRACTION_VERSION } = await import(join(here, '../lib/extract.ts'));

const passes = Number(process.argv[2] ?? 1);
const fixtures = JSON.parse(readFileSync(join(here, 'fixtures/extract-cases.json'), 'utf8'));

console.log(`extraction v${EXTRACTION_VERSION}, ${fixtures.cases.length} cases, ${passes} pass${passes === 1 ? '' : 'es'} each\n`);

let failures = 0;

for (const c of fixtures.cases) {
  const capture = {
    id: c.id,
    engine: c.engine,
    outcome: 'answered',
    answer_text: c.answer_text,
    citations: c.citations,
    question_id: c.id,
  };

  const seen = { mentioned: [], recommended: [], hedge: [] };
  for (let i = 0; i < passes; i++) {
    const r = await extractCapture(capture, { brand_name: fixtures.brand }, fixtures.competitors, c.question);
    seen.mentioned.push(r.targetMentioned);
    seen.recommended.push(r.targetRecommended);
    seen.hedge.push(Boolean(r.hedgeQuote));
  }

  const problems = [];
  const check = (field, expected) => {
    if (expected === null) return; // not asserted for this case
    const wrong = seen[field].filter((v) => v !== expected).length;
    if (wrong) problems.push(`${field} expected ${expected}, got ${expected ? 'false' : 'true'} in ${wrong}/${passes}`);
  };
  check('mentioned', c.expect.mentioned);
  check('recommended', c.expect.recommended);
  check('hedge', c.expect.hedge);

  if (problems.length) {
    failures++;
    console.log(`FAIL  ${c.id}`);
    for (const p of problems) console.log(`        ${p}`);
    console.log(`        why this case exists: ${c.why}`);
  } else {
    console.log(`ok    ${c.id}`);
  }
}

console.log(failures ? `\n${failures} case${failures === 1 ? '' : 's'} failed.` : '\nAll cases read as expected.');
process.exit(failures ? 1 : 0);
