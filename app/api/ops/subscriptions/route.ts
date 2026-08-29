import { authorised, unauthorised } from '@/lib/cron';
import { db } from '@/lib/db';
import { stripe, proveStripeMode, planItem, locationItem } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * What each live subscription actually looks like inside Stripe.
 *
 * BUILT FOR ONE QUESTION THE DASHBOARD ANSWERS BADLY: after a 100% off trial redemption, is
 * there a card on file? At US$0 the first invoice collects nothing, and Stripe's default
 * (`payment_method_collection: 'if_required'`) would take no card at all - so month four does
 * not step to US$69, it fails for want of a payment method and cancels. From the outside that
 * looks exactly like a customer who left.
 *
 * `createCheckout` passes `payment_method_collection: 'always'` to prevent it. This is how you
 * see that it worked, on a real redemption, rather than trusting the parameter.
 *
 * BOTH PLACES A CARD CAN LIVE. Stripe charges the subscription's own default_payment_method if
 * set, and falls back to the CUSTOMER's invoice_settings default. Either one collects, so
 * reporting only the first would call a healthy subscription broken.
 *
 * Read only, behind the same Authorization: Bearer $CRON_SECRET the scheduler uses.
 */
export async function GET(request: Request) {
  if (!authorised(request)) return unauthorised();

  const mode = await proveStripeMode();
  const { data, error } = await db()
    .from('subscriptions')
    .select('scope_id, price_key, status, stripe_subscription_id, discount_code, created_at');
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as Array<{
    scope_id: string;
    price_key: string;
    status: string;
    stripe_subscription_id: string;
    discount_code: string | null;
    created_at: string;
  }>;
  const out = [];
  for (const r of rows) {
    let stripeFacts: Record<string, unknown> = { unreadable: true };
    try {
      const sub = await stripe().subscriptions.retrieve(r.stripe_subscription_id, {
        expand: ['default_payment_method', 'customer', 'discounts'],
      });
      const onSub = sub.default_payment_method as { id?: string; card?: { brand?: string; last4?: string } } | null;
      const customer = sub.customer as { invoice_settings?: { default_payment_method?: unknown } } | null;
      const onCustomer = customer?.invoice_settings?.default_payment_method ?? null;
      const card = onSub?.card ? `${onSub.card.brand} ****${onSub.card.last4}` : null;

      // `discounts` in 2026-07-29.dahlia; `discount` is the older singular. Read both, because
      // an empty array and a missing field mean different things and only one of them is "no
      // discount".
      const discounts = ((sub as unknown as { discounts?: unknown[] }).discounts ?? []).map((d) => {
        const x = d as { coupon?: { id?: string; percent_off?: number; duration?: string; duration_in_months?: number } };
        return {
          coupon: x.coupon?.id,
          percentOff: x.coupon?.percent_off,
          duration: x.coupon?.duration,
          months: x.coupon?.duration_in_months,
        };
      });

      stripeFacts = {
        status: sub.status,
        plan: planItem(sub)?.price.lookup_key ?? null,
        locations: locationItem(sub)?.quantity ?? 0,
        cardOnSubscription: card,
        cardOnCustomer: Boolean(onCustomer),
        // THE ANSWER TO THE QUESTION THIS ROUTE EXISTS FOR.
        willCollectAtFullPrice: Boolean(onSub?.id || onCustomer),
        discounts,
        periodEnd: planItem(sub)?.current_period_end
          ? new Date(planItem(sub)!.current_period_end * 1000).toISOString().slice(0, 10)
          : null,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
      };
    } catch (err) {
      stripeFacts = { unreadable: true, why: err instanceof Error ? err.message : String(err) };
    }
    out.push({ scope: r.scope_id, priceKey: r.price_key, dbStatus: r.status, code: r.discount_code, ...stripeFacts });
  }

  return Response.json({
    mode: mode.mode,
    modeProved: mode.resolved,
    // Zero is not healthy, it is nothing. Said out loud for the same reason the location
    // reconciliation says it.
    examined: out.length,
    subscriptions: out,
  });
}
