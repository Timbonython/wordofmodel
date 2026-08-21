import { otpClient, safeNext } from '@/lib/auth';
import { env } from '@/lib/env';
import { validEmail } from '@/lib/email';
import { checkRateLimit, clientIp, hashIp, recordAttempt } from '@/lib/ratelimit';

export const runtime = 'nodejs';

/**
 * Sends the magic link. No passwords anywhere in this product.
 *
 * shouldCreateUser stays on: an account is created on first successful login,
 * and the auth user is what the on_auth_user_created trigger hangs it off. It also decides
 * WHICH email template fires - Confirm signup for a new address, Magic Link for a returning
 * one - so both templates have to carry the token hash form or half of them dead-end.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { email?: string; next?: string };

  const email = validEmail(body.email ?? '');
  if (!email) return Response.json({ error: 'That address does not look right.' }, { status: 400 });

  // Rate limited on the way in. This endpoint puts mail in somebody else's
  // inbox on request, so an unlimited one is a way to have the sending domain
  // burned by a stranger, and that domain also delivers every scan result.
  const ipHash = hashIp(clientIp(request.headers));
  const limit = await checkRateLimit(ipHash, 'login');
  if (!limit.ok) return Response.json({ error: limit.message }, { status: 429 });
  await recordAttempt(ipHash, 'login');

  const next = safeNext(body.next ?? null);

  // otpClient, not authClient: the SSR client forces PKCE, which mints a pkce_ token whose
  // verifier only exists on the device that asked. See lib/auth.ts.
  const supabase = otpClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${env.siteUrl}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    return Response.json({ error: 'Could not send that link. Try again shortly.' }, { status: 502 });
  }

  // Always the same answer. Whether an address already has an account is not
  // something a stranger gets to find out by trying it.
  return Response.json({ ok: true });
}
