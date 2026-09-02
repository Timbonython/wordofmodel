/**
 * Does the browser actually send our named Meta events?
 *
 *   npm run pixel:check                     builds, starts a server, checks, stops it
 *   npm run pixel:check -- https://...      against a deployment already running
 *   npm run pixel:strict                    the same, but a SKIP is a failure. In `npm run check`.
 *   PIXEL_CHECK_DOMAIN=x.com                use a particular already-scanned domain
 *   PIXEL_CHECK_PAID=yes                    allow a run that asks real engines, about US$0.37
 *   PIXEL_CHECK_NO_BUILD=yes                trust the build already on disk
 *   PIXEL_CHECK_PORT / _BASE / _COUNTRY / _EMAIL / _PIXEL_ID / _HEADED
 *
 * WHAT THE DEFAULT RUN COVERS, AND WHY IT IS USUALLY FREE. On 27 Aug 2026 Lead was moved off
 * Wizard mount - where it meant "somebody loaded /start" and the campaign was optimising toward
 * page renders - and into the reveal's success branch in ScanResult.tsx, where a person has
 * given a working address and had a real result returned. That was the right move and it has a
 * consequence for this file: reaching that branch means going through the scan.
 *
 * That is FREE on a domain this environment has already scanned - /api/detect returns the stored
 * result and no engine is asked - and costs about US$0.37 on one it has not. The Lead case
 * detects which it got and REPORTS ITSELF AS SKIPPED rather than quietly spending. A check that
 * costs money every time is a check nobody runs; one that silently stops covering something is
 * worse than one that says so.
 *
 * This file said Lead was at Wizard.tsx:121 for three days after that move, and reported a
 * failure that was the check being wrong rather than the code. A test describing behaviour the
 * code deliberately stopped having is the same defect as a stale comment, and it costs more,
 * because somebody acts on it.
 *
 * Needs a real Chrome, which is not something this project can install for you. Playwright
 * itself is a devDependency as of 2 Sep 2026 - it was not, and this file simply crashed on the
 * import for anyone who had not run the npm line that used to sit here. A check nobody can run
 * without reading its source first is a check nobody runs. It drives the Chrome already on the
 * machine (channel: 'chrome'), so no browser download is involved.
 *
 * WHY THIS EXISTS. For a fortnight a boot line said "browser funnel events are served" and
 * Meta had received exactly none of them, because the line described an intention and nothing
 * anywhere checked. A browser event is fired by a browser on somebody else's machine, so no
 * server log can ever confirm it. The only honest check drives a browser and watches the wire.
 *
 * WHAT IT PROVES AND WHAT IT DOES NOT. It proves our code calls fbq and that fbq puts a
 * request on the network with the right event name. It is NOT a check that Meta accepted the
 * event: use Events Manager for that.
 *
 * USE A THROWAWAY PIXEL ID. Measured 26 Aug 2026: the identical build sends PageView and
 * ViewContent under a made-up id and sends NOTHING under the real one, in the same browser, on
 * the same domain, headed or headless. Meta's per-pixel config carries automation detection
 * and a driven browser trips it, so pointing this at the live pixel produces a false negative
 * and no useful signal. A made-up id 404s that config, which is exactly what makes our own
 * behaviour visible.
 *
 *   META_PIXEL_ID=1000000000000001 npm run start
 *
 * The real pixel is verified by a person walking the funnel with Events Manager's Test Events
 * open. Both checks are needed and neither replaces the other.
 */
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * WHERE TO POINT, AND STARTING ONE IF THERE IS NOTHING THERE.
 *
 * Added 2 Sep 2026 so this can run from `npm run check` without a person having remembered to
 * build, start a server and set a throwaway pixel id in another terminal first. If something is
 * already answering - a server you started yourself, or a deployment passed as an argument - it
 * is used untouched. Otherwise this builds, starts one on a port nothing else uses, and stops it
 * again on the way out.
 *
 * IT BUILDS RATHER THAN TRUSTING .next. A stale build is the one failure this file cannot
 * report honestly: every event would pass against code that is no longer the code, and the
 * output would look identical to a real pass. Turbopack makes an incremental build cheap enough
 * that guessing is not worth it. PIXEL_CHECK_NO_BUILD=yes if you know the build is current.
 *
 * THE PIXEL ID IT STARTS WITH IS DELIBERATELY FAKE. See the note above: the identical build
 * sends nothing under the real id in a driven browser, because Meta's per-pixel config carries
 * automation detection. A server started here always gets the throwaway.
 */
const OWN_PORT = Number(process.env.PIXEL_CHECK_PORT ?? 3111);
const ARG_BASE = process.argv[2] ?? process.env.PIXEL_CHECK_BASE ?? null;

