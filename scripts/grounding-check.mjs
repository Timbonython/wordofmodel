/**
 * §7 of word-of-model-scan-grounding-and-confirm.md, performed rather than reasoned about.
 *
 * Two deliberate breaks, per principle §2 - a guard is not shipped until you have watched it
 * fail. These call the real model, because the thing being tested is whether a constraint
 * survives contact with a strong prior, and a stub cannot answer that.
 */
import { writeBuyerQuestion, isBuyerQuestion } from '../lib/question.ts';
import { questionPrompt } from '../lib/prompts.ts';
import { fact } from '../lib/profile.ts';
import { detectBusiness } from '../lib/detect.ts';

const CITIES = /\b(melbourne|sydney|brisbane|perth|adelaide|hobart|darwin|canberra|auckland|london|new york)\b/i;
let bad = 0;

console.log('\n--- break 1: location is null. It must emit NO geography, not a default. ---');
const noPlace = {
  sells: fact('pub meals and drinks', 'extracted'),
  buyer: fact('people deciding where to eat and drink', 'extracted'),
  location: null,
};
console.log('  the constraints handed to the model:');
for (const l of questionPrompt(noPlace, 'The General Havelock').split('CONSTRAINTS')[1].split('Rules:')[0].trim().split('\n'))
  console.log(`    ${l}`);
for (let i = 1; i <= 3; i++) {
  const { question } = await writeBuyerQuestion(noPlace, 'The General Havelock');
  const hit = question.match(CITIES);
  if (hit) { bad++; console.log(`  ${i}. INVENTED "${hit[0]}"  ${question}`); }
  else console.log(`  ${i}. no city  ${question}`);
}

/*
 * BREAK 2, AND THE FIRST VERSION OF IT TESTED THE WRONG THING.
 *
 * The brief says: location is Adelaide while THE SITE TEXT says Melbourne somewhere incidental.
 * Site text no longer reaches the generator at all - that is the fix - so there are two honest
 * halves, at the two layers where a competing city can actually appear.
 *
 * The first attempt put "written up in the Melbourne press" into `sells` and then failed the run
 * for containing "Melbourne". Every question it produced was about Adelaide; the model had
 * simply carried a constraint I told it to use verbatim. That was a bad fixture reporting a
 * passing guard as broken, which is worth more than a clean run.
 *
 * 2a: an incidental Melbourne in the BRAND NAME, which the generator does see. Melbourne Street
 * is in North Adelaide, so this is a real shape rather than a contrived one.
 */
console.log('\n--- break 2a: brand is "Melbourne Street Hotel", location is Adelaide. ---');
const contested = {
  sells: fact('pub meals and drinks', 'extracted'),
  buyer: fact('people deciding where to eat and drink', 'extracted'),
  location: fact('Adelaide, SA', 'extracted'),
};
for (let i = 1; i <= 3; i++) {
  const { question } = await writeBuyerQuestion(contested, 'Melbourne Street Hotel');
  const wrong = /\bmelbourne\b/i.test(question);
  if (wrong) { bad++; console.log(`  ${i}. THE PRIOR WON  ${question}`); }
  else console.log(`  ${i}. constraint won  ${question}`);
}

/* 2b: the layer where site text actually lives. The address is Adelaide; Melbourne appears in
 * prose the way it does on a real page. The extracted location must be the address. */
console.log('\n--- break 2b: site text says Melbourne incidentally, the address is Adelaide. ---');
const page = `The General Havelock
162 Hutt Street, Adelaide, SA 5000. Established 1873.
A public house serving lunch and dinner seven days.
Our head chef trained in Melbourne before returning home.
Phone (08) 8223 0433.`;
for (let i = 1; i <= 2; i++) {
  const p = await detectBusiness(page);
  const wrong = /melbourne/i.test(p.location ?? '');
  if (wrong || !/adelaide/i.test(p.location ?? '')) {
    bad++; console.log(`  ${i}. EXTRACTED "${p.location}"  <- not the address on the page`);
  } else console.log(`  ${i}. extracted "${p.location}"   buyer: "${p.buyer}"`);
}

