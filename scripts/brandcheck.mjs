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
import { readFileSync } from 'node:fs';

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

if (problems.length) {
  console.error(`brandcheck: ${problems.length} problem(s).\n`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\nlib/brand.ts is the source of truth. Change it there first.');
  process.exit(1);
}

console.log(`brandcheck: clean. ${Object.keys(MAP).length} tokens agree between lib/brand.ts and app/globals.css.`);
