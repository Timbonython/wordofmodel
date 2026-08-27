/**
 * Does the Meta pixel actually fire?
 *
 *   npm run pixel                          # production, real geography
 *   npm run pixel -- --url http://localhost:3111 --country AU
 *   npm run pixel -- --url http://localhost:3111 --country GB   # expect nothing
 *
 * WHY A BROWSER AND NOT CURL. The pixel is injected by next/script with
 * strategy="afterInteractive", so the loader and fbq are not in the server HTML at all.
 * Grepping the response for fbevents.js finds nothing on a page where the pixel works
 * perfectly, which is a false negative that costs an afternoon. What IS in the HTML is the
 * pixelId prop on the MetaPixel component, and that only tells you the server decided to
 * serve it. The only honest test of "did an event reach Meta" is watching the network.
 *
 * WHAT IT WATCHES. Requests to facebook.com/tr, which is where the pixel reports. The event
 * name is the ev= query parameter. PageView comes from the loader itself; ViewContent, Lead
 * and InitiateCheckout come from metaTrack().
 *
 * THE COUNTRY HEADER. metaAllowedFor() reads x-vercel-ip-country, which only Vercel sets, so
 * against localhost the pixel never renders unless the header is supplied. Against production
 * the header is set at the edge from the real client IP and anything sent here is ignored,
 * which is correct: from Australia, production is already exercising the AU path.
 *
 * Zero dependencies. Chrome is driven over the DevTools Protocol using Node's built-in
 * WebSocket rather than adding puppeteer for one script.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const TARGET = arg('url', 'https://wordofmodel.ai');
const COUNTRY = arg('country', 'AU');
const KEEP_OPEN = process.argv.includes('--headed');
const ALL_NET = process.argv.includes('--all');
/** Watch only. Do not fire anything ourselves, so what appears is what the PAGE sent. */
const OBSERVE_ONLY = process.argv.includes('--observe');

const isLocal = /localhost|127\.0\.0\.1/.test(TARGET);

// ---------------------------------------------------------------- chrome
const profile = await mkdtemp(join(tmpdir(), 'pixel-probe-'));
const chrome = spawn(
  CHROME,
  [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    ...(KEEP_OPEN ? [] : ['--headless=new']),
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=Translate,OptimizationHints',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

const cleanup = async () => {
  chrome.kill();
  await rm(profile, { recursive: true, force: true }).catch(() => {});
};
process.on('exit', () => chrome.kill());

async function endpoint() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return (await r.json()).webSocketDebuggerUrl;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Chrome did not open a debugging port');
}

// ---------------------------------------------------------------- cdp
let nextId = 1;
const pending = new Map();
const listeners = [];

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.addEventListener('open', () => resolve(ws));
    ws.addEventListener('error', () => reject(new Error(`Could not connect to ${url}`)));
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve: done, reject: fail } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? fail(new Error(msg.error.message)) : done(msg.result);
      } else if (msg.method) {
        for (const fn of listeners) fn(msg);
      }
    });
  });
}

function send(ws, method, params = {}, sessionId) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}

