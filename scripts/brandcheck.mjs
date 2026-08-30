/**
 * The CSS custom properties in app/globals.css must equal lib/brand.ts. This checks it.
 *
 *   npm run brandcheck
 *
 * WHY A SCRIPT AND NOT A COMMENT. A stylesheet cannot import TypeScript, so the palette
 * unavoidably exists twice: once as `export const BRAND` and once as a `:root` block. Every
 * other copy in this repo was deleted on 28 Aug 2026 - there were eight - but this one cannot
 * be, so it is enforced instead of trusted.
 *
 * This repo has a rule about exactly this: state a guarantee only where the code enforces it.
 * A comment saying "keep these in sync" is the guarantee that failed eight times already, and
 * the two reds four units apart are what it looked like when it failed.
 *
 * Runs inside `npm run check`, so it fails a build rather than a code review.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const { BRAND } = await import(join(here, '../lib/brand.ts'));

/** CSS custom property -> BRAND key. Every token, both directions checked. */
const MAP = {
  '--ink': 'ink',
  '--paper': 'paper',
  '--green': 'green',
  '--soft': 'soft',
  '--mute': 'mute',
  '--faint': 'faint',
  '--line': 'line',
  '--cell-dark': 'cellDark',
  '--card': 'card',
  '--mark': 'mark',
  '--mark-you': 'markYou',
  '--pen': 'pen',
};

const css = readFileSync(join(here, '../app/globals.css'), 'utf8');
const root = css.match(/:root\s*\{([\s\S]*?)\}/);
if (!root) {
  console.error('brandcheck: no :root block found in app/globals.css.');
  process.exit(1);
}

const declared = {};
for (const m of root[1].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
  declared[m[1]] = m[2].trim();
}

const problems = [];

for (const [cssVar, brandKey] of Object.entries(MAP)) {
  const inCss = declared[cssVar];
  const inTs = BRAND[brandKey];
  if (inTs === undefined) {
    problems.push(`lib/brand.ts has no key "${brandKey}", but ${cssVar} maps to it.`);
    continue;
  }
  if (inCss === undefined) {
    problems.push(`app/globals.css :root is missing ${cssVar} (lib/brand.ts ${brandKey} = ${inTs}).`);
    continue;
  }
  // Case-insensitive: the CSS is written lowercase and the TS uppercase, on purpose, because
  // each matches the convention of the files around it. The VALUE is what has to agree.
  if (inCss.toLowerCase() !== String(inTs).toLowerCase()) {
    problems.push(`${cssVar} is ${inCss} in app/globals.css but ${brandKey} is ${inTs} in lib/brand.ts.`);
  }
}

// A colour token declared in the CSS that this script does not know about is drift starting.
// --wrap is a length, not a colour, and is the only permitted exception.
for (const cssVar of Object.keys(declared)) {
  if (cssVar === '--wrap') continue;
  if (!(cssVar in MAP)) {
    problems.push(`${cssVar} is declared in app/globals.css but is not in lib/brand.ts. Add it there and to MAP in this script, or remove it.`);
  }
}

// Every BRAND colour should be reachable from the stylesheet, or it is a value with no home.
const mapped = new Set(Object.values(MAP));
for (const brandKey of Object.keys(BRAND)) {
  if (!mapped.has(brandKey)) {
    problems.push(`lib/brand.ts exports "${brandKey}" but no CSS custom property maps to it.`);
  }
}


// ---------------------------------------------------------------------------------------
// THE CODE BOX AND THE OFFERS MUST AGREE.
//
// lib/discount.ts is server-only, so the wizard cannot read the offer registry directly and
// TIERS_WITH_A_CODE in lib/scope.ts restates it for the browser. Two places, one fact - the
// exact shape this repo keeps getting bitten by, so it is checked rather than trusted.
//
// Drift in either direction is a real defect: a tier listed here with no offer renders a box
// that can only say no, and a tier with an offer left out hides a box from somebody holding a
// code that works.
const { OFFERS } = await import(join(here, '../lib/discount.ts'));
const { TIERS_WITH_A_CODE } = await import(join(here, '../lib/scope.ts'));