async function reachable(base) {
  try {
    const r = await fetch(base, { signal: AbortSignal.timeout(2500) });
    return r.ok || r.status < 500;
  } catch {
    return false;
  }
}

/**
 * A DOMAIN THIS ENVIRONMENT HAS ALREADY SCANNED, found rather than hardcoded.
 *
 * ViewContent and Lead both require reaching the free result, which is free on a domain with a
 * stored scan and about US$0.37 on one without. The default was holafly.com, and the day it
 * falls out of the 24 hour window both cases SKIP - which exits 0 and, from inside `npm run
 * check`, reads as a pass. Two of the three events this file exists to verify would quietly
 * stop being verified, and the suite would stay green.
 *
 * So it asks the database what has been scanned recently and uses that. Falls back to the old
 * default when there are no credentials, which keeps the script usable with no environment at
 * all - it will just skip, and say so.
 */
async function recentlyScannedDomain() {
  if (process.env.PIXEL_CHECK_DOMAIN) return process.env.PIXEL_CHECK_DOMAIN;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  const since = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
  try {
    const r = await fetch(
      `${url}/rest/v1/scans?select=domain,created_at&created_at=gte.${since}&order=created_at.desc&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000) },
    );
    if (!r.ok) return null;
    const [row] = await r.json();
    return row?.domain ?? null;
  } catch {
    return null;
  }
}

let ownServer = null;

async function resolveBase() {
  const preferred = ARG_BASE ?? 'http://localhost:3000';
  if (await reachable(preferred)) return preferred;
  if (ARG_BASE) {
    console.log(`\nNothing is answering at ${ARG_BASE}. Passing a base explicitly means using it as given.\n`);
    process.exit(1);
  }

  if (process.env.PIXEL_CHECK_NO_BUILD !== 'yes') {
    console.log('  building, so the events are checked against the current code');
    const built = spawnSync(join(root, 'node_modules', '.bin', 'next'), ['build'], { encoding: 'utf8' });
    if (built.status !== 0) {
      console.log(`\nThe build failed, so there is nothing honest to check.\n${built.stderr?.slice(-800) ?? ''}`);
      process.exit(1);
    }
  }

  const own = `http://localhost:${OWN_PORT}`;
  console.log(`  starting a server on ${OWN_PORT} with a throwaway pixel id`);
  /* THE BINARY, NOT npx. `npx next start` is two processes: killing npx leaves the next server
     it spawned holding the port, and the first version of this left one running after every
     successful run. Spawning node_modules/.bin/next directly means the pid we hold is the pid
     we kill. */
  ownServer = spawn(join(root, 'node_modules', '.bin', 'next'), ['start', '-p', String(OWN_PORT)], {
    /* The throwaway ALWAYS wins here, and it is not `?? process.env.META_PIXEL_ID`. This script
       reads .env.local so it can find a scanned domain, and .env.local is where the real pixel
       id lives - inheriting it would point a driven browser at the live pixel, which sends
       nothing and reports a false negative. PIXEL_CHECK_PIXEL_ID to override deliberately. */
    env: { ...process.env, META_PIXEL_ID: process.env.PIXEL_CHECK_PIXEL_ID ?? '1000000000000001' },
    stdio: 'ignore',
  });
  /* Unreferenced, and stopped explicitly at the end. A live child handle keeps the event loop
     alive on its own: without this the script finishes every case, sets an exit code and then
     hangs forever with a server running behind it, which is exactly what it did the first time
     it was put into `npm run check`. */
  ownServer.unref();
  for (let i = 0; i < 60; i++) {
    if (await reachable(own)) return own;
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log(`\nThe server never came up on ${OWN_PORT}.\n`);
  ownServer.kill('SIGKILL');
  process.exit(1);
}

function stopOwnServer() {
  if (ownServer && !ownServer.killed) ownServer.kill('SIGKILL');
  ownServer = null;
}
process.on('exit', stopOwnServer);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stopOwnServer(); process.exit(130); });

const BASE = await resolveBase();
const SCAN_DOMAIN = (await recentlyScannedDomain()) ?? 'holafly.com';

/**
 * Every named event the build intends to fire, and how a visitor causes it.
 *
 * `direct` is the load that used to break: a page opened cold, where React effects run before
 * a deferred script has defined fbq. Lead is the one that lives on a mount rather than a
 * click, so it is the canary for that ordering and it is checked first.
 */
/*
 * "Already scanned" means WITHIN THE LAST 24 HOURS, not ever. findCachedScan in lib/db.ts uses a
 * rolling day, so a domain scanned yesterday morning stops being free this morning. Worth saying
 * in the message: an earlier version said "has no stored scan here", which sent me looking for a
 * missing row that was sitting right there and merely too old.
 */
const SKIP_REASON =
  'that domain has no scan from the last 24 hours here, so this run would ask two engines and ' +
  'cost about US$0.37. PIXEL_CHECK_PAID=yes to allow it, or point PIXEL_CHECK_DOMAIN at a domain ' +
  'scanned in this environment today.';

/**
 * Walk the home page as far as the free result.
 *
 * ONE IMPLEMENTATION FOR BOTH CASES. ViewContent stops here and Lead carries on to the email,
 * and if the walk were written twice the two would eventually test different journeys without
 * anybody noticing - which is the whole failure this file exists to catch, reproduced inside it.
 *
 * Returns 'skip' when the domain has no stored scan and spending was not permitted.
 */
async function runScan(page, allowPaid) {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.locator('#scan input').first().fill(SCAN_DOMAIN);
  await page.locator('#scan button').first().click();

  /*
   * MATCHED ON THE STABLE HALF OF THE LABEL. The button read "Yes, run it" until the grounding
   * work on 1 Sep 2026 renamed it to "Looks right - ask the engines", or "That is right - ask
   * the engines" once a fact has been edited. This file went on looking for the old text and
   * reported it as /api/detect being slow, which is the exact failure its own header describes
   * two paragraphs up and cost another hour to find. "ask the engines" is the part that carries
   * the meaning; the half in front of it is a message about the visitor's edits.
   */
  const confirm = page.getByRole('button', { name: /ask the engines/i });
  const reveal = page.locator('#reveal-email');
  let cached = true;
  await Promise.race([
    confirm.waitFor({ timeout: 90000 }).then(() => { cached = false; }),
    reveal.waitFor({ timeout: 90000 }).then(() => { cached = true; }),
  ]).catch(async () => {
    /* WHAT IS ACTUALLY ON SCREEN, because the old message named one cause and it was usually
       the other. A renamed button and a failing API both time out here, and being told to go
       and look at /api/detect when the API is fine sends the next person the wrong way. */
    const screen = await page
      .evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 400))
      .catch(() => '(the page could not be read)');
    const buttons = await page
      .evaluate(() => Array.from(document.querySelectorAll('button')).map((b) => b.innerText.trim()).filter(Boolean))
      .catch(() => []);
    throw new Error(
      'Neither the confirmation card nor a result appeared within 90s.\n\n' +
        'This is a stale selector at least as often as it is a slow API: the confirm button ' +
        'has been renamed once already. Check the buttons below before touching /api/detect.\n\n' +
        `  buttons on the page: ${buttons.length ? buttons.map((b) => JSON.stringify(b)).join(', ') : '(none)'}\n` +
        `  page text: ${screen}`,
    );
  });

  if (!cached) {
    if (!allowPaid) return 'skip';
    await confirm.click();
    // Two engines. The slowest single capture measured 120s, so this is generous on purpose.
    await reveal.waitFor({ timeout: 300000 }).catch(() => {
      throw new Error('The scan never produced a result, so the reveal was never reached.');
    });
  }
  return cached ? 'cached' : 'ran';
}

