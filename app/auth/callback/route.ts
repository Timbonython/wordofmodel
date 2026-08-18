import type { EmailOtpType } from '@supabase/supabase-js';
import { authClient, safeNext } from '@/lib/auth';
import { ensureAccount } from '@/lib/accounts';

export const runtime = 'nodejs';

/**
 * Where the magic link lands. Two shapes are accepted on purpose:
 *
 *   token_hash + type   the email template pointing straight here. Works when
 *                       the link is opened on a different device to the one that
 *                       asked for it, which is most of the time: people request
 *                       on a laptop and read mail on a phone.
 *   code                the PKCE exchange. Same browser only, because the
 *                       verifier is a cookie.
 *
 * Supporting both means the flow survives whichever way the email template is
 * configured, and a cross device click never dead ends.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get('next'));
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  const code = url.searchParams.get('code');

  // Nothing to exchange. Answer before touching the auth client, so a bare hit
  // on this route is a redirect rather than a 500.
  if (!tokenHash && !code) {
    return Response.redirect(new URL('/?auth=link_expired', url.origin), 303);
  }

  const supabase = await authClient();

  const result = tokenHash
    ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type ?? 'email' })
    : code
      ? await supabase.auth.exchangeCodeForSession(code)
      : null;

  if (!result || result.error || !result.data.user) {
    // Expired, already used, or opened in a browser that never asked. Say so
    // plainly rather than looping the visitor back to a form with no reason.
    return Response.redirect(new URL('/?auth=link_expired', url.origin), 303);
  }

  // The trigger has already done this. Doing it again here means the callback
  // is correct on its own, including for any auth user that predates 0002.
  const user = result.data.user;
  if (user.email) await ensureAccount(user.id, user.email);

  return Response.redirect(new URL(next, url.origin), 303);
}