// ---------------------------------------------------------------- run
const browserWs = await connect(await endpoint());
const { targetId } = await send(browserWs, 'Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send(browserWs, 'Target.attachToTarget', { targetId, flatten: true });

const cdp = (method, params) => send(browserWs, method, params, sessionId);

/** Every request the pixel made, in order. */
const fired = [];

/**
 * Everything Meta-related, whether it reported an event or not.
 *
 * fbq is defined by the inline stub, which queues calls and only flushes them once
 * fbevents.js has loaded. So "typeof fbq === 'function'" is true even when the loader never
 * arrived and nothing will ever be sent. Watching the loader itself is what tells those two
 * states apart.
 */
const loader = [];
const everything = [];
const requestUrls = new Map();

listeners.push((msg) => {
  if (msg.sessionId !== sessionId) return;
  const p = msg.params ?? {};

  if (msg.method === 'Network.requestWillBeSent') {
    const url = p.request?.url ?? '';
    if (ALL_NET) everything.push({ url, method: p.request?.method, at: Date.now() });
    if (!/facebook\.(com|net)/.test(url)) return;
    requestUrls.set(p.requestId, url);
    if (/facebook\.com\/(tr|privacy_sandbox)/.test(url)) {
      let ev = '(none)';
      let id = '';
      try {
        const u = new URL(url);
        ev = u.searchParams.get('ev') || '(none)';
        id = u.searchParams.get('id') || '';
      } catch {
        /* keep the raw */
      }
      fired.push({ ev, id, at: Date.now() });
    } else {
      loader.push({ stage: 'request', url, at: Date.now() });
    }
    return;
  }

  if (msg.method === 'Network.responseReceived') {
    const url = requestUrls.get(p.requestId);
    if (url && !/facebook\.com\/tr/.test(url)) {
      loader.push({ stage: `response ${p.response?.status}`, url, at: Date.now() });
    }
    return;
  }

  if (msg.method === 'Network.loadingFailed') {
    const url = requestUrls.get(p.requestId);
    if (url) {
      loader.push({ stage: `FAILED ${p.errorText || ''}${p.blockedReason ? ` blocked:${p.blockedReason}` : ''}`, url, at: Date.now() });
    }
  }
});

/**
 * Everything the page says out loud, at any level.
 *
 * fbevents.js explains most of its refusals on the console and nowhere else: an invalid id, an
 * unverified domain, a duplicate pixel, a restricted account. At error level only, all of that
 * is missed, because it warns rather than errors.
 */
const consoleErrors = [];
listeners.push((msg) => {
  if (msg.sessionId !== sessionId) return;
  if (msg.method === 'Log.entryAdded') {
    const e = msg.params?.entry;
    if (e?.text) consoleErrors.push(`[${e.level}] ${e.text.slice(0, 220)}`);
    return;
  }
  if (msg.method === 'Runtime.consoleAPICalled') {
    const text = (msg.params?.args ?? [])
      .map((a) => a.value ?? a.description ?? '')
      .join(' ')
      .trim();
    if (text) consoleErrors.push(`[${msg.params.type}] ${text.slice(0, 220)}`);
  }
});

await cdp('Network.enable');
await cdp('Page.enable');
await cdp('Runtime.enable');
await cdp('Log.enable');

if (isLocal) {
  await cdp('Network.setExtraHTTPHeaders', { headers: { 'x-vercel-ip-country': COUNTRY } });
}

console.log(`\n  target   ${TARGET}`);
console.log(`  country  ${isLocal ? `${COUNTRY} (header injected)` : 'set by Vercel from the real client IP'}`);
console.log('');

const started = Date.now();
await cdp('Page.navigate', { url: TARGET });

// The loader is fetched from connect.facebook.net and then reports. Give it real time.
await new Promise((r) => setTimeout(r, 6_000));

// Is the pixel actually present in the live DOM?
const present = await cdp('Runtime.evaluate', {
  expression: 'typeof window.fbq === "function"',
  returnByValue: true,
});
const hasFbq = present.result?.value === true;

const pixelIdInDom = await cdp('Runtime.evaluate', {
  expression: `(document.body.innerHTML.match(/fbq\\('init', '(\\d+)'\\)/) || [])[1] || (window.fbq && window.fbq.instance && "present") || ""`,
  returnByValue: true,
});

console.log(`  window.fbq is a function   ${hasFbq ? 'yes' : 'NO'}`);
console.log(`  PageView on the wire       ${fired.some((f) => f.ev === 'PageView') ? 'yes' : 'NO'}`);

/**
 * What the pixel thinks of itself.
 *
 * A stub that never got its loader still queues, so fbq.loaded and the queue length are what
 * separate "not loaded yet" from "loaded and declining to send".
 */
const state = await cdp('Runtime.evaluate', {
  expression: `(() => {
    const f = window.fbq;
    if (typeof f !== 'function') return { fbq: 'absent' };
    const out = {
      loaded: f.loaded === true,
      version: f.version || null,
      queued: Array.isArray(f.queue) ? f.queue.length : null,
    };
    try {
      const s = f.getState && f.getState();
      if (s) {
        out.pixels = (s.pixels || []).map((p) => ({ id: p.id, userAgentDataDecoded: !!p.userAgent }));
        out.pixelCount = (s.pixels || []).length;
      }
    } catch (e) { out.getStateError = String(e).slice(0, 120); }
    return out;
  })()`,
  returnByValue: true,
});
console.log(`  pixel state                ${JSON.stringify(state.result?.value)}`);

// Fire the three the browser is allowed to send, exactly as metaTrack() does.
if (hasFbq && !OBSERVE_ONLY) {
  for (const ev of ['ViewContent', 'Lead', 'InitiateCheckout']) {
    await cdp('Runtime.evaluate', { expression: `window.fbq('track', ${JSON.stringify(ev)})` });
    await new Promise((r) => setTimeout(r, 900));
  }
  await new Promise((r) => setTimeout(r, 1_500));
}

console.log('\n  the loader (connect.facebook.net):');
if (!loader.length) {
  console.log('    NOTHING. fbevents.js was never even requested.');
} else {
  for (const l of loader) {
    console.log(`    +${((l.at - started) / 1000).toFixed(1).padStart(5)}s  ${l.stage}  ${l.url.slice(0, 78)}`);
  }
}

if (consoleErrors.length) {
  console.log('\n  console output:');
  for (const e of consoleErrors.slice(0, 14)) console.log(`    ${e}`);
}

if (ALL_NET) {
  console.log(`\n  every request the page made (${everything.length}):`);
  const hosts = new Map();
  for (const e of everything) {
    let h = e.url;
    try { h = new URL(e.url).host; } catch { /* data: and blob: */ }
    hosts.set(h, (hosts.get(h) ?? 0) + 1);
  }
  for (const [h, n] of [...hosts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(n).padStart(3)}  ${h}`);
  }
  const offsite = everything.filter((e) => {
    try { const h = new URL(e.url).host; return !/localhost|127\.0\.0\.1|wordofmodel\.ai/.test(h); } catch { return false; }
  });
  console.log(`\n  off-site requests (${offsite.length}):`);
  for (const e of offsite) console.log(`    ${e.method} ${e.url.slice(0, 100)}`);
}

console.log('\n  requests to facebook.com/tr:');
if (!fired.length) {
  console.log('    none');
} else {
  for (const f of fired) {
    const secs = ((f.at - started) / 1000).toFixed(1);
    console.log(`    +${secs.padStart(5)}s  ev=${f.ev}${f.id ? `  id=${f.id}` : ''}`);
  }
}

const names = new Set(fired.map((f) => f.ev));
const expected = ['PageView', 'ViewContent', 'Lead', 'InitiateCheckout'];
const missing = expected.filter((e) => !names.has(e));

console.log('');
if (!hasFbq && !fired.length) {
  console.log('  VERDICT: no pixel on this page.');
  console.log('           Expected when the country is not tracked or META_PIXEL_ID is unset.');
} else if (missing.length) {
  console.log(`  VERDICT: pixel loaded but these never reached the wire: ${missing.join(', ')}`);
} else {
  console.log('  VERDICT: pixel loaded and all four events reached Meta.');
}
console.log('');
console.log('  Note: this proves the pixel and metaTrack() work. It does not prove the call');
console.log('  sites run. ViewContent fires in the success branch of the reveal in');
console.log('  ScanResult.tsx, which needs a completed scan and a submitted email.');
console.log('');

await cleanup();
process.exit(0);
