/**
 * Every sentence the free scan can print, rendered and read.
 *
 * WHY THIS IS NOT A copycheck RULE. The defect that produced it - "6 companies were came up",
 * live on the home page hero - spans an interpolation boundary: the source reads
 * `${countPhrase(n)} came up`, and no scan of the text can see the verb that countPhrase
 * returns. The only guard that catches this class is one that renders the sentence and reads
 * the result, which is what this does.
 *
 * Found on 29 Aug 2026 by running the free scan end to end after a deploy, which is the
 * standing rule, and reading the output rather than the status code.
 */

import { buildVerdict } from '../lib/verdict.ts';

// Two consecutive verbs where the second is a bare past or infinitive: "were came", "was did",
// "were come". English has no such construction, so a match is always a bug.
const DOUBLED = /\b(was|were|is|are)\s+(came|come|did|do|went|gone)\b/i;

const capture = (engine, { mentioned = false, recommended = false, named = [] } = {}) => ({
  engine,
  model: 'test',
  answer: '',
  citations: [],
  domains: [],
  ms: 1,
  cost_usd: null,
  cost_source: null,
  score: {
    target_mentioned: mentioned,
    target_recommended: recommended,
    target_position: recommended ? 1 : null,
    brands_named: named,
    top_recommendation: named[0] ?? null,
    domains_cited: [],
  },
});

const SIX = ['A Co', 'B Co', 'C Co', 'D Co', 'E Co', 'F Co'];
const ONE = ['A Co'];

const CASES = [
  ['recommended by both', [capture('chatgpt', { mentioned: true, recommended: true, named: SIX }),
                           capture('perplexity', { mentioned: true, recommended: true, named: SIX })]],
  ['named, not recommended', [capture('chatgpt', { mentioned: true, recommended: true, named: SIX }),
                              capture('perplexity', { mentioned: true, named: SIX })]],
  ['not named at all', [capture('chatgpt', { mentioned: true, recommended: true, named: SIX }),
                        capture('perplexity', { named: SIX })]],
  ['absent from both', [capture('chatgpt', { named: SIX }), capture('perplexity', { named: SIX })]],
  ['absent, one competitor', [capture('chatgpt', { named: ONE }), capture('perplexity', { named: ONE })]],
  ['nobody named', [capture('chatgpt'), capture('perplexity')]],
];

let failures = 0;
for (const [label, captures] of CASES) {
  const v = buildVerdict('Airalo', captures);
  const sentences = [v.headline, ...v.lines];
  const bad = sentences.filter((s) => DOUBLED.test(s));
  if (bad.length) {
    failures++;
    console.error(`  FAIL  ${label}`);
    for (const s of bad) console.error(`        ${s}`);
  } else {
    console.log(`  PASS  ${label}`);
    for (const s of sentences) console.log(`        ${s}`);
  }
}

console.log(failures ? `\nverdict: ${failures} FAILED\n` : '\nverdict: clean. Every sentence reads.\n');
process.exit(failures ? 1 : 0);
