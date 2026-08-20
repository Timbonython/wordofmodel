import 'server-only';
import type Stripe from 'stripe';
import { db } from './db';
import { FOUNDING_SEATS, idOf, periodEnd, periodStart, type PriceKey } from './stripe';

/**
 * Everything that reads or writes the billing side of the schema
 * (supabase/migrations/0003_billing.sql), plus the founding counter.
 *
 * Every write in here runs on the secret key and bypasses RLS. Nothing in this
 * file may ever be called from a client component.
 */

export interface SubscriptionRow {
  id: string;
  account_id: string;
  scope_id: string;
  stripe_subscription_id: string;
  stripe_customer_id: string;
  stripe_price_id: string;
  price_key: PriceKey;
  status: Stripe.Subscription.Status;
  report_day: number;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  confirmation_sent_at: string | null;
  stripe_event_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Statuses that mean somebody is a subscriber right now. past_due is in here on
 * purpose: Smart Retries are still running, the report keeps generating, and
 * treating a first failed card as a cancellation is how you lose a customer to
 * an expired card.
 */
export const LIVE_STATUSES: Stripe.Subscription.Status[] = ['active', 'trialing', 'past_due'];

// ---------------------------------------------------------- founding counter

export interface FoundingState {
  taken: number;
  remaining: number;
  /** The price the wizard should use right now. */
  priceKey: PriceKey;
}

/**
 * TWENTY BUSINESSES, NOT TWENTY SUBSCRIPTIONS. Counted over DISTINCT account_id.
 *
 * Changed 20 Aug 2026. It used to count subscription rows, which was fine while every
 * account had exactly one scope and wrong the moment one did not. The schema has always
 * allowed an account to hold several scopes with a subscription each - an agency, or a
 * business selling into both AU and US and wanting two reports rather than one averaged
 * one - and under a row count that agency would have taken four of the twenty seats on
 * its own.
 *
 * Two reasons that is the wrong answer. "The first 20 subscribers" reads to a customer as
 * twenty companies, and a claim that quietly means something else is the kind of thing
 * that gets found out. And it penalised exactly the wrong customer: the one buying the
 * most.
 *
 * Active or ever. A founding subscriber who cancels does not return their place: the
 * promise was the first twenty, not the first twenty still here. Only incomplete_expired
 * is excluded, because that is a checkout that never became a subscription at all.
 *
 * A consequence worth knowing rather than discovering: an account already holding a
 * founding place adds a second market without consuming another seat, and gets the
 * founding rate on it while seats remain. That follows from the rate being promised to a
 * business rather than to a subscription, and it is the generous direction to be wrong in.
 *
 * The number this returns is displayed. It is the real count and it has to stay the real
 * count: a scarcity number somebody can disprove with a screenshot costs more than the
 * scarcity was worth.
 */
export async function foundingState(): Promise<FoundingState> {
  // count(distinct) is not expressible through the query builder, so the account ids are
  // read and deduplicated here. Bounded by design - the founding set is twenty accounts
  // and their markets - so this is a handful of rows, not a scan. If it ever is not,
  // it becomes an RPC.
  const { data, error } = await db()
    .from('subscriptions')
    .select('account_id')
    .eq('price_key', 'founding_monthly')
    .neq('status', 'incomplete_expired');

  // A counter that cannot be read must not silently hand out the founding rate.
  if (error) throw new Error(`Founding count failed: ${error.message}`);

  const taken = new Set((data ?? []).map((r) => (r as { account_id: string }).account_id)).size;
  const remaining = Math.max(0, FOUNDING_SEATS - taken);
  return {
    taken,
    remaining,
    priceKey: remaining > 0 ? 'founding_monthly' : 'standard_monthly',
  };
}

/**
 * The pricing block renders on every page view, and a Supabase outage should
 * cost the founding line rather than the front page. Falls back to null, and
 * the caller renders the offer without a count.
 */
export async function foundingStateOrNull(): Promise<FoundingState | null> {
  try {
    return await foundingState();
  } catch {
    return null;
  }
}

// ------------------------------------------------------------- subscriptions

export async function getSubscriptionByStripeId(id: string): Promise<SubscriptionRow | null> {
  const { data, error } = await db()
    .from('subscriptions')
    .select('*')
    .eq('stripe_subscription_id', id)
    .limit(1);
  if (error) throw new Error(`Subscription lookup failed: ${error.message}`);
  return (data?.[0] as SubscriptionRow | undefined) ?? null;
}

export async function getSubscriptionForAccount(accountId: string): Promise<SubscriptionRow | null> {
  const { data, error } = await db()
    .from('subscriptions')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(`Subscription lookup failed: ${error.message}`);
  return (data?.[0] as SubscriptionRow | undefined) ?? null;
}

/**
 * Report day from the billing anchor, capped at 28.
 *
 * The cap is what stops a subscriber who signed up on the 31st having a report
 * date that does not exist in February. Billing and reporting share the day on
 * purpose, so nobody ever pays for a month with no report in it.
 */
export function reportDayFrom(date: Date): number {
  return Math.min(date.getUTCDate(), 28);
}

/**
 * Writes what Stripe says about a subscription into our row.
 *
 * Idempotent, because webhook delivery is not ordered and not exactly once:
 *
 *   - keyed on stripe_subscription_id, so a replayed event updates rather than
 *     inserting a second row.
 *   - eventAt is compared against stripe_event_at and an older event is dropped.
 *     Without this a subscription.updated that arrives late overwrites a
 *     cancellation and puts a churned customer back on the run list.
 *
 * accountId and scopeId are only needed on the insert. On an update they are
 * already set, and passing them again would let a mislabelled event reassign a
 * subscription to a different account.
 */
export async function upsertSubscription(input: {
  sub: Stripe.Subscription;
  accountId: string;
  scopeId: string;
  priceKey: PriceKey;
  eventAt: Date;
}): Promise<{ row: SubscriptionRow; created: boolean }> {
  const { sub, eventAt } = input;
  const existing = await getSubscriptionByStripeId(sub.id);

  if (existing) {
    if (existing.stripe_event_at && new Date(existing.stripe_event_at) > eventAt) {
      return { row: existing, created: false };
    }
    const { data, error } = await db()
      .from('subscriptions')
      .update({
        status: sub.status,
        cancel_at_period_end: sub.cancel_at_period_end,
        current_period_end: periodEnd(sub)?.toISOString() ?? null,
        stripe_price_id: sub.items.data[0]?.price.id ?? existing.stripe_price_id,
        stripe_event_at: eventAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error || !data) throw new Error(`Could not update the subscription: ${error?.message}`);
    return { row: data as SubscriptionRow, created: false };
  }

  const { data, error } = await db()
    .from('subscriptions')
    .insert({
      account_id: input.accountId,
      scope_id: input.scopeId,
      stripe_subscription_id: sub.id,
      stripe_customer_id: idOf(sub.customer) ?? '',
      stripe_price_id: sub.items.data[0]?.price.id ?? '',
      price_key: input.priceKey,
      status: sub.status,
      report_day: reportDayFrom(periodStart(sub)),
      cancel_at_period_end: sub.cancel_at_period_end,
      current_period_end: periodEnd(sub)?.toISOString() ?? null,
      stripe_event_at: eventAt.toISOString(),
    })
    .select('*')
    .single();

  // A race between checkout.session.completed and customer.subscription.created
  // loses on the unique index rather than writing twice. Re-read and treat the
  // row the winner wrote as ours.
  if (error && /duplicate|unique/i.test(error.message)) {
    const row = await getSubscriptionByStripeId(sub.id);
    if (row) return { row, created: false };
  }
  if (error || !data) throw new Error(`Could not record the subscription: ${error?.message}`);
  return { row: data as SubscriptionRow, created: true };
}

// ------------------------------------------------------------ event log

/**
 * The idempotency gate. Insert first, and if the row is already there the event
 * has been handled: Stripe retries a non-200 for three days, and a duplicated
 * checkout.session.completed would send a second receipt.
 *
 * Returns false when the event has been seen before.
 */
export async function claimStripeEvent(event: Stripe.Event): Promise<boolean> {
  const { error } = await db().from('stripe_events').insert({
    id: event.id,
    type: event.type,
    api_version: event.api_version,
    payload: event as unknown as Record<string, unknown>,
  });
  if (!error) return true;
  if (/duplicate|unique/i.test(error.message)) return false;
  throw new Error(`Could not record the Stripe event: ${error.message}`);
}

export async function markStripeEventHandled(id: string, err?: string): Promise<void> {
  await db()
    .from('stripe_events')
    .update({ handled_at: new Date().toISOString(), error: err?.slice(0, 500) ?? null })
    .eq('id', id);
}

/**
 * Lets a failed handler be retried. The claim is released so Stripe's next
 * delivery of the same event is processed rather than skipped as a duplicate.
 * A handler that threw halfway has left the write incomplete, and silently
 * swallowing the retry is how a paid subscription ends up with no row.
 */
export async function releaseStripeEvent(id: string): Promise<void> {
  await db().from('stripe_events').delete().eq('id', id);
}

// ------------------------------------------------------- confirmation email

/**
 * Claims the right to send the confirmation email, atomically.
 *
 * Returns true exactly once per subscription. The conditional update is the
 * whole mechanism: two concurrent webhook deliveries both run it, Postgres
 * serialises them, and only the one that finds confirmation_sent_at still null
 * gets a row back.
 *
 * This replaces gating the send on "did I insert the subscription row". That
 * gate lost the receipt entirely whenever customer.subscription.created beat
 * checkout.session.completed, which is the normal ordering, and it did so
 * silently. See 0004_confirmation_sent.sql.
 */
export async function claimConfirmationEmail(subscriptionId: string): Promise<boolean> {
  const { data, error } = await db()
    .from('subscriptions')
    .update({ confirmation_sent_at: new Date().toISOString() })
    .eq('id', subscriptionId)
    .is('confirmation_sent_at', null)
    .select('id');
  if (error) throw new Error(`Could not claim the confirmation email: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/**
 * Hands the claim back after a failed send, so the next delivery of the event
 * can try again. Without this a transient Resend outage would burn the only
 * chance to send a receipt.
 */
export async function releaseConfirmationEmail(subscriptionId: string): Promise<void> {
  const { error } = await db()
    .from('subscriptions')
    .update({ confirmation_sent_at: null })
    .eq('id', subscriptionId);
  if (error) {
    console.error(`Could not release the confirmation claim for ${subscriptionId}: ${error.message}`);
  }
}
