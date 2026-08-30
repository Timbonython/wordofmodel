/**
 * Does the browser actually send our named Meta events?
 *
 *   npm run pixel:check                     against a local production build
 *   npm run pixel:check -- https://...      against a deployment
 *   PIXEL_CHECK_DOMAIN=x.com npm run pixel:check   use a different already-scanned domain
 *   PIXEL_CHECK_PAID=yes npm run pixel:check       allow a run that asks real engines
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
 * Needs Playwright and a real Chrome, neither of which is a dependency of this project:
 *   npm i --no-save playwright && NODE_PATH=./node_modules npm run pixel:check
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

const BASE = process.argv[2] ?? 'http://localhost:3000';

/**
 * Every named event the build intends to fire, and how a visitor causes it.
 *
 * `direct` is the load that used to break: a page opened cold, where React effects run before
 * a deferred script has defined fbq. Lead is the one that lives on a mount rather than a
 * click, so it is the canary for that ordering and it is checked first.
 */
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
      await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
      await page.locator('#scan input').first().fill(process.env.PIXEL_CHECK_DOMAIN ?? 'holafly.com');
      await page.locator('#scan button').first().click();

      const confirm = page.getByRole('button', { name: /yes, run it/i });
      const reveal = page.locator('#reveal-email');
      let cached = true;
      await Promise.race([
        confirm.waitFor({ timeout: 90000 }).then(() => { cached = false; }),
        reveal.waitFor({ timeout: 90000 }).then(() => { cached = true; }),
      ]).catch(() => {
        throw new Error(
          'Neither the confirmation nor a result appeared. /api/detect is slow or failed - open ' +
            'the page by hand before believing anything about the pixel.',
        );
      });

      if (!cached) {
        if (!allowPaid) {
          return { skipped: 'that domain has no stored scan here, so this run would ask two engines and cost about US$0.37. PIXEL_CHECK_PAID=yes to allow it, or point PIXEL_CHECK_DOMAIN at a domain already scanned in this environment.' };
        }
        await confirm.click();
        // Two engines. The slowest single capture measured 120s, so this is generous on purpose.
        await reveal.waitFor({ timeout: 300000 }).catch(() => {
          throw new Error('The scan never produced a result, so the reveal was never reached.');
        });
      }

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

// A SKIPPED CASE IS REPORTED, NEVER FOLDED INTO A PASS. "Every named event put a request on the
// wire" over one of two cases reads identically to the same line over both, and this build has
// been bitten by exactly that shape more than once - a reconciliation over zero subscriptions, a
// brandcheck over no files. Say what was covered.
const ran = CASES.length - skipped;
if (failures) {
  console.log(`\n${failures} event(s) never reached the wire.`);
} else if (skipped) {
  console.log(`\n${ran} of ${CASES.length} events put a request on the wire. ${skipped} SKIPPED and unverified.`);
  console.log('PIXEL_CHECK_PAID=yes npm run pixel:check   to cover the rest, at about US$0.37.');
} else {
  console.log('\nEvery named event put a request on the wire.');
}
process.exitCode = failures ? 1 : 0;
