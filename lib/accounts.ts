import 'server-only';
import { db } from './db';

/**
 * Row types for the subscriber side of the schema, mirroring
 * supabase/migrations/0002_accounts_scopes.sql. Query helpers for scopes, runs
 * and captures belong with the sessions that build them; what is here is what
 * auth needs.
 */

export const QUESTION_SLOTS = [
  'category',
  'situation',
  'alternatives',
  'how_do_people',
  'branded',
] as const;
export type QuestionSlot = (typeof QUESTION_SLOTS)[number];

/**
 * Report order for the five slots. The DB stores the slot by name and says
 * nothing about order; this array is the order, and `branded` is last because
 * it is the control condition rather than a finding.
 */
export const SLOT_LABEL: Record<QuestionSlot, string> = {
  category: 'The category question',
  situation: 'The situation question',
  alternatives: 'The alternatives question',
  how_do_people: 'The how do people question',
  branded: 'The branded question',
};

/**
 * The locked surface set, frozen 10 Aug 2026. Five monthly, two quarterly.
 * A surface is only ever recorded from itself: running a different system and
 * filing the answer under a surface's name is the one substitution this product
 * cannot make, which is why claude and copilot are browser only.
 */
export const SURFACES = {
  chatgpt: { label: 'ChatGPT', cadence: 'monthly', method: 'api' },
  gemini: { label: 'Gemini', cadence: 'monthly', method: 'api' },
  grok: { label: 'Grok', cadence: 'monthly', method: 'api' },
  perplexity: { label: 'Perplexity', cadence: 'monthly', method: 'api' },
  google_aio: { label: 'Google AI Overviews', cadence: 'monthly', method: 'serp' },
  claude: { label: 'Claude', cadence: 'quarterly', method: 'browser' },
  copilot: { label: 'Microsoft Copilot', cadence: 'quarterly', method: 'browser' },
} as const;

export type Surface = keyof typeof SURFACES;
export type CaptureMethod = 'api' | 'serp' | 'browser';
export type RunPeriod = 'monthly' | 'quarterly' | 'calibration';
export type CompetitorSource = 'proposed' | 'subscriber_added';

export const MONTHLY_SURFACES = (Object.keys(SURFACES) as Surface[]).filter(
  (s) => SURFACES[s].cadence === 'monthly',
);
export const QUARTERLY_SURFACES = Object.keys(SURFACES) as Surface[];

export interface AccountRow {
  id: string;
  auth_user_id: string | null;
  email: string;
  stripe_customer_id: string | null;
  created_at: string;
}

export interface ScopeRow {
  id: string;
  account_id: string;
  category: string;
  market: string;
  buyer: string;
  created_at: string;
}

export interface QuestionRow {
  id: string;
  scope_id: string;
  slot: QuestionSlot;
  text: string;
  approved_at: string | null;
}

/**
 * Membership is a timeline. A competitor added by the subscriber part way
 * through did not overtake anybody, and delta reporting has to read added_at
 * and source before it calls anything a movement.
 */
export interface CompetitorRow {
  id: string;
  scope_id: string;
  name: string;
  domain: string | null;
  source: CompetitorSource;
  added_at: string;
  removed_at: string | null;
}

export interface RunRow {
  id: string;
  scope_id: string;
  period: RunPeriod;
  status: 'pending' | 'running' | 'complete' | 'failed';
  started_at: string | null;
  completed_at: string | null;
}

export interface CaptureRow {
  id: string;
  run_id: string;
  question_id: string;
  engine: Surface;
  capture_method: CaptureMethod;
  model_used: string | null;
  operator: string | null;
  answer_text: string | null;
  brands_named: string[];
  target_mentioned: boolean | null;
  target_recommended: boolean | null;
  target_position: number | null;
  top_recommendation: string | null;
  domains_cited: string[];
  tokens: number | null;
  cost_usd: number | null;
  captured_at: string;
}

export interface CaptureJobRow {
  id: string;
  run_id: string;
  question_id: string;
  engine: Surface;
  capture_method: CaptureMethod;
  status: 'pending' | 'running' | 'done' | 'failed';
  worker_id: string | null;
  attempts: number;
  error: string | null;
  claimed_at: string | null;
  completed_at: string | null;
}

export async function getAccountByAuthUser(authUserId: string): Promise<AccountRow | null> {
  const { data, error } = await db()
    .from('accounts')
    .select('*')
    .eq('auth_user_id', authUserId)
    .limit(1);
  if (error) throw new Error(`Account lookup failed: ${error.message}`);
  return (data?.[0] as AccountRow | undefined) ?? null;
}

/**
 * The account is normally created by the on_auth_user_created trigger, so this
 * is the second belt rather than the first: it covers an auth user that predates
 * the trigger, and it makes the callback route safe to reason about on its own.
 *
 * Relinking on the email conflict matches the trigger, and for the same reason:
 * with magic link the only way to hold an address is to have opened mail at it.
 */
export async function ensureAccount(authUserId: string, email: string): Promise<AccountRow> {
  const existing = await getAccountByAuthUser(authUserId);
  if (existing) return existing;

  const { data, error } = await db()
    .from('accounts')
    .upsert(
      { auth_user_id: authUserId, email: email.trim().toLowerCase() },
      { onConflict: 'email' },
    )
    .select('*')
    .single();
  if (error || !data) throw new Error(`Could not open an account: ${error?.message}`);
  return data as AccountRow;
}