const CASES = [
  {
    event: 'PageView',
    where: 'components/MetaPixel.tsx, snippet on load plus MetaRouteChange on soft navigation',
    async run(page) {
      await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
      const link = page.locator('a[href="/start"]').first();
      if (await link.count()) {
        await link.click();
        await page.waitForURL('**/start**', { timeout: 15000 }).catch(() => {});
      }
      await page.waitForTimeout(4000);
    },
  },
  {
    event: 'ViewContent',
    where: 'components/scan/ScanPanel.tsx, the free result on screen - moved there 31 Aug 2026',
    /*
     * STOPS AT THE RESULT. It used to fire two lines from Lead in the reveal branch, so the two
     * were one action under two names and this file could not have told them apart either. The
     * check now walks only as far as the free result, which is exactly what the event claims.
     */
    async run(page, { allowPaid }) {
      const cached = await runScan(page, allowPaid);
      if (cached === 'skip') return { skipped: SKIP_REASON };
      return {};
    },
  },
  {
    event: 'Lead',
    where: 'components/scan/ScanResult.tsx, the reveal success branch - moved there 27 Aug 2026',
    /*
     * FREE ON A DOMAIN THAT HAS ALREADY BEEN SCANNED, AND THAT IS THE WHOLE TRICK.
     *
     * /api/detect does not merely detect. On a domain with a stored scan it returns the RESULT,
     * cached, and the profile confirmation screen never appears - no engines run and nothing is
     * spent. On an unscanned domain it stops at that screen and agreeing to it asks two engines,
     * about US$0.37 and up to two minutes.
     *
     * So this races the two outcomes rather than assuming either. That was learned the annoying
     * way: written for the confirmation step, it failed twice against a cached domain and the
     * error said the button had not appeared, which was true and completely misleading.
     *
     * PIXEL_CHECK_DOMAIN must therefore name a domain this environment has scanned before. If it
     * has not, the case reports itself as costing money and skips, rather than quietly spending.
     */
    async run(page, { allowPaid }) {
      const cached = await runScan(page, allowPaid);
      if (cached === 'skip') return { skipped: SKIP_REASON };
      const reveal = page.locator('#reveal-email');
      await reveal.fill(process.env.PIXEL_CHECK_EMAIL ?? 'pixel-check@example.com');
      await reveal.press('Enter');
      await page.waitForTimeout(9000);
      return {};
    },
  },
];

