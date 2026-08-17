import 'server-only';
import { askJson } from './openai';
import { detectPrompt } from './prompts';
import { writeBuyerQuestion } from './question';
import type { ConfirmedProfile, Profile } from './types';

const PROFILE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['brand_name', 'what_they_sell', 'buyer', 'country', 'category_term'],
  properties: {
    brand_name: { type: ['string', 'null'] },
    what_they_sell: { type: ['string', 'null'] },
    buyer: { type: ['string', 'null'] },
    country: { type: ['string', 'null'] },
    category_term: { type: ['string', 'null'] },
  },
} as const;

export async function detectBusiness(siteText: string): Promise<Profile> {
  const p = await askJson<Profile>(detectPrompt(siteText), 'business_profile', PROFILE_SCHEMA);
  const clean = (v: string | null) => {
    const s = (v ?? '').trim();
    if (!s || s.toLowerCase() === 'null' || s.toLowerCase() === 'unknown') return null;
    return s;
  };
  return {
    brand_name: clean(p.brand_name),
    what_they_sell: clean(p.what_they_sell),
    buyer: clean(p.buyer),
    country: clean(p.country),
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
  const { question } = await writeBuyerQuestion(p);
  return question;
}
