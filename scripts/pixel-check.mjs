/**
 * Does the browser actually send our named Meta events?
 *
 *   npm run pixel:check                     against a local production build
 *   npm run pixel:check -- https://...      against a deployment
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
    event: 'Lead',
    where: 'components/wizard/Wizard.tsx:121, useMetaEvent on wizard mount',
    async run(page) {
      await page.goto(`${BASE}/start`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(6000);
    },
  },
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
];

const browser = await chromium.launch({
  channel: 'chrome',
  headless: process.env.PIXEL_CHECK_HEADED !== 'yes',
});

let failures = 0;

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

  await c.run(page);
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

console.log(
  failures
    ? `\n${failures} event(s) never reached the wire.`
    : '\nEvery named event put a request on the wire.',
);
process.exitCode = failures ? 1 : 0;