const browser = await chromium.launch({
  channel: 'chrome',
  headless: process.env.PIXEL_CHECK_HEADED !== 'yes',
});

let failures = 0;
let skipped = 0;
const runPaid = process.env.PIXEL_CHECK_PAID === 'yes';

for (const c of CASES) {
  const seen = [];
  const context = await browser.newContext({
    // Vercel sets this on every production request and nothing sets it locally. Without it
    // metaAllowedFor() treats the country as unknown, refuses to track, and the pixel is never
    // rendered - so a local run would report "no events" for the wrong reason entirely.
    extraHTTPHeaders: { 'x-vercel-ip-country': process.env.PIXEL_CHECK_COUNTRY ?? 'US' },
  });
  const page = await context.newPage();
  page.on('request', (r) => {
    const u = r.url();
    if (!/facebook\.(com|net)/.test(u)) return;
    try {
      const ev = new URL(u).searchParams.get('ev');
      if (ev) seen.push({ ev, dl: new URL(u).searchParams.get('dl') });
    } catch {}
  });
  page.on('console', (m) => {
    if (m.type() === 'warning' && m.text().includes('Meta pixel')) {
      console.log(`      browser warned: ${m.text().slice(0, 140)}`);
    }
  });

  const outcome = (await c.run(page, { allowPaid: runPaid })) ?? {};
  if (outcome.skipped) {
    skipped++;
    console.log(`SKIP  ${c.event.padEnd(18)} ${c.where}`);
    console.log(`        ${outcome.skipped}`);
    await context.close();
    continue;
  }
  // Leaving the page is what a real visitor does, and modern fbevents can hold a batch until
  // then. Without this a real send looks like a missing one.
  await page.goto('about:blank', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await new Promise((r) => setTimeout(r, 2000));

  const hit = seen.find((s) => s.ev === c.event);
  console.log(`${hit ? 'ok  ' : 'FAIL'}  ${c.event.padEnd(18)} ${c.where}`);
  for (const s of seen) console.log(`        sent ${s.ev.padEnd(16)} url=${s.dl ?? '-'}`);
  if (!hit) {
    failures++;
    if (!seen.length) console.log('        nothing reached Meta at all');
  }
  await context.close();
}

await browser.close();
stopOwnServer();

// A SKIPPED CASE IS REPORTED, NEVER FOLDED INTO A PASS. "Every named event put a request on the
// wire" over one of two cases reads identically to the same line over both, and this build has
// been bitten by exactly that shape more than once - a reconciliation over zero subscriptions, a
// brandcheck over no files. Say what was covered.
const ran = CASES.length - skipped;
if (failures) {
  console.log(`\n${failures} event(s) never reached the wire.`);
} else if (skipped) {
  console.log(`\n${ran} of ${CASES.length} events put a request on the wire. ${skipped} SKIPPED and unverified.`);
  console.log(`  domain used: ${SCAN_DOMAIN}`);
  console.log('PIXEL_CHECK_PAID=yes npm run pixel:check   to cover the rest, at about US$0.37.');
} else {
  console.log(`\nEvery named event put a request on the wire. (domain: ${SCAN_DOMAIN})`);
}

/*
 * STRICT IS FOR THE SUITE. Standalone, a skip is information and exit 0 is right - you asked to
 * look, and it told you what it could see. Inside `npm run check` the same exit code is a claim
 * that the pixel is verified, printed among forty other lines nobody reads to the end. §5: the
 * absence has to look different from the presence, and here it has to be the exit code, because
 * that is the only part of the output the next command reads.
 */
const strict = process.env.PIXEL_CHECK_STRICT === 'yes';
if (strict && skipped) {
  console.log(
    `\nStrict: ${skipped} unverified event(s) is a failure here, not a note. Scan any domain in ` +
      'this environment and run again, or PIXEL_CHECK_PAID=yes to spend about US$0.37.',
  );
}
process.exitCode = failures || (strict && skipped) ? 1 : 0;
