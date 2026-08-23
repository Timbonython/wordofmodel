import { authClient } from '@/lib/auth';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

/**
 * Sign out. There was no way to.
 *
 * A magic link signs somebody in on whichever device opened the email and leaves them signed
 * in indefinitely, and until now nothing anywhere said who that was or offered a way out. The
 * case that found it: signed in as one address on a phone, a report link for another arrives,
 * and the page refuses. Correctly - it is not their report - but with no way to see whose
 * session they are in, no way to leave it, and therefore no way to fix it.
 *
 * POST, not GET, and it is not pedantry. A GET sign-out is a link an email client or a
 * prefetcher can follow on the subscriber's behalf, which logs people out at random.
 *
 * The form posts here and this redirects back to /account, where they land signed out and are
 * offered the sign-in form: the same page, a different state, and both states have an action
 * in them.
 */
export async function POST(): Promise<Response> {
  const supabase = await authClient();

  // Errors are logged and swallowed. If Supabase cannot be reached, the cookie is still
  // cleared locally by the client, and stranding somebody on an error page when they asked to
  // leave is the worst possible answer to "sign me out".
  const { error } = await supabase.auth.signOut();
  if (error) console.error('Sign out failed:', error.message);

  return Response.redirect(new URL('/account?signed_out=1', env.siteUrl), 303);
}