const tiersWithOffers = [...new Set(Object.values(OFFERS).map((o) => o.tier))].sort();
const declaredTiers = [...TIERS_WITH_A_CODE].sort();
if (JSON.stringify(tiersWithOffers) !== JSON.stringify(declaredTiers)) {
  problems.push(
    `TIERS_WITH_A_CODE is ${JSON.stringify(declaredTiers)} but the offers in lib/discount.ts cover ` +
      `${JSON.stringify(tiersWithOffers)}. One of them is wrong.`,
  );
}

// ---------------------------------------------------------------------------------------
// THE RENDER KIT IS THE THIRD AND FOURTH COPY OF THE PALETTE.
//
// brand/ generates every Facebook, LinkedIn, ad and favicon asset. Its Python scripts write
// the colours as hex literals inside HTML strings handed to Playwright - they cannot import
// lib/brand.ts any more than the stylesheet can - and brand/README.md prints the palette a
// fourth time as documentation.
//
// NOT ONE FILE, SIX. The brief for this check named gen_g.py's BASE block, which is where the
// :root line lives. In fact the palette is written across gen_g.py, gen_ads.py,
// gen_brand_social.py, gen_favicon.py and all three gen_video*.py - eleven distinct values,
// every one of them a BRAND token. Checking only gen_g.py would be a guard reporting healthy
// while five other files drifted, which is this repo's most expensive recurring shape.
//
// The rule is deliberately the strong one: EVERY hex literal anywhere in brand/scripts must be
// a BRAND value. Not "the ones we listed" - any colour that is not in lib/brand.ts is either
// drift or a new token that belongs there first.
const BRAND_HEXES = new Map(
  Object.entries(BRAND).map(([k, v]) => [String(v).toLowerCase(), k]),
);

/** #fff and #FFFFFF are the same colour and only one of them is written in lib/brand.ts. */
function normaliseHex(h) {
  const v = h.toLowerCase();
  return v.length === 4 ? `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}` : v;
}

const kitDir = join(here, '../brand/scripts');
let kitFiles = [];
try {
  kitFiles = readdirSync(kitDir).filter((f) => f.endsWith('.py')).sort();
} catch {
  problems.push('brand/scripts is missing. The render kit is committed; its absence is a mistake, not a pass.');
}
// A scan that examined nothing must not report clean. Same reason the location reconciliation
// returns `examined`.
if (kitFiles.length === 0 && !problems.some((p) => p.startsWith('brand/scripts is missing'))) {
  problems.push('brand/scripts contains no .py files, so this check proved nothing.');
}

let kitHexCount = 0;
for (const file of kitFiles) {
  const src = readFileSync(join(kitDir, file), 'utf8');
  src.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/#[0-9A-Fa-f]{6}\b|#[0-9A-Fa-f]{3}\b/g)) {
      kitHexCount++;
      const hex = normaliseHex(m[0]);
      if (!BRAND_HEXES.has(hex)) {
        problems.push(
          `brand/scripts/${file}:${i + 1} uses ${m[0]}, which is not a colour in lib/brand.ts. ` +
            `Add it there and to app/globals.css, or use the token that was meant.`,
        );
      }
    }
  });
}

