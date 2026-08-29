import type Stripe from 'stripe';
import { env } from '@/lib/env';
import { stripe } from '@/lib/stripe';
import { db } from '@/lib/db';
import { priceKeyOf } from '@/lib/checkout';
import type { PriceKey } from '@/lib/stripe';
import {
  claimConfirmationEmail,
  claimStripeEvent,
  getSubscriptionByStripeId,
  markStripeEventHandled,
  releaseConfirmationEmail,
  releaseStripeEvent,
  upsertSubscription,
  verifyFoundingCountSaw,
} from '@/lib/billing';
import { sendConfirmationEmail, sendOpsAlert, sendPaymentFailedAlert } from '@/lib/billing-mail';
import { notifyNewSubscriber } from '@/lib/notify';
import { ensureBaselineRun } from '@/lib/run';
import { convertClaim, releaseClaimBySession } from '@/lib/founding';
import { recordFunnel } from '@/lib/funnel';
import { sendPurchaseEvent } from '@/lib/meta';
import { kickChains } from '@/lib/cron';
import { getScope } from '@/lib/onboarding';

/**
 * Stripe webhooks.
 *
 * Four properties this handler has to hold, in order of how expensive they are
 * to get wrong:
 *
 *   1. The signature is verified against the RAW body. Anyone can POST here.
 *      Parsing before verifying, or verifying a re-serialised body, makes the
 *      check meaningless.
 *   2. Every event is claimed in stripe_events first. Stripe retries a non-200
 *      for three days, and a replayed checkout.session.completed would send a
 *      second receipt.
 *   3. A handler that throws releases its claim and returns 500, so Stripe's
 *      retry is processed rather than skipped as a duplicate. A paid
 *      subscription with no row is the worst outcome available here.
 *   4. An event we do not handle still returns 200. Anything else teaches Stripe
 *      the endpoint is broken and eventually disables it.
 *
 * Delivery is not ordered. upsertSubscription drops an event older than the last
 * one applied, which is what stops a late subscription.updated from resurrecting
 * a cancellation.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature');
  if (!signature) return new Response('Missing signature', { status: 400 });

  // Raw text, before anything parses it.
  const body = await request.text();

  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(
      body,
      signature,
      env.stripeWebhookSecret,
    );
  } catch (err) {
    // Never echo the reason. It is either a misconfigured secret, which belongs
    // in the server log, or somebody probing, who gets nothing.
    console.error('Stripe signature check failed:', err instanceof Error ? err.message : err);
    return new Response('Invalid signature', { status: 400 });
  }

  const fresh = await claimStripeEvent(event);
  if (!fresh) return Response.json({ received: true, duplicate: true });

  try {
    await handle(event);
    await markStripeEventHandled(event.id);
    return Response.json({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Stripe webhook ${event.type} (${event.id}) failed:`, message);
    await releaseStripeEvent(event.id);
    return new Response('Handler failed', { status: 500 });
  }
}

async function handle(event: Stripe.Event): Promise<void> {
  const eventAt = new Date(event.created * 1000);

  switch (event.type) {
    case 'checkout.session.completed':
      return onCheckoutCompleted(event.data.object, eventAt);

    // A founding place is held from session creation, so an abandoned checkout has to give it
    // back. The claim expires on its own after thirty minutes, which is the backstop; this
    // returns it the moment Stripe says the session is dead, so the next visitor sees it.
    case 'checkout.session.expired':
      return releaseClaimBySession(event.data.object.id);

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return onSubscriptionChanged(event.data.object, eventAt);

    case 'invoice.payment_failed':
      return onPaymentFailed(event.data.object);

    default:
      // Handled by returning 200 and doing nothing.
      return;
  }
}

/**
 * The moment somebody becomes a subscriber. The subscription is retrieved
 * rather than read off the session, because the session carries only an id and
 * the period dates live on the subscription item.
 */