/*
 * BREAK 3, ADDED 1 Sep 2026 AFTER A LIVE RUN PRODUCED IT.
 *
 * A keynote speaker and business mentor in Adelaide. The question that reached the screen:
 *
 *   "Who in Adelaide, SA can help conference organisers and business leaders choose between
 *    keynote speaking and business mentoring for an event?"
 *
 * Third person, asks for a shortlist, uses only the profile's own place - it passes every test
 * the earlier breaks apply, and it is still useless. It asks for an ADVISER on the choice, so
 * the engines name event agencies and the speaker is not in the running. Two causes, both fixed
 * and both tested here: the prompt called `sells` "what they are choosing between", so two
 * services became the options; and when every draw failed the guard the best one shipped anyway
 * with nothing saying so.
 */
console.log('\n--- break 3: two services on one profile. The options are BUSINESSES, not services. ---');
const twoServices = {
  sells: fact('keynote speaking and business mentoring', 'extracted'),
  buyer: fact('conference organisers and business leaders', 'extracted'),
  location: fact('Adelaide, SA', 'extracted'),
};
/*
 * TWO ASSERTIONS, AND THE SECOND ONE WAS ADDED AFTER THE FIRST PASSED.
 *
 * The first run of this break came back clean on `verified` and produced:
 *
 *   "Which Adelaide business offers keynote speaking and business mentoring for conference
 *    organisers and business leaders?"
 *
 * Asks for a business, so the guard is satisfied. Still wrong, and wrong in the direction that
 * costs us: a question naming both services can only be answered by a business doing both, which
 * is a smaller field than the one the buyer is choosing from. If the client is the only local
 * business doing both, they get named and the scan reports a win it did not earn. So the break
 * now also fails when the question fuses the pair on either side.
 */
const BOTH_SERVICES = (q) => /keynote/i.test(q) && /mentor/i.test(q);
const BOTH_BUYERS = (q) => /organiser/i.test(q) && /leader/i.test(q);
for (let i = 1; i <= 3; i++) {
  const { question, verified } = await writeBuyerQuestion(twoServices, 'Example Speaking');
  if (!verified) { bad++; console.log(`  ${i}. UNVERIFIED  ${question}`); }
  else if (BOTH_SERVICES(question)) { bad++; console.log(`  ${i}. NARROWED THE FIELD (both services)  ${question}`); }
  else if (BOTH_BUYERS(question)) { bad++; console.log(`  ${i}. NARROWED THE FIELD (both buyers)  ${question}`); }
  else console.log(`  ${i}. one service, one asker  ${question}`);
}

console.log('\n--- and the guard itself, on the sentence that got through ---');
const LIVE = 'Who in Adelaide, SA can help conference organisers and business leaders choose between keynote speaking and business mentoring for an event?';
if (isBuyerQuestion(LIVE)) { bad++; console.log('  THE GUARD STILL PASSES IT. The adviser shape is not caught.'); }
else console.log('  rejected: the adviser shape');
const GOOD = 'Who are the best keynote speakers in Adelaide for a business conference?';
if (!isBuyerQuestion(GOOD)) { bad++; console.log(`  THE GUARD REJECTS A GOOD ONE: ${GOOD}`); }
else console.log('  accepted: a plain buyer question about a person-shaped category');

console.log('\n--- and the field the run cannot proceed without ---');
try {
  await writeBuyerQuestion({ sells: fact('pub meals', 'extracted'), buyer: null, location: null }, 'X');
  bad++; console.log('  a profile with no buyer WROTE A QUESTION. §4 is not held.');
} catch (e) { console.log(`  refused: ${e.message}`); }

console.log(bad ? `\ngrounding: ${bad} FAILED\n` : '\ngrounding: clean. Both breaks watched, the constraint held.\n');
process.exit(bad ? 1 : 0);
