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
    // THE PRODUCT ALREADY HAD THE RIGHT WORD AND THE MARKETING COPY DRIFTED OFF IT.
    // lib/scope.ts and the live Stripe product description have both said "three ranked
    // actions" since the price ladder was built. The home page, the FAQ, the about page, the
    // confirmation page and the confirmation email had all quietly become "three things to do",
    // which says nothing about what makes them ranked, or in what order, or why.
    //
    // Narrow on purpose. This does not ban the word - "the whole thing", "not the same thing"
    // and "different things" are ordinary English and rewriting them would make the copy
    // stilted. It bans the two phrasings that were standing in for the deliverable's actual
    // name.
    name: 'name the deliverable, do not call it things',
    pattern: /\bthings to do\b|\bthree things\b/gi,
    hint: 'It is three ranked actions, in order, with why that one is first. lib/scope.ts says so.',
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

/**
 * Comments are working notes, not copy. Only user-facing text is checked.
 *
 * NEWLINES ARE PRESERVED, and that is the whole fix. This used to replace a block comment with
 * a single space, which collapsed multi-line comments onto one line and shifted every line
 * number after them - so every location this tool reported was wrong, quietly, for as long as
 * the rules rarely fired. It surfaced when the price-door rule needed to read the line ABOVE a
 * match to honour an inline opt-out and kept reading the wrong one.
 *
 * A checker that misreports where a problem is costs more than the problem.
 */
function stripComments(source) {
  const blank = (m) => m.replace(/[^\n]/g, ' ');
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + m.slice(p1.length).replace(/./g, ' '));
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
// BASELINED, NOT ENFORCED RETROSPECTIVELY. The ones below exist and are mostly harmless -
// `.totals th` will only ever hold its own markup. Rewriting all of them is a large diff with
// no defect behind it. What this rule stops is the NEXT one, written next month by somebody
// who has not read any of this.
//
// THE LIST ONLY EVER SHRINKS. It was 53; `.nots li` and `.nots li:first-child` came off it on
// 29 Aug when that block was replaced and the new one gave its rows a class. Deliberately not
// written as a count in this sentence any more: a number in a comment beside a list is a number
// that goes stale the first time the list changes, and this one already had.
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
  '.locations p', '.offer p', '.question-list li',
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


// ---------------------------------------------------------------------------------------
// A RENDERED PRICE MUST HAVE A DOOR.
//
// §0 of the purchase-path brief: a price on a page with no purchase path is the same defect
// as a price checkout cannot honour - both print a number the visitor cannot act on. The
// homepage strip rendered three prices and one ambiguous button for as long as it took nobody
// to remember, and nothing in the build could see it.
//
// PriceCard holds the invariant by construction: its `cta` prop is required, so a price cannot
// be expressed through it without a door. This checks the other half - that the marketing
// surfaces do not render a price any other way.
//
// PASSING A PRICE INTO PriceCard IS NOT RENDERING ONE. `amount={priceLabel(...)}` is the
// component being used correctly; only a price in a JSX text position counts.
//
// THE FLOW SURFACES ARE EXEMPT, and named rather than pattern-matched so an exemption has to
// be argued for. The wizard, the scan result and the account page all show a price INSIDE the
// purchase path - the wizard is the checkout, the scan result puts its CTA against the price,
// and the account page shows what a subscriber already pays. None of them is a price a visitor
// cannot act on.
  // ScanResult CAME OFF THIS LIST on 5 Sep 2026. The exemption was not holding a policy
  // difference, it was hiding four marker bugs: three prices marked `price-door: button` that
  // sit inside an <a> rather than a <button>, and a prose sentence whose `no purchase path`
  // marker covered its first line while the sentence ran on to two more prices. An exemption
  // argued for once and then never re-read stops being an argument and becomes a hole.
const PRICE_DOOR_EXEMPT = new Set([
  'components/wizard/Wizard.tsx',   // the checkout itself
  'app/account/page.tsx',           // what an existing subscriber pays
  'components/PriceCard.tsx',       // the component that holds the invariant
  'app/terms/page.tsx',             // legal text describing the price, not an offer to buy it
]);