async function onCheckoutCompleted(
  session: Stripe.Checkout.Session,
  eventAt: Date,
): Promise<void> {
  if (session.mode !== 'subscription' || session.payment_status === 'unpaid') return;

  const subscriptionId =
    typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
  if (!subscriptionId) throw new Error('Checkout session completed with no subscription');

  // The founding place stops being a claim and starts being a subscription. Doing this before
  // the subscription row is written is deliberate: both are idempotent, and a converted claim
  // that somehow lost its subscription is a place held by an account that paid, which is the
  // safe direction. A claim left pending would free itself in half an hour and let somebody
  // else take a place this person has already been charged for.
  const claimId = session.metadata?.founding_claim_id;
  if (claimId) await convertClaim(claimId);

  // FIRED FROM HERE, NEVER FROM THE BROWSER. The visitor is redirected out to Stripe and back,
  // through whatever ad blocker and privacy setting they have; the browser is the least
  // reliable witness to the one event that decides whether the advertising worked.
  const scanId = session.metadata?.scan_id ?? null;
  await recordFunnel({
    event: 'subscription_active',
    scanId,
    accountId: session.metadata?.account_id ?? null,
    // A MARKER, NOT A BROWSER STRING. There is no visitor on this request - Stripe's server is
    // calling us - so recording Stripe's own agent would suggest a browser was involved. The
    // column exists to answer "what wrote this row", and for this step the answer is this.
    userAgent: 'server:stripe-webhook',
  });

  // The only Purchase event, and it is sent from here. event_id is the session id, so a
  // browser event added later would collapse into this one rather than double the count.
  const buyerEmail = session.customer_details?.email ?? null;
  if (buyerEmail) {
    await sendPurchaseEvent({
      email: buyerEmail,
      priceKey: (session.metadata?.price_key as 'premium_founding_monthly' | 'premium_monthly') ?? 'premium_monthly',
      eventId: session.id,
      country: session.customer_details?.address?.country ?? null,
    });
  }

  const accountId = session.metadata?.account_id;
  const scopeId = session.metadata?.scope_id ?? session.client_reference_id ?? undefined;
  if (!accountId || !scopeId) {
    throw new Error(`Checkout session ${session.id} has no account_id or scope_id`);
  }

  const sub = await stripe().subscriptions.retrieve(subscriptionId);
  const priceKey = await priceKeyOf(sub);
  const { row } = await upsertSubscription({
    sub,
    accountId,
    scopeId,
    priceKey,
    eventAt,
    scanId,
    discountCode: session.metadata?.discount_code ?? sub.metadata?.discount_code ?? null,
  });

  // THE NON-ZERO PATH. A founding subscription now exists; if the counter still reports nobody
  // holding one, the cap is blind and this is the only moment that is observable. Never throws
  // - the subscription is already written and a reporting fault must not cost the customer.
  await verifyFoundingCountSaw(priceKey, sub.id);

  await sendReceipt({
    row,
    subId: sub.id,
    accountId,
    scopeId,
    email: session.customer_details?.email ?? null,
  });

  // Tell Tim. AFTER the receipt, because the subscriber being told is what matters and this is
  // only what tells us. It never throws, so it cannot cost the receipt or release the event
  // claim; and it is here rather than in onSubscriptionChanged because this is the branch that
  // means money actually moved - customer.subscription.created arrives with status
  // 'incomplete' when the first charge has not cleared.
  await notifyNewSubscriber({
    subscriptionId: sub.id,
    accountId,
    scopeId,
    priceKey: await priceKeyOf(sub),
    email: session.customer_details?.email ?? null,
    scanId,
    reportDay: row.report_day ?? null,
  });

  await openFirstRun(scopeId, sub.id);
}

/**
 * Open the subscriber's first run, within 24 hours of them paying.
 *
 * THIS HANDLER MAKES NO ENGINE CALLS. It inserts a run row and its queue - a cheap write
 * - and hands off to the tick chain. Fifty five paid API calls inside a webhook would put
 * minutes of third-party latency on a path Stripe expects to answer quickly, on the one
 * path in this build that has already failed silently once.
 *
 * Failure here NEVER breaks the webhook. Throwing would release the stripe_events claim,
 * Stripe would redeliver, and the receipt logic would run again - trading a missing first
 * run for a missing receipt. Instead it alerts, and the daily scheduler opens the run
 * anyway through scopesAwaitingFirstRun(). Two independent routes to the same outcome,
 * because one route is what cost us the confirmation email.
 */
async function openFirstRun(scopeId: string, subId: string): Promise<void> {
  try {
    const started = await ensureBaselineRun(scopeId);
    if (!started.length) return;
    // Fire and forget. If the kick never lands the sweeper finds the pending jobs within
    // five minutes.
    await kickChains();
  } catch (err) {
    await sendOpsAlert({
      subject: `First run could not be opened: ${subId}`,
      lines: [
        'A subscriber has paid and their first run was not queued.',
        '',
        `Subscription: ${subId}`,
        `Scope:        ${scopeId}`,
        `Reason:       ${err instanceof Error ? err.message : String(err)}`,
        '',
        'The payment, the subscription row and the receipt are all fine, and the webhook',
        'returned 200. The daily scheduler will open this run through',
        'scopesAwaitingFirstRun(), so the 24 hour promise still holds - but if the cause',
        'is a configuration problem (fewer than five approved questions is the likely',
        'one) the scheduler will fail the same way and nobody will be told twice.',
      ],
    });
  }
}

