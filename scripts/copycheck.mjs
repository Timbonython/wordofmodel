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

if (failures) {
  console.error(`\ncopycheck: ${failures} problem${failures === 1 ? '' : 's'}.`);
  process.exit(1);
}
console.log('copycheck: clean.');