// The README prints the palette as documentation, which is the copy most likely to be edited by
// somebody who is not editing code and least likely to be noticed when it goes stale.
const READ_ME_KEYS = {
  paper: 'paper', ink: 'ink', line: 'line', faint: 'faint',
  green: 'green', soft: 'soft', mute: 'mute', 'cell-dark': 'cellDark',
};
let readmePairs = 0;
try {
  const readme = readFileSync(join(here, '../brand/README.md'), 'utf8');
  for (const m of readme.matchAll(/(?:--)?([a-z][a-z-]*)\s+(#[0-9A-Fa-f]{6})\b/g)) {
    const key = READ_ME_KEYS[m[1]];
    if (!key) continue;
    readmePairs++;
    if (String(BRAND[key]).toLowerCase() !== m[2].toLowerCase()) {
      problems.push(`brand/README.md documents ${m[1]} as ${m[2]}, but lib/brand.ts ${key} is ${BRAND[key]}.`);
    }
  }
} catch {
  problems.push('brand/README.md is missing.');
}
if (readmePairs === 0 && !problems.some((p) => p.startsWith('brand/README.md is missing'))) {
  problems.push('brand/README.md declared no palette pairs, so that copy went unchecked.');
}

// ---------------------------------------------------------------------------------------
// THE SAMPLE PAGE'S NAV IS A SECOND COPY OF THE SITE'S, AND THIS IS WHAT STOPS IT DRIFTING.
//
// /sample returns a whole document from renderReport with its own stylesheet, because the site
// stylesheet and the report one define twenty five class names in common and loading both is a
// cascade collision this build has paid for twice. So the bar is rebuilt as .rnav-* inside
// REPORT_CSS rather than shared - which means the type values exist twice.
//
// The palette was already covered. Tracking, weight and size were not: brand/README.md recorded
// the nav at .11em for a day after it moved to .08em, in a file nobody was checking. A number
// written twice and enforced nowhere is a number that goes stale, so these four are compared.
const reportCss = readFileSync(join(here, '../lib/report-css.ts'), 'utf8');
const siteCss = readFileSync(join(here, '../app/globals.css'), 'utf8');

function declarationsOf(css, selector) {
  const at = css.indexOf(selector + '{') >= 0 ? css.indexOf(selector + '{') : css.indexOf(selector + ' {');
  if (at < 0) return null;
  const body = css.slice(at, css.indexOf('}', at));
  const out = {};
  // The final declaration in a minified block has no trailing semicolon, which is how this
  // helper first reported letter-spacing as missing on a rule that plainly had it.
  for (const m of body.matchAll(/([a-z-]+)\s*:\s*([^;{}]+)(?:;|$)/g)) out[m[1]] = m[2].trim();
  return out;
}

/**
 * Do two CSS values mean the same thing, written to two files' conventions?
 *
 * `.08em` and `0.08em` are one value; `uppercase` and `uppercase` are another. Comparing with
 * parseFloat alone made every keyword NaN and therefore unequal to itself, which is how this
 * check first failed on `text-transform: uppercase` against `text-transform: uppercase`.
 */
function sameValue(a, b) {
  if (a === undefined || b === undefined) return false;
  const na = parseFloat(a);
  const nb = parseFloat(b);
  if (Number.isNaN(na) || Number.isNaN(nb)) return a.trim() === b.trim();
  return na === nb && a.replace(/[\d.\s]/g, '') === b.replace(/[\d.\s]/g, '');
}

const siteNav = declarationsOf(siteCss, '.sitenav-links');
const reportNav = declarationsOf(reportCss, '.rnav-links');
const reportCta = declarationsOf(reportCss, '.rnav-cta');
const siteCta = declarationsOf(siteCss, '.button-green');

if (!siteNav || !reportNav) {
  problems.push('Could not read .sitenav-links or .rnav-links, so the sample nav went unchecked.');
} else {
  // Not font-family: the site writes var(--font-cond) and the report writes var(--cond), because
  // each names the token its own stylesheet defines. The RENDERED type is what has to agree.
  for (const prop of ['font-weight', 'font-size', 'text-transform', 'letter-spacing']) {
    const a = siteNav[prop];
    const b = reportNav[prop];
    if (!sameValue(a, b)) {
      problems.push(
        `The sample page's nav has ${prop}: ${b ?? 'nothing'} but the site's .sitenav-links has ` +
          `${a ?? 'nothing'}. One bar, two pages, two designs.`,
      );
    }
  }
}
if (siteCta && reportCta) {
  for (const prop of ['font-weight', 'font-size', 'letter-spacing', 'padding']) {
    const a = siteCta[prop];
    const b = reportCta[prop];
    if (!sameValue(a, b)) {
      problems.push(`The sample page's Free scan button has ${prop}: ${b} but the site's has ${a}.`);
    }
  }
}

if (problems.length) {
  console.error(`brandcheck: ${problems.length} problem(s).\n`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\nlib/brand.ts is the source of truth. Change it there first.');
  process.exit(1);
}

console.log(
  `brandcheck: clean. ${Object.keys(MAP).length} tokens agree between lib/brand.ts and ` +
    `app/globals.css; ${kitHexCount} hex literals across ${kitFiles.length} render-kit scripts ` +
    `and ${readmePairs} documented in brand/README.md are all BRAND values; the sample page's ` +
    `nav matches the site's.`,
);