const PRICE_IN_TEXT = /\{\s*(?:priceLabel\(|money\(|PRICE_USD[.[])/;

/** Replace every `prop={ ... }` expression with spaces, keeping newlines so lines still line up. */
function blankPropExpressions(source) {
  let out = source;
  const start = /\b[a-zA-Z][\w]*=\{/g;
  let m;
  while ((m = start.exec(out)) !== null) {
    let depth = 1;
    let i = m.index + m[0].length;
    while (i < out.length && depth > 0) {
      if (out[i] === '{') depth++;
      else if (out[i] === '}') depth--;
      i++;
    }
    const body = out.slice(m.index, i).replace(/[^\n]/g, ' ');
    out = out.slice(0, m.index) + body + out.slice(i);
    start.lastIndex = i;
  }
  return out;
}

for (const dir of ['app', 'components']) {
  let files = [];
  try { files = walk(join(ROOT, dir)); } catch { continue; }
  for (const file of files) {
    if (!file.endsWith('.tsx')) continue;
    const rel = relative(ROOT, file);
    if (PRICE_DOOR_EXEMPT.has(rel)) continue;
    const original = readFileSync(file, 'utf8');
    const raw = stripComments(original);
    // PROPS REMOVED FIRST, and by brace matching rather than by line. `sub={annual ? \`…\` :
    // \`…\`}` spans three lines, and a line-based skip flagged its continuations as bare
    // renderings - which is how this check first reported two false positives on its own
    // author's code. Blanked rather than deleted so line numbers still point at the source.
    const src = blankPropExpressions(raw);
    // An opt-out has to be written on the line above the price it excuses, so it cannot be
    // granted from a distance. A file-level exemption would have covered this file's tier
    // cards too, and those genuinely go through PriceCard.
    // FROM THE ORIGINAL, not the stripped copy. The marker IS a comment, so reading it out of
    // the source that has had comments blanked finds nothing - which is how this opt-out
    // silently did nothing on its first run.
    const rawLines = original.split('\n');
    src.split('\n').forEach((line, i) => {
      if (!PRICE_IN_TEXT.test(line)) return;
      if ((rawLines[i - 1] ?? '').includes('price-door: no purchase path')) return;
      // `price-door: linked` says THIS PRICE IS THE LINK, and is CHECKED rather than believed.
      // An href must actually be open above it, within three lines and not already closed, or
      // the marker fails like any other bare price. A marker the checker takes on trust is an
      // opt-out with extra steps, and this file already learned that lesson once: the original
      // opt-out was read from the comment-stripped copy and silently excused nothing.
      // `price-door: button` is the same claim for a price printed ON the control that buys it,
      // which an anchor cannot express: the add-a-location button performs the purchase itself.
      //
      // VERIFIED BY FINDING THE ENCLOSING ELEMENT, not by looking a few lines up. The first
      // version used a fixed six line window and failed on the real case it was written for -
      // the add button's onClick is eight lines long, so its opening tag was outside the window
      // and a correctly marked price was reported as unmarked. A window is a guess about
      // formatting; walking up to the nearest tag is the actual question being asked.
      const marker = (rawLines[i - 1] ?? '').includes('price-door: linked')
        ? 'linked'
        : (rawLines[i - 1] ?? '').includes('price-door: button')
          ? 'button'
          : null;
      if (marker) {
        const want = marker === 'linked' ? ['a', 'Link'] : ['button'];
        let enclosing = null;
        for (let k = i - 1; k >= 0 && enclosing === null; k--) {
          const tags = [...rawLines[k].matchAll(/<(\/?)(a|Link|button)\b([^>]*)/g)];
          // Last tag on the line first: the nearest one going up is the one that encloses us.
          for (const t of tags.reverse()) {
            enclosing = { closing: t[1] === '/', name: t[2], attrs: t[3] ?? '' };
            break;
          }
        }
        const inside =
          enclosing !== null &&
          !enclosing.closing &&
          want.includes(enclosing.name) &&
          (marker === 'button' || /\bhref=/.test(enclosing.attrs));
        if (inside) return;
        failures++;
        console.error(
          `${rel}:${i + 1}  price-door: ${marker}, but it is not inside ${marker === 'linked' ? 'a link' : 'a button'}  ->  ${line.trim().slice(0, 56)}\n` +
            '    The marker claims this price sits inside the control that buys it. It does not.\n' +
            '    Either put it there, or say `price-door: no purchase path` and mean it.',
        );
        return;
      }
      failures++;
      console.error(
        `${rel}:${i + 1}  a price is rendered outside PriceCard  ->  ${line.trim().slice(0, 88)}\n` +
          '    A rendered price needs a purchase path. Put it in a PriceCard, whose cta prop is\n' +
          '    required, or add this file to PRICE_DOOR_EXEMPT with a reason.',
      );
    });
  }
}

if (failures) {
  console.error(`\ncopycheck: ${failures} problem${failures === 1 ? '' : 's'}.`);
  process.exit(1);
}
console.log('copycheck: clean.');
