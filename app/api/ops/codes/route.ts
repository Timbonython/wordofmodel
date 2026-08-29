import { authorised, unauthorised } from '@/lib/cron';
import { stripe, proveStripeMode } from '@/lib/stripe';
import { OFFERS } from '@/lib/discount';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Which discount codes exist, and which have been spent.
 *
 * THIS EXISTS BECAUSE THE LIVE KEY IS DELIBERATELY UNREACHABLE FROM A SHELL. The full
 * `sk_live_` lives in Vercel marked Sensitive and never appears in the repo or in a terminal,
 * which is the right rule and also means "print me the codes" cannot be answered locally. So
 * the answer is read where the key already is, and returned over one authorised request.
 *
 * READ ONLY. It creates nothing, redeems nothing and edits nothing. Behind the same
 * Authorization: Bearer $CRON_SECRET the scheduler uses, so there is one secret to rotate.
 *
 * It reports the MODE IT READ, always. A list of test-mode codes and a list of live-mode codes
 * look identical, and handing somebody a test code to give a customer is a silent failure that
 * ends at a checkout page refusing a code that plainly exists.
 */
export async function GET(request: Request) {
  if (!authorised(request)) return unauthorised();

  const mode = await proveStripeMode();
  const s = stripe();
  const out: Record<string, unknown>[] = [];

  for (const couponId of Object.keys(OFFERS)) {
    // Stripe paginates at 10 by default, and a silently truncated list of codes is a list of
    // codes somebody will believe is complete.
    const codes = await s.promotionCodes.list({ coupon: couponId, limit: 100 });
    for (const c of codes.data) {
      out.push({
        code: c.code,
        coupon: couponId,
        active: c.active,
        used: c.times_redeemed,
        of: c.max_redemptions,
        spent: c.max_redemptions !== null && c.times_redeemed >= c.max_redemptions,
        expires: c.expires_at ? new Date(c.expires_at * 1000).toISOString().slice(0, 10) : null,
      });
    }
    if (codes.has_more) out.push({ coupon: couponId, warning: 'MORE THAN 100 CODES; THIS LIST IS TRUNCATED' });
  }

  return Response.json({
    mode: mode.mode,
    modeProved: mode.resolved,
    modeDetail: mode.resolved ? undefined : mode.detail,
    count: out.length,
    codes: out,
  });
}
