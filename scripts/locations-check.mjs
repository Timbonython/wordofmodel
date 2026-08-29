/**
 * The additional-location guards, each watched failing.
 *
 * Nothing here is shipped on the strength of reading it. Every check below asserts the good
 * path AND then deliberately breaks the thing the guard exists for, because a guard that has
 * never been seen to refuse is a comment. That standard came out of `claim_founding_seat`,
 * which was correct, documented, and would have handed out unlimited discounts.
 */

import { localiseQuestion, LocalisationError } from '../lib/location-text.ts';
import { parseExtraLocations, InputError } from '../lib/wizard-input.ts';
import { assertOneInterval, PRICES } from '../lib/stripe.ts';
import { MAX_EXTRA_LOCATIONS } from '../lib/scope.ts';

let failures = 0;
const ok = (label, detail = '') => console.log(`  PASS  ${label}${detail ? `  ${detail}` : ''}`);
const bad = (label, detail) => { failures++; console.log(`  FAIL  ${label}  ${detail}`); };

function refuses(label, fn, type) {
  try { fn(); bad(label, 'did not throw'); }
  catch (e) {
    if (type && !(e instanceof type)) return bad(label, `threw ${e.constructor.name}, wanted ${type.name}`);
    ok(label, `refused: ${String(e.message).slice(0, 72)}...`);
  }
}

console.log('\nlocalising an approved question');
const L = { fromPlace: 'Geelong, Australia', toPlace: 'Ballarat, Australia', fromLocality: 'Geelong', toLocality: 'Ballarat' };
const cat = localiseQuestion({ ...L, slot: 'category', text: 'Who is best at emergency dentistry in Geelong, Australia?' });
cat.includes('Ballarat, Australia') && !cat.includes('Geelong')
  ? ok('full place substituted', cat) : bad('full place substituted', cat);

const alt = localiseQuestion({ ...L, slot: 'alternatives', text: 'What are the alternatives to Smile Co in geelong?' });
alt.includes('Ballarat') ? ok('bare place substituted, any case', alt) : bad('bare place substituted', alt);

const brand = 'Is Pellamere Dental any good, and what do people say about it?';
localiseQuestion({ ...L, slot: 'branded', text: brand }) === brand
  ? ok('branded slot passes through', 'no place is required in slot 5')
  : bad('branded slot', 'was rewritten');

console.log('\n  now break it');
refuses('a question naming no place is refused, not sent',
  () => localiseQuestion({ ...L, slot: 'category', text: 'Who is the best emergency dentist near me?' }), LocalisationError);
refuses('a near-miss is not treated as the place',
  () => localiseQuestion({ ...L, slot: 'category', text: 'Best dentistry in Geelongshire?' }), LocalisationError);

console.log('\nparsing what the wizard posts');
const three = parseExtraLocations(['Ballarat', ' ballarat ', '', 'Bendigo', 'Geelong'], 'Geelong');
JSON.stringify(three) === JSON.stringify(['Ballarat', 'Bendigo'])
  ? ok('duplicates, blanks and the primary town dropped', JSON.stringify(three))
  : bad('dedupe', JSON.stringify(three));

console.log('\n  now break it');
refuses('extra locations with no primary town are refused',
  () => parseExtraLocations(['Ballarat'], ''), InputError);
refuses(`more than ${MAX_EXTRA_LOCATIONS} extra locations is refused`,
  () => parseExtraLocations(Array.from({ length: MAX_EXTRA_LOCATIONS + 1 }, (_, i) => `Town ${i}`), 'Geelong'), InputError);

console.log('\nthe location line cannot cross a billing interval');
assertOneInterval(['main_monthly', 'location_monthly']);
ok('monthly plan takes the monthly location price');
assertOneInterval(['premium_founding_annual', 'location_annual']);
ok('annual plan takes the annual location price');

console.log('\n  now break it');
refuses('a monthly plan with an annual location line is refused',
  () => assertOneInterval(['main_monthly', 'location_annual']));

console.log('\nthe price the wizard quotes is the price Stripe charges');
const perTown = PRICES.location_monthly.amount / 100;
perTown === 30 ? ok('US$30 a town', `PRICES.location_monthly = ${PRICES.location_monthly.amount} cents`)
               : bad('per-town price', `${perTown}`);

console.log(failures ? `\nlocations: ${failures} FAILED\n` : '\nlocations: clean. Every guard was watched refusing.\n');
process.exit(failures ? 1 : 0);
