import 'server-only';
import type { Citation } from './types';
import { db } from './db';
import type { CaptureMethod, CompetitorSource, QuestionSlot, RunPeriod, Surface } from './scope';

/**
 * Row types for the subscriber side of the schema, mirroring
 * supabase/migrations/0002_accounts_scopes.sql. Query helpers for scopes, runs
 * and captures belong with the sessions that build them; what is here is what
 * auth needs.
 */

export {
  QUESTION_SLOTS,
  SLOT_LABEL,
  SURFACES,
  MONTHLY_SURFACES,
  QUARTERLY_SURFACES,
} from './scope';
export type {
  QuestionSlot,
  Surface,
  CaptureMethod,
  RunPeriod,
  CompetitorSource,
} from './scope';

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
  /** Added in 0003. The target every capture in this scope is scored against. */
  brand_name: string;
  what_they_sell: string | null;
  website: string | null;
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
  status: 'pending' | 'running' | 'complete' | 'partial' | 'failed' | 'aborted';
  started_at: string | null;
  completed_at: string | null;
  /** 0005. Which period, as opposed to which cadence. The idempotency key with scope_id. */
  period_start: string;
  captures_expected: number;
  /** The surface set this run used. A change here is configuration, not market movement. */
  surfaces: Surface[];
  /** 0007. Samples per surface. Same warning as surfaces. */
  samples: Record<string, number>;
  /**
   * 0022. The additional location this run measured, or null for the scope's own locality.
   * Part of the idempotency key, and part of comparability: a delta must only ever compare a
   * town with itself. Null on every run before 0022, which is correct - they measured the one
   * place a scope had.
   */
  location_id: string | null;
  cost_usd: number;
  cost_ceiling_usd: number | null;
  failure_reason: string | null;
  alerted_at: string | null;
  trigger_source: 'baseline' | 'scheduled' | 'manual';
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
  /** 0005-0007. Provenance: recorded, never assumed. */
  raw_response: unknown;
  citations: Citation[];
  outcome: 'answered' | 'no_answer' | 'refused';
  provider: string | null;
  geo_sent: unknown;
  vercel_region: string;
  tokens_in: number | null;
  tokens_out: number | null;
  latency_ms: number | null;
  extracted_at: string | null;
  extraction_version: number | null;
  extractor_model: string | null;
  search_calls: number | null;
  grounded: boolean | null;
  cost_source: 'reported' | 'computed' | null;
  sample: number;
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
  /** 0005-0007. */
  next_attempt_at: string;
  max_attempts: number;
  error_kind: 'retryable' | 'permanent' | null;
  sample: number;
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
