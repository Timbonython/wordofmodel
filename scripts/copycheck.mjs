/**
 * Enforces the copy rules from wordofmodel-site-copy.md against anything a
 * visitor can read. They are the thing that stops the site drifting into the same
 * language as every competitor, so they are checked rather than remembered.
 *
 *   npm run copycheck
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DIRS = ['app', 'components', 'lib'];
const EXTENSIONS = ['.ts', '.tsx', '.css'];

const RULES = [
  {
    name: 'no em dashes',
    pattern: /—/g,
    hint: 'Use a spaced hyphen or a full stop.',
  },
  {
    name: 'never write "AI visibility"',
    pattern: /AI visibility/gi,
    hint: "That is their category name. Ours is what's being said.",
  },
  {
    name: 'no buzzwords',
    pattern: /\b(leverage|leveraging|unlock|unlocking|game-changer|game changer|empower|empowering|synerg\w*|seamless|cutting-edge|best-in-class|revolutionary)\b/gi,
    hint: 'If a sentence would survive on any SaaS site in the world, rewrite it.',
  },
  {
    name: 'never use noreply@',
    pattern: /noreply@/gi,
    hint: 'It filters harder and reads as a machine.',
  },
  {
    // §4 of the pricing plan. An Australian who reads "$69" and is charged A$106 has been
    // surprised; one who reads "US$69" has not. The two-character prefix is the whole guard,
    // so it is checked rather than remembered - the site was rendering "USD 149" in seven
    // places on 28 Aug 2026, which is neither the bare sign this forbids nor the prefix it
    // requires. Matches a bare $ before a digit, and the "USD 149" spelling.
    name: 'prices render as US$, never a bare $ or "USD 149"',
    // Two or more digits: `$1` and `$2` in a String.replace are backreferences, not prices,
    // and lib/markup.ts is full of them. No price on this site is a single digit.
    pattern: /(?<!US)\$\s?\d{2,}|\bUSD\s?\d/g,
    hint: 'Write US$69. A bare dollar sign to an Australian reader is a promise the card statement breaks.',
  },
];

/** Comments are working notes, not copy. Only user-facing text is checked. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (EXTENSIONS.some((e) => entry.endsWith(e))) out.push(full);
  }
  return out;
}

let failures = 0;

for (const dir of DIRS) {
  let files;
  try {
    files = walk(join(ROOT, dir));
  } catch {
    continue;
  }

  for (const file of files) {
    const source = stripComments(readFileSync(file, 'utf8'));
    const lines = source.split('\n');

    for (const rule of RULES) {
      lines.forEach((line, i) => {
        const matches = line.match(rule.pattern);
        if (!matches) return;
        failures += matches.length;
        console.error(
          `${relative(ROOT, file)}:${i + 1}  ${rule.name}  ->  ${matches.join(', ')}\n    ${rule.hint}`,
        );
      });
    }
  }
}

// ---------------------------------------------------------------------------------------
// SELECTORS THAT SWALLOW WHAT IS NESTED IN THEM LATER
//
// `.container tag` scores (0,1,1) and beats any single class at (0,1,0). The rule is correct
// the day it is written, when the container holds plain markup. It breaks months later, when
// somebody nests a COMPONENT inside and the component's own class loses the cascade.
//
// Four of these have shipped:
//
//   .legal a          beat  .button          a link styled as a button, inside legal copy
//   .wordmark span    beat  .lockup          28 Aug 2026, the whole wordmark rendered grey
//   .sitenav-links a  beat  .button-green    28 Aug 2026, "Free scan" was grey on green
//   .features li      would beat .feature-added, and is only safe by luck
//
// NONE WERE CATCHABLE BY A TYPECHECK OR A BUILD. Both files are individually valid; the
// collision exists only in the rendered cascade, so it is found by looking at a screenshot.
//
// CHILD COMBINATORS DO NOT FIX THIS, which is worth stating because it is the obvious guess.
// In every case above the swallowed element WAS a direct child - `.wordmark > span` still
// matches the lockup. What fixes it is giving the element its own class, or qualifying the
// tag: `.sitenav-links a.button-green`, `.wordmark > span:not(.lockup)`.
//
// BASELINED, NOT ENFORCED RETROSPECTIVELY. The 53 below exist and are mostly harmless -
// `.totals th` will only ever hold its own markup. Rewriting all of them is a large diff with
// no defect behind it. What this rule stops is the FIFTY-FOURTH, written next month by
// somebody who has not read any of this.
//
// If you are here because the check failed: give the element a class of its own and target
// that, or qualify the tag. Add to the baseline only when the container genuinely cannot ever
// hold a component - and say why in the commit.
const DESCENDANT_BASELINE = new Set([
  '.account-facts > div', '.account-facts dd', '.account-facts dt', '.billing-toggle button',
  '.card h2', '.card-price strong', '.competitor-list li', '.confirm-field span',
  '.features li', '.features li::before', '.founding-block h2', '.founding-block p',
  '.gate-list li', '.gate-list li::before', '.get h3', '.get p', '.legal a:not(.button)',
  '.legal h1', '.legal h2', '.legal h3', '.legal p', '.legal section', '.locations h3',
  '.locations p', '.nots li', '.nots li:first-child', '.offer p', '.question-list li',
  '.question-list li:last-child', '.redacted li', '.redacted li::before',
  '.redacted li:nth-child(2) .redacted-bar', '.redacted li:nth-child(3) .redacted-bar',
  '.scan-quote cite', '.scan-quote p', '.sitefooter-links a', '.sitefooter-links a:hover',
  '.sitenav-links a', '.sitenav-links a:hover', '.sources li', '.stepper button',
  '.stepper button:disabled', '.steps li', '.steps li::before', '.steps p', '.steps strong',
  '.tiers li', '.totals td', '.totals th', '.verdict-line strong', '.wizard-nav li',
  '.wizard-step h2', '.wordmark > span:not(.lockup)',
]);

const TAGS =
  'a|p|span|li|ul|ol|h1|h2|h3|h4|h5|h6|div|button|input|img|table|td|th|tr|dd|dt|dl|' +
  'section|header|footer|nav|form|label|svg|rect|em|strong|code|pre|blockquote|cite|' +
  'summary|details|figure';

// A bare tag descending from a class, and NOT immediately qualified by a class of its own.
// `.sitenav-links a.button-green` is the FIX, so it must not be flagged as the problem.
const DESCENDANT = new RegExp(
  `(?<![\\w.-])\\.[a-z][\\w-]*(?:\\s*[>+~]\\s*|\\s+)(?:${TAGS})(?![\\w-])(?!\\s*\\.)`,
);

const cssPath = join(ROOT, 'app', 'globals.css');
const css = readFileSync(cssPath, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
css.split('\n').forEach((raw, i) => {
  const line = raw.trim();
  if (!line.startsWith('.') || !line.includes('{')) return;
  for (const part of line.split('{')[0].split(',')) {
    const sel = part.trim();
    if (!sel || DESCENDANT_BASELINE.has(sel)) continue;
    if (!DESCENDANT.test(sel)) continue;
    failures++;
    console.error(
      `app/globals.css:${i + 1}  selector can swallow a nested component  ->  ${sel}\n` +
        '    A bare tag under a class beats any single class. Give the element its own class,\n' +
        '    or qualify the tag. Child combinators do not help - see the note in this file.',
    );
  }
});

if (failures) {
  console.error(`\ncopycheck: ${failures} problem${failures === 1 ? '' : 's'}.`);
  process.exit(1);
}
console.log('copycheck: clean.');
