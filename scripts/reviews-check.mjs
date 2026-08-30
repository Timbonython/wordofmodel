/**
 * The review guards, each watched refusing.
 *
 * No database: these are the rules that decide what gets stored, what gets published, and what
 * reaches a crawler. Every one of them is proven by breaking it, which is this repo's standard
 * since claim_founding_seat answered confidently and wrongly for a week.
 */

import { reviewProblem, platforms, plainSentence, attribution, linkedInVersion } from '../lib/review-text.ts';
import { productSchema, jsonldText } from '../lib/schema.ts';
import { REVIEWS_MIN_FOR_AGGREGATE } from '../lib/reviews.ts';

let failures = 0;
const ok = (l, d = '') => console.log(`  PASS  ${l}${d ? `  ${d}` : ''}`);
const bad = (l, d) => { failures++; console.log(`  FAIL  ${l}  ${d}`); };
const good = { rating: 5, reviewText: 'It found three answers that never mentioned us.', firstName: 'Sarah', location: 'Bendigo', category: 'dental' };

console.log('\nwhat may be submitted');
reviewProblem(good) === null ? ok('a complete review is accepted') : bad('good review', reviewProblem(good));

console.log('\n  now break it');
for (const [label, patch] of [
  ['no rating',        { rating: 0 }],
  ['a rating of 6',    { rating: 6 }],
  ['two words',        { reviewText: 'it good' }],
  ['no name',          { firstName: '  ' }],
  ['2001 characters',  { reviewText: 'x'.repeat(2001) }],
]) {
  const p = reviewProblem({ ...good, ...patch });
  p ? ok(`${label} is refused`, `"${p}"`) : bad(label, 'was accepted');
}

console.log('\nthe aggregate gate');
const below = productSchema('https://x.test', null, []);
'aggregateRating' in below
  ? bad('no rating passed', 'aggregateRating was emitted anyway')
  : ok('no rating passed means no aggregateRating in the JSON-LD');
const above = productSchema('https://x.test', { count: 12, average: 4.8 }, []);
above.aggregateRating?.ratingValue === '4.8' && above.aggregateRating?.reviewCount === '12'
  ? ok('a real rating is emitted', '4.8 from 12')
  : bad('aggregate', JSON.stringify(above.aggregateRating));
above.offers?.length === 2 ? ok('the real prices are in the offers', `${above.offers.length} offers`) : bad('offers', 'missing');
!('aggregateRating' in productSchema('https://x.test', { count: 0, average: 0 }, []))
  ? ok('a count of zero emits nothing', 'not "0 reviews"')
  : bad('zero count', 'emitted an aggregate');
console.log(`  the site's own threshold is ${REVIEWS_MIN_FOR_AGGREGATE} approved reviews`);

console.log('\na review body cannot break out of the script tag');
const nasty = productSchema('https://x.test', null, [
  { rating: 5, body: 'Great. </script><img src=x onerror=alert(1)>', author: 'Mallory', published: null },
]);
const text = jsonldText(nasty);
text.includes('</script>')
  ? bad('script escape', 'a raw </script> reached the document')
  : ok('</script> in a review body is escaped', text.includes('\\u003c/script>') ? 'rendered as \\u003c' : 'no < survives');

console.log('\n  now break it');
{
  // The same payload without the escaping the real path applies.
  const raw = JSON.stringify(nasty);
  raw.includes('</script>')
    ? ok('unescaped, the same body DOES contain </script>', 'which is why jsonldText exists')
    : bad('the fixture', 'does not reproduce the risk');
}

console.log('\nplatforms with no URL are not offered');
platforms({ google: null, g2: null, trustpilot: null }).length === 0
  ? ok('nothing configured means no buttons') : bad('platforms', 'rendered a dead button');
const one = platforms({ google: 'https://g.page/r/x', g2: null, trustpilot: null });
one.length === 1 && one[0].key === 'google'
  ? ok('only the configured one is offered', 'google') : bad('platforms', JSON.stringify(one));

console.log('\nwhat a machine reads');
console.log(`  attribution   ${attribution(good)}`);
console.log(`  sentence      ${plainSentence(good)}`);
console.log(`  linkedin      ${linkedInVersion(good).replace(/\n+/g, ' / ')}`);
plainSentence(good).includes('rated Word of Model 5 out of 5')
  ? ok('the sentence states who, what and the rating') : bad('sentence', plainSentence(good));
plainSentence({ ...good, location: '', category: '' }) === 'Sarah rated Word of Model 5 out of 5.'
  ? ok('and degrades cleanly with no category or town') : bad('sentence', plainSentence({ ...good, location: '', category: '' }));

console.log(failures ? `\nreviews: ${failures} FAILED\n` : '\nreviews: clean. Every guard was watched refusing.\n');
process.exit(failures ? 1 : 0);
