/**
 * Every file CLAUDE.md claims to have, opened.
 *
 * WHY THIS EXISTS. The Files table in CLAUDE.md listed seven artifacts. Three of them -
 * wordofmodel-offer-sheet.md, wordofmodel-ad-copy.md, wordofmodel-site.html - had never
 * existed in this repo, in any commit, on any branch. `git rev-list --all` finds no tree
 * containing them; the table was written in the first commit (0c2d740, 17 Aug 2026) already
 * describing three files that were not beside it, and was never edited again. Nothing read
 * the table, so nothing could notice. A list of filenames that nothing validates goes stale
 * silently, and this one was stale from the first commit and stayed that way for twelve days.
 *
 * The check is on the table because the table is where the claim is made, not where it is
 * eventually believed.
 *
 * Two absences are made loud rather than quiet:
 *   - a listed file that is not on disk fails;
 *   - a Files section that parses to zero rows fails, because an empty table and a fully
 *     satisfied table would otherwise print the same clean pass.
 *
 * Output is buffered and written once. The first run of this script interleaved stdout and
 * stderr and printed a FAIL three lines away from its own reason, which is its own small
 * version of the defect it exists to catch.
 *
 * SCOPE, and why it is not the whole document. The first version scanned every backticked
 * `wordofmodel-*.md`/`.html` token in CLAUDE.md and immediately failed on the dated section
 * that exists to record that three of those files never existed. The rest of this document is
 * a history: it names things that were removed, renamed or never built, and naming them is the
 * job. Only the "## Files" section asserts that a file is on disk right now, so only that
 * section is read. Watched producing that false positive on 30 Aug 2026 before being narrowed.
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = [];
const say = (line) => out.push(line);

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOC = 'CLAUDE.md';
const docPath = join(ROOT, DOC);

if (!existsSync(docPath)) {
  say(`  FAIL  ${DOC} is not in the repo root. There is no table to check.`);
  say(`\ndocs: 1 FAILED\n`);
  process.stdout.write(out.join('\n') + '\n');
  process.exit(1);
}

const text = readFileSync(docPath, 'utf8');
const lines = text.split('\n');

// --- The Files table -------------------------------------------------------
// The section runs from the "## Files" heading to the next heading at the same level or above.
const startIdx = lines.findIndex((l) => /^##\s+Files\s*$/.test(l));
let sectionStart = startIdx;
let sectionEnd = lines.length;

let failures = 0;
const listed = [];

if (startIdx === -1) {
  failures++;
  say(`  FAIL  ${DOC} has no "## Files" section. Either it was renamed, or the`);
  say(`        inventory was removed. This check cannot silently pass on absence.`);
} else {
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^#{1,2}\s+\S/.test(lines[i])) { endIdx = i; break; }
  }
  sectionEnd = endIdx;
  const section = lines.slice(startIdx, endIdx);

  // Rows look like: | `path` | description |
  for (let i = 0; i < section.length; i++) {
    const m = section[i].match(/^\|\s*`([^`]+)`\s*\|/);
    if (m) listed.push({ path: m[1].trim(), line: startIdx + i + 1 });
  }

  if (listed.length === 0) {
    failures++;
    say(`  FAIL  The "## Files" section parses to zero rows.`);
    say(`        An empty inventory must not read the same as a satisfied one.`);
  }
}

for (const { path: rel, line } of listed) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) {
    failures++;
    say(`  FAIL  ${rel}`);
    say(`        listed in the Files table at ${DOC}:${line}, not on disk`);
    continue;
  }
  const bytes = statSync(abs).size;
  if (bytes === 0) {
    failures++;
    say(`  FAIL  ${rel}`);
    say(`        listed at ${DOC}:${line}, present but empty (0 bytes)`);
    continue;
  }
  say(`  PASS  ${rel}  (${bytes} bytes)`);
}

// --- Artifact filenames named in the Files section's prose ------------------
// The same drift reaches sentences, not only rows: the line under the table read
// "Drop `wordofmodel-site.html` in as index.html and it works" about a file that was
// not there. Backticked wordofmodel-*.md/.html tokens inside the Files section are
// claims about the filesystem and are checked as such. Outside it they are history.
const prose = new Map();
if (sectionStart !== -1) {
  for (let i = sectionStart; i < sectionEnd; i++) {
    for (const m of lines[i].matchAll(/`(wordofmodel-[A-Za-z0-9._-]+\.(?:md|html))`/g)) {
      if (!prose.has(m[1])) prose.set(m[1], i + 1);
    }
  }
}
for (const { path: p } of listed) prose.delete(p);

for (const rel of [...prose.keys()].sort()) {
  const where = `${DOC}:${prose.get(rel)}`;
  if (!existsSync(join(ROOT, rel))) {
    failures++;
    say(`  FAIL  ${rel}`);
    say(`        named in prose at ${where}, not on disk`);
  } else {
    say(`  PASS  ${rel}  (named in prose at ${where})`);
  }
}

const checked = listed.length + prose.size;
say(
  failures
    ? `\ndocs: ${failures} FAILED of ${checked} claim${checked === 1 ? '' : 's'} checked\n`
    : `\ndocs: clean. ${checked} file${checked === 1 ? '' : 's'} claimed by ${DOC}, ${checked} opened.\n`
);
process.stdout.write(out.join('\n') + '\n');
process.exit(failures ? 1 : 0);
