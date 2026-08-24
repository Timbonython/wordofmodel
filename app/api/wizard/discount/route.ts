import { validateDiscount, discountLine, DiscountError } from '@/lib/discount';
import { checkRateLimit, clientIp, hashIp, recordAttempt } from '@/lib/ratelimit';

export const runtime = 'nodejs';

/**
 * Check a cohort code before the card, so the page can show the real number.
 *
 * This is the reason the codes do not go through allow_promotion_codes. A code entered on
 * Stripe's own page means our page said 249 and the invoice says 49, and checkout:check
 * exists to make exactly that unrepresentable. Validating here lets the pay step re-render
 * with the discounted price, and the session is then created carrying the discount that
 * number was calculated from - one read, one price, no second opinion.
 *
 * Rate limited on the wizard bucket, and it needs to be: without a cap this endpoint is a
 * free oracle for guessing codes, and the whole protection on a leaked code is a redemption
 * limit that guessing would walk straight past.
 */
export async function POST(request: Request) {
  const ipHash = hashIp(clientIp(request.headers));
  const limit = await checkRateLimit(ipHash, 'wizard');
  if (!limit.ok) return Response.json({ error: limit.message }, { status: 429 });

  const body = (await request.json().catch(() => ({}))) as { code?: unknown };
  const raw = typeof body.code === 'string' ? body.code : '';

  await recordAttempt(ipHash, 'wizard');
  try {
    const discount = await validateDiscount(raw);
    return Response.json({
      code: discount.code,
      priceUsd: discount.netCents / 100,
      months: discount.months,
      line: discountLine(discount),
    });
  } catch (err) {
    if (err instanceof DiscountError) return Response.json({ error: err.message }, { status: 400 });
    console.error('discount check failed', err instanceof Error ? err.message : err);
    return Response.json(
      { error: 'We could not check that code just now. Continue at the standard price and it will still be honoured.' },
      { status: 502 },
    );
  }
}
