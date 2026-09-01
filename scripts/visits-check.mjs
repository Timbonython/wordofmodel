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
 *   4. THE PRIVACY COPY. app/privacy/page.tsx says either "no session recording" or the Clarity
 *      disclosure, decided from the environment at render. Delete one branch and one deploy
 *      makes a published promise false without anything failing.
 */
import { createHash } from 'node:crypto';
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
