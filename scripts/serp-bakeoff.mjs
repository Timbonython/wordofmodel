#!/usr/bin/env node
/**
 * The SERP provider bake-off.
 *
 * Runs the same five real US buyer questions through both candidate providers, in the
 * same window as a clean logged-out browser on a US VPN, and compares all three.
 *
 * WHY IT RUNS THROUGH lib/serp AND NOT ITS OWN FETCH CALLS. Whichever provider wins is
 * already integrated when it does, and the comparison then tests the parser we ship
 * rather than only the vendor. A provider returning good data that our code reads
 * badly fails for a reason worth finding now, not in month two.
 *
 * WHY BOTH RUN IN THEIR BEST-CONFIGURED STATE. DataForSEO serves AI Overviews from
 * cache unless load_async_ai_overview is set, and SerpApi returns a page_token instead
 * of text when the overview has not settled. Either default produces a false "no AI
 * Overview" - which is the exact failure this test exists to detect - so testing
 * defaults would decide the question on a config flag rather than on the provider.
 *
 * THE DECISION RULE, FIXED BEFORE THE DATA EXISTS so it cannot be rationalised after:
 *   1. Lowest FALSE NEGATIVE rate wins. A missed overview makes the number a lie.
 *   2. Tiebreak on CITATION COVERAGE against the browser. "Most cited domains, so the
 *      subscriber can see who owns the answer" is section 5 of the report, and a
 *      provider returning a quarter of the citations makes that section wrong.
 *   3. Cost is a distant third. At five calls per subscriber per month it is cents.
 *
 * Usage:
 *   npm run bakeoff            run both providers, write bakeoff/api-results.json
 *   npm run bakeoff -- --report   compare against bakeoff/control.json and report
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BAKEOFF = join(ROOT, 'bakeoff');

/**
 * lib/ is TypeScript carrying `server-only`, which throws outside a React Server
 * Component. Compiling to CommonJS and stripping that one import is packaging, not
 * reimplementation: the provider modules being exercised are byte-for-byte the ones
 * the pipeline uses.
 */
function loadLib() {
  const out = mkdtempSync(join(tmpdir(), 'wom-bakeoff-'));
  const r = spawnSync(
    'npx',
    ['tsc', 'lib/serp/index.ts', '--ignoreConfig', '--outDir', out,
     '--module', 'commonjs', '--target', 'ES2022', '--esModuleInterop', '--skipLibCheck'],
    { cwd: ROOT, encoding: 'utf8' },
  );
  const emitted = existsSync(join(out, 'serp')) && readdirSync(join(out, 'serp')).length > 0;
  if (!emitted) {
    console.error(r.stdout || r.stderr);
    throw new Error('Could not compile lib/serp for the bake-off.');
  }
  for (const dir of [out, join(out, 'serp'), join(out, 'engines')]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.js'))) {
      const p = join(dir, f);
      writeFileSync(p, readFileSync(p, 'utf8').replace(/^require\("server-only"\);?$/gm, ''));
    }
  }
  return out;
}

async function run() {
  const libDir = loadLib();
  const { PROVIDERS } = await import(join(libDir, 'serp', 'index.js'));
  const spec = JSON.parse(readFileSync(join(BAKEOFF, 'questions.json'), 'utf8'));

  const results = [];
  for (const q of spec.questions) {
    for (const name of ['serpapi', 'dataforseo']) {
      const started = Date.now();
      try {
        const r = await PROVIDERS[name].fetchAiOverview({ query: q.text, country: spec.market });
        results.push({
          slot: q.slot, question: q.text, provider: name,
          present: r.present,
          text: r.text,
          first_sentence: (r.text || '').replace(/\s+/g, ' ').slice(0, 200),
          citation_count: r.citations.length,
          domains: [...new Set(r.citations.map((c) => c.domain))],
          cost_usd: r.costUsd, requests: r.requests, notes: r.notes,
          latency_ms: Date.now() - started,
        });
        console.log(`  ${q.slot.padEnd(14)} ${name.padEnd(11)} present=${String(r.present).padEnd(5)} citations=${String(r.citations.length).padEnd(3)} ${((Date.now() - started) / 1000).toFixed(1)}s`);
      } catch (e) {
        results.push({ slot: q.slot, question: q.text, provider: name, error: e.message, kind: e.kind ?? null });
        console.log(`  ${q.slot.padEnd(14)} ${name.padEnd(11)} FAILED ${e.message}`);
      }
    }
  }

  const path = join(BAKEOFF, 'api-results.json');
  writeFileSync(path, JSON.stringify({ ran_at: new Date().toISOString(), market: spec.market, results }, null, 2));
  console.log(`\nWritten to ${path}`);
  console.log('Now fill in bakeoff/control.json from the browser, then: npm run bakeoff -- --report');
}

function report() {
  const api = JSON.parse(readFileSync(join(BAKEOFF, 'api-results.json'), 'utf8'));
  const controlPath = join(BAKEOFF, 'control.json');
  if (!existsSync(controlPath)) {
    throw new Error('bakeoff/control.json not found. Copy control.template.json and fill it in from the browser.');
  }
  const control = JSON.parse(readFileSync(controlPath, 'utf8'));
  const byslot = Object.fromEntries(control.results.map((r) => [r.slot, r]));

  const tally = {};
  for (const name of ['serpapi', 'dataforseo']) {
    tally[name] = { falseNeg: 0, falsePos: 0, agree: 0, citations: 0, browserCitations: 0, cost: 0, requests: 0, errors: 0 };
  }

  console.log('\nslot            browser   serpapi              dataforseo');
  console.log('-'.repeat(72));
  for (const r of control.results) {
    const row = [r.slot.padEnd(15), (r.ai_overview_shown ? `yes(${r.sources_listed})` : 'no').padEnd(9)];
    for (const name of ['serpapi', 'dataforseo']) {
      const a = api.results.find((x) => x.slot === r.slot && x.provider === name);
      const t = tally[name];
      if (!a || a.error) { t.errors++; row.push('ERROR'.padEnd(21)); continue; }
      t.cost += a.cost_usd || 0;
      t.requests += a.requests || 0;
      if (r.ai_overview_shown && !a.present) { t.falseNeg++; row.push('MISSED'.padEnd(21)); continue; }
      if (!r.ai_overview_shown && a.present) { t.falsePos++; row.push('phantom'.padEnd(21)); continue; }
      if (r.ai_overview_shown && a.present) {
        t.agree++;
        t.citations += a.citation_count;
        t.browserCitations += r.sources_listed || 0;
      }
      row.push(`ok (${a.citation_count} cites)`.padEnd(21));
    }
    console.log(row.join(' '));
  }

  console.log('\n' + '='.repeat(72));
  for (const name of ['serpapi', 'dataforseo']) {
    const t = tally[name];
    const cov = t.browserCitations ? ((t.citations / t.browserCitations) * 100).toFixed(0) + '%' : 'n/a';
    console.log(`${name}: falseNegatives=${t.falseNeg} falsePositives=${t.falsePos} agreed=${t.agree} errors=${t.errors}`);
    console.log(`  citation coverage vs browser: ${cov} (${t.citations} returned vs ${t.browserCitations} listed)`);
    console.log(`  cost: $${t.cost.toFixed(4)} across ${t.requests} requests`);
  }
  console.log('\nRule: fewest false negatives wins. Tiebreak on citation coverage. Cost third.');
}

const isReport = process.argv.includes('--report');
await (isReport ? Promise.resolve(report()) : run());