/**
 * The receipt people go looking for.
 *
 * The right to send is claimed against the subscription row, not inferred from
 * having inserted it. That distinction is the whole bug this replaces: the send
 * used to happen only when this handler did the insert, so whenever
 * customer.subscription.created arrived first, which is the normal ordering, the
 * receipt was never attempted and nothing said so.
 *
 * Every failure below is loud. A subscriber who has paid and heard nothing is
 * not something to find out about from them.
 */
async function sendReceipt(input: {
  row: { id: string; report_day: number; current_period_end: string | null; price_key: PriceKey };
  subId: string;
  accountId: string;
  scopeId: string;
  email: string | null;
}): Promise<void> {
  const { row, subId } = input;

  let claimed = false;
  try {
    claimed = await claimConfirmationEmail(row.id);
    if (!claimed) return;

    const scope = await getScope(input.scopeId);
    const email = input.email ?? (await accountEmail(input.accountId));

    if (!email || !scope) {
      throw new Error(
        `no ${!email ? 'email address' : 'scope'} to send to (account ${input.accountId})`,
      );
    }

    await sendConfirmationEmail({
      to: email,
      brandName: scope.brand_name,
      reportDay: row.report_day,
      priceKey: row.price_key,
    });
  } catch (err) {
    // Hand the claim back so the next delivery of this event can try again.
    if (claimed) await releaseConfirmationEmail(row.id);

    await sendOpsAlert({
      subject: `Confirmation email failed: ${subId}`,
      lines: [
        'A subscriber has paid and has not been told.',
        '',
        `Subscription: ${subId}`,
        `Account:      ${input.accountId}`,
        `Scope:        ${input.scopeId}`,
        `Reason:       ${err instanceof Error ? err.message : String(err)}`,
        '',
        'The subscription itself is recorded correctly and the webhook returned 200.',
        'The claim has been released, so Stripe redelivering this event will retry',
        'the send. If it does not, send the welcome email by hand.',
      ],
    });
  }
}

/**
 * Status, cancellation and renewal date. Also the safety net for a subscription
 * created outside the wizard: without a row, nothing downstream will ever run a
 * report for it, and a paying customer would sit in silence.
 */
async function onSubscriptionChanged(sub: Stripe.Subscription, eventAt: Date): Promise<void> {
  const existing = await getSubscriptionByStripeId(sub.id);

  const accountId = existing?.account_id ?? sub.metadata?.account_id;
  const scopeId = existing?.scope_id ?? sub.metadata?.scope_id;
  if (!accountId || !scopeId) {
    // Nothing to attach it to. Loud, because it means a subscription exists that
    // no report will ever be generated for.
    throw new Error(`Subscription ${sub.id} has no account_id or scope_id in metadata`);
  }

  await upsertSubscription({
    sub,
    accountId,
    scopeId,
    priceKey: existing?.price_key ?? await priceKeyOf(sub),
    eventAt,
    // Only used on insert. Whichever of the two events lands first carries it, which is why
    // createCheckout puts the same metadata on the session AND the subscription.
    scanId: existing?.scan_id ?? sub.metadata?.scan_id ?? null,
    discountCode: existing?.discount_code ?? sub.metadata?.discount_code ?? null,
  });
}

/**
 * Never cancel here. Smart Retries run four attempts over about two weeks; the
 * subscription goes past_due, report generation pauses, and the customer gets an
 * email. Cancelling on a first declined card loses people whose card simply
 * expired.
 */
async function onPaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
  await sendPaymentFailedAlert({
    customerId: customerId ?? null,
    email: invoice.customer_email,
    amountDue: invoice.amount_due,
    currency: invoice.currency,
    attemptCount: invoice.attempt_count ?? null,
    hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
  });
}

async function accountEmail(accountId: string): Promise<string | null> {
  const { data } = await db().from('accounts').select('email').eq('id', accountId).limit(1);
  return (data?.[0] as { email: string } | undefined)?.email ?? null;
}
