import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { env } from './env';
import { ensureAccount, type AccountRow } from './accounts';

/**
 * Magic link auth, entirely server side.
 *
 * Nothing in this build talks to Supabase from a browser, and auth does not
 * change that: the link is sent from a route handler and the callback is
 * exchanged in a route handler, so the publishable key stays on the server and
 * is deliberately not named NEXT_PUBLIC_.
 *
 * This client runs on the publishable key and is subject to RLS, which is the
 * point: it is the one client that acts as the signed in subscriber. Anything
 * that has to write goes through db() on the secret key instead.
 */
export async function authClient(): Promise<SupabaseClient> {
  const store = await cookies();

  return createServerClient(env.supabaseUrl, env.supabasePublishableKey, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            store.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read only. The
          // proxy refreshes the session on every request, so the write that
          // failed here has already happened there.
        }
      },
    },
  });
}

/**
 * getUser, not getSession: the session comes out of a cookie the browser could
 * have written, and only the auth server can say whether the token in it is
 * real. Returns null rather than throwing, because "not signed in" is an
 * ordinary answer everywhere this is called.
 */
export async function getAuthUser(): Promise<User | null> {
  const supabase = await authClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user ?? null;
}

/** The signed in subscriber's account, or null. */
export async function getCurrentAccount(): Promise<AccountRow | null> {
  const user = await getAuthUser();
  if (!user?.email) return null;
  return ensureAccount(user.id, user.email);
}

/**
 * Only ever redirect within this site. An open redirect on the auth callback is
 * how a magic link gets turned into a credential harvester, and the `next`
 * parameter arrives from the email.
 */
export function safeNext(next: string | null): string {
  if (!next) return '/';
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/';
  return next;
}
