/**
 * The question guard, checked without calling a model.
 *
 * WHY IT IS SEPARATE FROM grounding:check. That one exists to watch a constraint survive contact
 * with a strong prior, so it has to call the real model and it needs keys and network. This one
 * is pure: it pins the SHAPES the guard must accept and reject, and it runs anywhere, including
 * in `npm run check` before a commit. The two answer different questions and both are worth
 * having.
 *
 * The first case is the sentence a live run put on screen on 1 Sep 2026. It reads like a buyer
 * question and it asks for an adviser on the decision rather than for one of the businesses
 * being chosen, so the engines answer with event agencies and the business that prompted it is
 * not in the running. Everything below it is the false-positive guard on that fix: the category
 * list had no person-shaped nouns in it, so a speaker, a mentor and a dentist all failed a check
 * they should have passed and were sent to a repair pass they did not need.
 */
import { isBuyerQuestion } from '../lib/question.ts';
import { constraintBlock, fact } from '../lib/profile.ts';
import { questionPrompt } from '../lib/prompts.ts';

let bad = 0;
const t = (name, ok) => { if (!ok) { bad++; console.log('  FAIL ' + name); } else console.log('  ok   ' + name); };

const LIVE = 'Who in Adelaide, SA can help conference organisers and business leaders choose between keynote speaking and business mentoring for an event?';
t('rejects the live adviser question', !isBuyerQuestion(LIVE));
t('rejects "who can help me decide between"', !isBuyerQuestion('Which firms can help me compare accounting software options in Perth?'));
t('accepts a speaker question', isBuyerQuestion('Who are the best keynote speakers in Adelaide for a business conference?'));
t('accepts a mentor question', isBuyerQuestion('Which business mentors in Adelaide work with founders scaling past ten staff?'));
t('accepts a dentist question', isBuyerQuestion('Which dentists in Bendigo take new patients on short notice?'));
t('still rejects a vendor-addressed one', !isBuyerQuestion('Can you show us recent Australian client work and your pricing?'));
t('still rejects a company question with no shortlist ask', !isBuyerQuestion('Our company builds software for the mining sector in WA.'));

const p = {
  sells: fact('keynote speaking and business mentoring', 'extracted'),
  buyer: fact('conference organisers and business leaders', 'extracted'),
  location: fact('Adelaide, SA', 'extracted'),
};
const cb = constraintBlock(p);
t('constraint block no longer says "choosing between"', !/choosing between/i.test(cb));
t('constraint block names the kind of business', /kind of business or person/i.test(cb));
const prompt = questionPrompt(p, 'Example Speaking');
t('prompt forbids the adviser shape', /do not ask who can help someone choose/i.test(prompt));
t('prompt still forbids invented places', /Introduce no place name that is not in the constraints/i.test(prompt));
t('prompt carries no place but the profile\'s', !/melbourne|sydney/i.test(prompt));

const noPlace = { ...p, location: null };
t('null location still instructs no geography', /NOT KNOWN/.test(constraintBlock(noPlace)));

/*
 * TWO FOUND BY REVIEW ON 1 Sep 2026, both by break 3 failing on draws that were perfectly good.
 *
 * The category list had gained restaurant, cafe, pub, gym and salon and skipped "business" - the
 * most generic business-shaped noun there is - while constraintBlock was telling the model the
 * buyer wants "the kind of BUSINESS or person". The prompt steered toward a word the guard
 * refused.
 *
 * And ADDRESSES_VENDOR rejected the bare "you" in "would you recommend", which is addressed to
 * the assistant, not the vendor. Every such draw went to a repair pass it did not need.
 */
for (const [want, why, q] of [
  [true,  'a question naming "businesses" as the category', 'What Adelaide, SA keynote speaking businesses would you recommend for a conference organiser?'],
  [true,  '"would you recommend" is the assistant, not the vendor', 'Which Adelaide dentist would you recommend for a family?'],
  [false, 'the vendor shape this guard was built for', 'Can you show recent Australian client work for a project like ours?'],
  [false, 'the idiom does not excuse a real "your"', 'Would you recommend your own agency for this work?'],
]) {
  t(`${want ? 'accepts' : 'rejects'} ${why}`, isBuyerQuestion(q) === want);
}

console.log(bad ? `\npure: ${bad} FAILED\n` : '\npure: clean.\n');
process.exit(bad ? 1 : 0);
