import 'server-only';
import { askJson } from './openai';
import { detectPrompt } from './prompts';
import { writeBuyerQuestion } from './question';
// profileFrom lives in lib/profile.ts, with the brand it is the only producer of. Re-exported
// so existing callers keep their import, and imported so this file can use it.
import { profileFrom } from './profile';
export { profileFrom };
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

