/**
 * §7 of word-of-model-scan-grounding-and-confirm.md, performed rather than reasoned about.
 *
 * Two deliberate breaks, per principle §2 - a guard is not shipped until you have watched it
 * fail. These call the real model, because the thing being tested is whether a constraint
 * survives contact with a strong prior, and a stub cannot answer that.
 */
import { writeBuyerQuestion } from '../lib/question.ts';
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

console.log('\n--- and the field the run cannot proceed without ---');
try {
  await writeBuyerQuestion({ sells: fact('pub meals', 'extracted'), buyer: null, location: null }, 'X');
  bad++; console.log('  a profile with no buyer WROTE A QUESTION. §4 is not held.');
} catch (e) { console.log(`  refused: ${e.message}`); }

console.log(bad ? `\ngrounding: ${bad} FAILED\n` : '\ngrounding: clean. Both breaks watched, the constraint held.\n');
process.exit(bad ? 1 : 0);
