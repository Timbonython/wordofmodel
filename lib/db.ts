import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';
import type { Capture, FreeResult, Profile } from './types';
import type { TouchParams } from './funnel';

let client: SupabaseClient | null = null;

/**
 * Server-only Supabase client on the secret key. The key bypasses RLS, which is
 * what makes the no-policy setup in 0001_init.sql work. It must never reach the
 * browser: returning it from a server component or embedding it in a payload
 * would expose every prospect record.
 */
export function db(): SupabaseClient {
  if (!client) {
    client = createClient(env.supabaseUrl, env.supabaseSecretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { 'X-Client-Info': 'wordofmodel-scan/1.0' } },
    });
  }
  return client;
}

export interface ScanRow {
  id: string;
  domain: string;
  brand_name: string | null;
  what_they_sell: string | null;
  buyer: string | null;
  country: string | null;
  category_term: string | null;
  question: string | null;
  captures: Capture[] | null;
  result: FreeResult | null;
  status: 'running' | 'complete' | 'failed';
  email: string | null;
  created_at: string;
  completed_at: string | null;
}

/**
 * One scan per domain per 24 hours, re-served from cache. This is cost control
 * and, as the spec notes, it makes the cache a feature: a repeat visitor sees
 * their previous result.
 */
/**
 * How long a completed scan is reused instead of asking the engines again.
 *
 * EXPORTED 5 SEP 2026 because something else needed to predict this decision and guessed. The
 * pixel check has to find a domain that /api/detect will answer from cache - that is the whole
 * difference between a free run and one that spends about US$0.37 - and it asked for a scan in
 * the last TWENTY hours, a number nothing produced. So for four hours a day it reported no
 * domain available while this function would have served one, and it never picked up the status
 * filter either, so it could nominate a scan that never completed.
 *
 * One constant, imported by both. The two cannot disagree rather than merely happening to agree.
 */
export const SCAN_CACHE_MS = 24 * 60 * 60 * 1000;

export async function findCachedScan(domain: string): Promise<ScanRow | null> {
  const since = new Date(Date.now() - SCAN_CACHE_MS).toISOString();
  const { data, error } = await db()
    .from('scans')
    .select('*')
    .eq('domain', domain)
    .eq('status', 'complete')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(`Cache lookup failed: ${error.message}`);
  return (data?.[0] as ScanRow | undefined) ?? null;
}

/**
 * Could this string be one of our ids at all?
 *
 * ASKED BEFORE THE QUERY, because Postgres does not answer "no such row" for a string that is
 * not a uuid - it rejects the comparison, PostgREST returns 22P02, and the lookup throws. Every
 * caller here turns a null into a clean 404 and an exception into a 500, so a mistyped or
 * truncated link produced a server error page: "our site is broken" when the truth is "your
 * link is wrong". These links are made to be forwarded, so a truncated one is the ordinary
 * case rather than an attack.
 *
 * Deliberately shape only, and deliberately NOT a try/catch around the query. Swallowing the
 * error would also swallow a real database failure, and this build has been bitten before by a
 * guard that made a broken thing look healthy.
 */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export async function getScan(id: string): Promise<ScanRow | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await db().from('scans').select('*').eq('id', id).limit(1);
  if (error) throw new Error(`Scan lookup failed: ${error.message}`);
  return (data?.[0] as ScanRow | undefined) ?? null;
}

export async function createScan(input: {
  domain: string;
  profile: Profile;
  profileEdited: boolean;
  question: string;
  ipHash: string;
  userAgent: string | null;
  /** First touch, stored on the row rather than a cookie: people scan on a phone and pay on a laptop. */
  touch?: TouchParams;
}): Promise<string> {
  const { data, error } = await db()
    .from('scans')
    .insert({
      domain: input.domain,
      brand_name: input.profile.brand_name,
      what_they_sell: input.profile.what_they_sell,
      buyer: input.profile.buyer,
      country: input.profile.country,
      category_term: input.profile.category_term,
      profile_edited: input.profileEdited,
      question: input.question,
      status: 'running',
      ip_hash: input.ipHash,
      user_agent: input.userAgent?.slice(0, 400) ?? null,
      utm_source: input.touch?.utm_source ?? null,
      utm_medium: input.touch?.utm_medium ?? null,
      utm_campaign: input.touch?.utm_campaign ?? null,
      utm_content: input.touch?.utm_content ?? null,
      fbclid: input.touch?.fbclid ?? null,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`Could not open a scan record: ${error?.message}`);
  return (data as { id: string }).id;
}

export async function completeScan(
  id: string,
  input: { captures: Capture[]; result: FreeResult; costUsd: number | null },
): Promise<void> {
  const { error } = await db()
    .from('scans')
    .update({
      captures: input.captures,
      result: input.result,
      cost_usd: input.costUsd,
      status: 'complete',
      completed_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw new Error(`Could not save the scan: ${error.message}`);
}

export async function failScan(id: string, message: string): Promise<void> {
  await db()
    .from('scans')
    .update({ status: 'failed', error: message.slice(0, 500), completed_at: new Date().toISOString() })
    .eq('id', id);
}

export async function attachEmail(id: string, email: string): Promise<void> {
  const { error } = await db()
    .from('scans')
    .update({ email, revealed_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`Could not save that address: ${error.message}`);
}

export async function markEmailed(id: string): Promise<void> {
  await db().from('scans').update({ emailed_at: new Date().toISOString() }).eq('id', id);
}

export async function joinWaitlist(input: {
  email: string;
  domain: string | null;
  source: string;
  scanId: string | null;
  ipHash: string;
}): Promise<void> {
  const { error } = await db()
    .from('waitlist')
    .upsert(
      {
        email: input.email,
        domain: input.domain,
        source: input.source,
        scan_id: input.scanId,
        ip_hash: input.ipHash,
      },
      { onConflict: 'email', ignoreDuplicates: true },
    );
  // A duplicate address is a success from the visitor's point of view.
  if (error && !/duplicate|unique/i.test(error.message)) {
    throw new Error(`Could not add that address: ${error.message}`);
  }
}
