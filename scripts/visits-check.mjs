/**
 * Guards on the traffic instrument. No network, no database, no environment beyond a salt it
 * sets itself - so it runs in `npm run check` alongside the other guards.
 *
 * WHAT IT IS ACTUALLY PROTECTING, because a test that does not say this rots into ceremony:
 *
 *   1. THE TIMEZONE. Every window in the daily report is an Adelaide day. Adelaide is +9:30,
 *      and +10:30 from the first Sunday in October. A UTC date here would put the last nine and
 *      a half hours of every evening in the following day's bucket - a phantom nightly dip with
 *      nothing to explain it, and nobody would suspect the date function.
 *
 *   2. THE PREFETCH. next/link prefetches on hover and on viewport entry. If those were counted
 *      one visitor scrolling the home page becomes six, which is the same class of inflation as
 *      the 28 Aug phantom 4.6x. These are the only headers that separate a navigation from the
 *      machinery around one, and a Next upgrade could change them.
 *
 *   3. THE JOIN. visits.ip_hash must be byte-identical to what lib/ratelimit.ts writes into
 *      scans.ip_hash, or the visit-to-scan rate silently becomes zero rather than failing. The
 *      formula is duplicated on purpose - lib/ratelimit.ts is server-only and drags the whole
 *      Supabase client behind it - so this is the thing that keeps the copies honest.
 *
 *   4. THE RECORDER'S TAGS. @microsoft/clarity's setTag calls window.clarity with no check that
 *      it is defined, and it is undefined for every visitor the region gate excluded, every
 *      environment with no project id, and everyone running an ad blocker - so the unwrapped
 *      package throws a TypeError in the scan panel for exactly the people we promised not to
 *      record. lib/clarity.ts wraps it; the section below runs that function with no window,
 *      with a window and no snippet, and with a snippet that has not executed yet.
 *
 *   5. THE PRIVACY COPY. app/privacy/page.tsx says either "no session recording" or the Clarity
 *      disclosure, decided from the environment at render. Delete one branch and one deploy
 *      makes a published promise false without anything failing.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const SALT = 'visits-check-fixed-salt';
process.env.IP_HASH_SALT = SALT;

const { adelaideDay, visitRowFor } = await import(join(root, 'lib/visits.ts'));

let failures = 0;
function check(what, condition, detail = '') {
  if (condition) {
    console.log(`  ok    ${what}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${what}${detail ? ` - ${detail}` : ''}`);
  }
}

function request(url, headers = {}, method = 'GET') {
  return { method, headers: new Headers(headers), nextUrl: new URL(url) };
}

const DOC = { 'sec-fetch-dest': 'document', 'user-agent': 'Mozilla/5.0 test', 'x-forwarded-for': '203.0.113.7' };

console.log('\nvisits: the Adelaide day\n');

// 23:30 ACST on the 1st. A UTC date would call this the 1st too, so this one passes either way
// and is here as the control for the next assertion.
check('14:00Z is still the 1st in Adelaide', adelaideDay(new Date('2026-09-01T14:00:00Z')) === '2026-09-01');
// 00:00 ACST on the 2nd. THIS is the one that fails under a UTC date, which would say the 1st.
check(
  '14:30Z has already rolled to the 2nd (+9:30)',
  adelaideDay(new Date('2026-09-01T14:30:00Z')) === '2026-09-02',
  adelaideDay(new Date('2026-09-01T14:30:00Z')),
);
// December is daylight saving, +10:30. A hardcoded +9:30 offset passes the two above and fails
// this one, which is why all three are here.
check(
  '13:30Z has rolled over in December (+10:30, daylight saving)',
  adelaideDay(new Date('2026-12-01T13:30:00Z')) === '2026-12-02',
  adelaideDay(new Date('2026-12-01T13:30:00Z')),
);
check('the shape is ISO, not a locale string', /^\d{4}-\d{2}-\d{2}$/.test(adelaideDay(new Date())));

console.log('\nvisits: what counts as a page view\n');

check('a plain document GET counts', visitRowFor(request('https://wordofmodel.ai/', DOC)) !== null);
check(
  'a request with no sec-fetch-dest counts (crawlers omit it, and belong in the table)',
  visitRowFor(request('https://wordofmodel.ai/', { 'user-agent': 'SomeBot/1.0' })) !== null,
);
check(
  'a next/link prefetch does not count',
  visitRowFor(request('https://wordofmodel.ai/pricing', { ...DOC, 'next-router-prefetch': '1' })) === null,
);
check(
  'an RSC fetch does not count',
  visitRowFor(request('https://wordofmodel.ai/pricing', { ...DOC, rsc: '1' })) === null,
);
check(
  'a subresource does not count',
  visitRowFor(request('https://wordofmodel.ai/', { ...DOC, 'sec-fetch-dest': 'empty' })) === null,
);
check('a POST does not count', visitRowFor(request('https://wordofmodel.ai/', DOC, 'POST')) === null);

// WHAT IS NOT A PAGE. Every path below was in the table on the first full day, and none of
// them is a person looking at anything. 147 of 200 rows.
check(
  "this site's own cron is not a visitor",
  visitRowFor(request('https://wordofmodel.ai/api/cron/sweep', { 'user-agent': 'vercel-cron/1.0' })) === null,
);
check('nor any other API route', visitRowFor(request('https://wordofmodel.ai/api/detect', DOC)) === null);
check('/meta.json is not a page', visitRowFor(request('https://wordofmodel.ai/meta.json', DOC)) === null);
check('nor robots.txt', visitRowFor(request('https://wordofmodel.ai/robots.txt', DOC)) === null);
check('nor the manifest', visitRowFor(request('https://wordofmodel.ai/manifest.webmanifest', DOC)) === null);
check(
  'a bot probing for a file we do not have is not a visitor',
  visitRowFor(request('https://wordofmodel.ai/wp-admin/install.php', DOC)) === null &&
    visitRowFor(request('https://wordofmodel.ai/.env', DOC)) === null,
);
// AND WHAT STILL IS. The crawler decision above is untouched: this is about paths, not agents.
check('the home page is still a page', visitRowFor(request('https://wordofmodel.ai/', DOC)) !== null);
check('so is a marketing route', visitRowFor(request('https://wordofmodel.ai/pricing', DOC)) !== null);
check(
  'so is a scan permalink, whose id must not read as an extension',
  visitRowFor(request('https://wordofmodel.ai/scan/5ab34625-89ca-40e4-a5d9-0b5624c06fd3', DOC)) !== null,
);
check(
  'and a crawler on a real page still counts, user-agent and all',
  visitRowFor(request('https://wordofmodel.ai/', { 'user-agent': 'SomeBot/1.0' })) !== null,
);

console.log('\nvisits: identity\n');

const a = visitRowFor(request('https://wordofmodel.ai/', DOC));
const b = visitRowFor(request('https://wordofmodel.ai/pricing', DOC));
const other = visitRowFor(
  request('https://wordofmodel.ai/', { ...DOC, 'x-forwarded-for': '198.51.100.4' }),
);

check('the same visitor on two pages is one visitor', a.visitor_hash === b.visitor_hash);
check('a different address is a different visitor', a.visitor_hash !== other.visitor_hash);
check('the day is in the hash, so it cannot be a cross-day identifier', a.visitor_hash !== a.ip_hash);

// THE DRIFT GUARD. This is the formula in lib/ratelimit.ts hashIp(), written out again. If the
// two ever diverge, visits stop joining to scans and nothing errors.
const expected = createHash('sha256').update(`${SALT}:203.0.113.7`).digest('hex').slice(0, 32);
check('ip_hash matches lib/ratelimit.ts hashIp() exactly', a.ip_hash === expected, `${a.ip_hash} vs ${expected}`);

console.log('\nvisits: attribution off the URL\n');

const paid = visitRowFor(
  request('https://wordofmodel.ai/?utm_source=meta&utm_content=rival-video&fbclid=ABC123', DOC),
);
check('utm_content survives', paid.utm_content === 'rival-video');
check('the click id is picked up', paid.click_id === 'ABC123');
check('the vendor is recorded, not inferred from utm_source', paid.click_id_param === 'fbclid');
check('an untagged visit carries no click id', a.click_id === null);

console.log('\nthe migration\n');

const sql = readFileSync(join(root, 'supabase/migrations/0025_visits.sql'), 'utf8');
check('the primary key is (day, visitor_hash)', /primary key \(day, visitor_hash\)/.test(sql));
check('the table is created if absent', /create table if not exists public\.visits/.test(sql));
// THE THING EVERY OTHER TABLE IN THIS SCHEMA DOES. visits shipped without it and would have
// been the only table whose protection lived in a project setting rather than in the diff.
check('RLS is enabled', /alter table public\.visits enable row level security/.test(sql));
check('and no browser-side role is granted anything', /revoke all on table public\.visits from anon/.test(sql) && /revoke all on table public\.visits from authenticated/.test(sql));

console.log('\nthe region gate: who may be recorded at all\n');

// BEHAVIOURAL, not a grep. Until 2 Sep 2026 nothing exercised this function - pixel-check only
// mentions it in a comment - and the case it got wrong was a country code that means "unknown".
const { analyticsAllowedFor } = await import(join(root, 'lib/meta.ts'));

check('an Australian visitor may be recorded', analyticsAllowedFor('AU') === true);
check('an American visitor may be recorded', analyticsAllowedFor('US') === true);
check('a German visitor may not', analyticsAllowedFor('DE') === false);
check('nor an Irish one - English-speaking and easy to forget', analyticsAllowedFor('IE') === false);
check('nor a Swiss one - not in the EEA, own regime, deliberately on the list', analyticsAllowedFor('CH') === false);
check('lowercase is the same country', analyticsAllowedFor('de') === false);
// The three ways of not knowing. All three used to differ, and two of them tracked.
check('a missing country fails closed', analyticsAllowedFor(null) === false);
check('an empty country fails closed', analyticsAllowedFor('') === false);
check(
  'XX fails closed - what Vercel sends when it cannot place the request',
  analyticsAllowedFor('XX') === false,
);
check('ZZ fails closed - the ISO user-assigned "unknown"', analyticsAllowedFor('ZZ') === false);
check('and anything that is not a country code at all', analyticsAllowedFor('AUS') === false && analyticsAllowedFor('1') === false);

console.log('\nthe recorder: tagging a session that may not be recorded\n');

// THE RULE THAT MAKES THE WRAPPER LOAD-BEARING. One file may touch the vendor. If a second one
// imports it, somebody has reached past the guard to the version that throws.
function importersOf(needle) {
  return execFileSync('grep', ['-rln', needle, 'app', 'lib', 'components', 'scripts'], {
    cwd: root,
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .filter((f) => f !== 'scripts/visits-check.mjs');
}
const importers = importersOf('@microsoft/clarity');
check(
  'only lib/clarity.ts imports @microsoft/clarity',
  importers.length === 1 && importers[0] === 'lib/clarity.ts',
  importers.join(', '),
);

// The three absences, against the real module rather than a transcription of it.
//
// setTimeout is stubbed FIRST, before any call, because "did it quietly start retrying" is half
// of what these assertions are for: a tag that queues on the server, or for a visitor we never
// record, is a timer running on behalf of a recorder that does not exist.
const clarity = await import(join(root, 'lib/clarity.ts'));
const timers = [];
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn) => { timers.push(fn); return 0; };

function tag(key, value) {
  try {
    clarity.tagSession(key, value);
    return null;
  } catch (e) {
    return e;
  }
}

// 1. A browser, and the component was never rendered: the UK or EEA visitor, or an unset
//    project id. The population the region gate exists for, running the code path the raw
//    package throws in.
globalThis.window = globalThis;
let threw = tag('phase', 'idle');
check('a tag for a visitor we never armed is a no-op', threw === null, threw?.message);
check('and it leaves no timer running for a visitor we never record', timers.length === 0);

// 2. The server render, and the arming is ON - because components/Clarity.tsx renders on the
//    server too, so `armed` is true here. That is exactly why the no-window guard is the only
//    thing standing between a server render and a queue with a live timer in it, and why this
//    case has to come after the arming rather than before it, where it would pass on the
//    strength of a flag that is false for the wrong reason.
clarity.armTagging();
delete globalThis.window;
threw = tag('phase', 'idle');
check('a tag on the server, where there is no window, is a no-op not a throw', threw === null, threw?.message);
check('and the server queues nothing, even though the component armed it', timers.length === 0);

// 3. Back in the browser, armed, and the snippet has not executed yet. This is the
//    afterInteractive window the very first phase tag actually lands in, and the case a DOM
//    lookup got wrong: next/script inserts its element AFTER hydration, so "no element" and
//    "not recorded" were the same answer to two different questions.
globalThis.window = globalThis;
// TWO of them, and this is not padding: with one queued tag a flush that reverses the queue is
// indistinguishable from one that does not, and "in order" below would assert nothing at all.
clarity.tagSession('phase', 'idle');
clarity.tagSession('phase', 'detecting');
const sent = [];
check('a tag sent before the snippet has run is queued, not dropped', timers.length === 1);
check('a second one joins the queue without starting a second retry', timers.length === 1);
check('and nothing reached the vendor yet', sent.length === 0);

// 4. window.clarity appears. The held tag arrives, ahead of the live one.
globalThis.clarity = (...args) => sent.push(args);
timers.shift()();
clarity.tagSession('phase', 'confirm');
check('the held tags are flushed once window.clarity exists', sent.length === 3, JSON.stringify(sent));
check(
  'in the order they were sent, through the vendor call the package makes',
  JSON.stringify(sent) ===
    JSON.stringify([
      ['set', 'phase', 'idle'],
      ['set', 'phase', 'detecting'],
      ['set', 'phase', 'confirm'],
    ]),
  JSON.stringify(sent),
);

globalThis.setTimeout = realSetTimeout;
delete globalThis.clarity;
delete globalThis.window;

// ARMING. tagSession only queues for a visitor the SERVER decided may be recorded, and the
// only thing that says so is the component being in the tree. If that call moves into an
// effect it races ScanPanel's own effect and the first phase tag goes back to being a coin toss.
const gate = readFileSync(join(root, 'components/Clarity.tsx'), 'utf8');
check(
  'the gated component arms tagging, in render and not an effect',
  /armTagging\(\);\n  return \(/.test(gate),
);
check('and nothing else arms it', importersOf('armTagging').sort().join(',') === 'components/Clarity.tsx,lib/clarity.ts');

// THE WIRING. The phase tag reads the state instead of being called at the seven setPhase sites,
// so a new phase cannot be added without a tag. If this becomes a call at a transition, the hole
// is back and it is invisible.
const panel = readFileSync(join(root, 'components/scan/ScanPanel.tsx'), 'utf8');
check(
  'ScanPanel tags the phase from an effect on the state, not at the transitions',
  /useEffect\(\(\) => \{\s*tagSession\('phase', phase\);\s*\}, \[phase\]\)/.test(panel),
);
check('the scan id is tagged too, so a recording joins to its row', /tagSession\('scan', result\.scanId\)/.test(panel));
// The two refusals that never change phase. Without their own key each one is invisible inside
// the phase it was refused in, and one of them is a death this recorder exists to measure.
check("a domain the client refuses is tagged, since phase never leaves idle", /tagSession\('rejected', 'domain'\)/.test(panel));
check("a confirm card sent back for missing facts is tagged too", /tagSession\('rejected', 'facts'\)/.test(panel));

console.log('\nthe privacy copy\n');

const privacy = readFileSync(join(root, 'app/privacy/page.tsx'), 'utf8');
check('the recording claim is read from the configuration', /const recording = Boolean\(env\.clarityProjectId\)/.test(privacy));
check('the "no session recording" branch still exists', /no session recording/.test(privacy));
check('the Clarity disclosure branch still exists', /Microsoft Clarity/.test(privacy));
check(
  'the email field is masked from the recorder',
  /data-clarity-mask="true"/.test(readFileSync(join(root, 'components/scan/ScanResult.tsx'), 'utf8')),
);

console.log('');
if (failures) {
  console.log(`${failures} check${failures === 1 ? '' : 's'} failed.\n`);
  process.exit(1);
}
console.log('All visits checks passed.\n');
