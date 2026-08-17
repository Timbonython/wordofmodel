import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';
import type { Capture, FreeResult, Profile } from './types';

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
export async function findCachedScan(domain: string): Promise<ScanRow | null> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
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

export async function getScan(id: string): Promise<ScanRow | null> {
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
