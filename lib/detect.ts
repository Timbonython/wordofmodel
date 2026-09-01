import 'server-only';
import { askJson } from './openai';
import { detectPrompt } from './prompts';
import { writeBuyerQuestion } from './question';
import { fact, type BusinessProfile } from './profile';
import type { ConfirmedProfile, Profile } from './types';

const PROFILE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['brand_name', 'what_they_sell', 'buyer', 'country', 'location', 'category_term'],
  properties: {
    brand_name: { type: ['string', 'null'] },
    what_they_sell: { type: ['string', 'null'] },
    buyer: { type: ['string', 'null'] },
    // The engines' search locale, not the question's geography. See prompts.ts.
    country: { type: ['string', 'null'] },
    // Quoted from the page. Null when no place appears anywhere on it, which is a real answer.
    location: { type: ['string', 'null'] },
    category_term: { type: ['string', 'null'] },
  },
} as const;

export async function detectBusiness(siteText: string): Promise<Profile> {
  const p = await askJson<Profile>(detectPrompt(siteText), 'business_profile', PROFILE_SCHEMA);
  const clean = (v: string | null) => {
    const s = (v ?? '').trim();
    // The same vocabulary fact() rejects. darwindental.com.au returned the literal string
    // "None" for two fields, which clean() passed through and the card would have rendered as a
    // found fact reading "None". Principle §5 in four characters.
    const low = s.toLowerCase();
    if (!s || low === 'null' || low === 'unknown' || low === 'n/a' || low === 'none') return null;
    return s;
  };
  return {
    brand_name: clean(p.brand_name),
    what_they_sell: clean(p.what_they_sell),
    buyer: clean(p.buyer),
    country: clean(p.country),
    location: clean(p.location),
    category_term: clean(p.category_term),
  };
}

/**
 * The spec: if brand_name or category_term is null, fall back to a manual form
 * rather than guessing, because a wrong question destroys the credibility of the
 * result.
 */
export function needsManualEntry(p: Profile): boolean {
  return !p.brand_name || !p.category_term;
}

export async function writeQuestion(p: ConfirmedProfile): Promise<string> {
  const { question } = await writeBuyerQuestion(profileFrom(p), p.brand_name);
  return question;
}

/**
 * The confirmed profile, as the three facts the generator is allowed to see.
 *
 * ONE PLACE WHERE THE WIDE SHAPE NARROWS. Everything the generator gets passes through here, so
 * there is a single line to read when asking "could a city reach the prompt from anywhere else".
 * `country` is deliberately not carried across: it is the engines' search locale, and it was the
 * field that used to default to Australia and become the question's geography.
 */
export function profileFrom(p: {
  what_they_sell: string | null;
  buyer: string | null;
  location: string | null;
  category_term: string | null;
}): BusinessProfile {
  return {
    sells: fact(p.what_they_sell || p.category_term, 'extracted'),
    buyer: fact(p.buyer, 'extracted'),
    location: fact(p.location, 'extracted'),
  };
}
