import 'server-only';
import type Stripe from 'stripe';
import { db } from './db';
import { FOUNDING_SEATS, idOf, periodEnd, periodStart, planItem, type PriceKey } from './stripe';
import { sendOpsAlert } from './billing-mail';

/**
 * Everything that reads or writes the billing side of the schema
 * (supabase/migrations/0003_billing.sql), plus the founding counter.
 *
 * Every write in here runs on the secret key and bypasses RLS. Nothing in this
 * file may ever be called from a client component.
 */

export interface SubscriptionRow {
  /** The scan this subscriber came from, or null if they arrived without one. */
  scan_id?: string | null;
  id: string;
  account_id: string;
  scope_id: string;
  stripe_subscription_id: string;
  stripe_customer_id: string;
  stripe_price_id: string;
  price_key: PriceKey;
  /** Cohort code, on insert only. Null for everybody who paid the listed price. */
  discount_code: string | null;
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
/**
 * THE NUMBER ON THE PAGE. Confirmed subscriptions only, and it never goes up.
 *
 * DELIBERATELY NOT THE NUMBER THAT DECIDES A CHARGE, which is claimFoundingSeat() in
 * lib/founding.ts. The two differ by the claims held during somebody else's checkout, and the
 * asymmetry is chosen rather than accidental:
 *
 *   Counting live claims here would make the public figure fall when a stranger opens a
 *   checkout and rise again half an hour later when they abandon it. A scarcity number that
 *   rebounds reads as a trick, and it is the one thing a visitor can catch us doing.
 *
 *   Ignoring claims here means the page can say "one place left" while a claim is pending, and
 *   the next person to reach checkout is told it has gone. That is rare, it is honest, and it
 *   happens BEFORE the card rather than after it.
 *
 * So the displayed count is monotonic and slightly generous, the charged rate is strict, and
 * nobody is charged a rate they were not shown. The page is a forecast; the session is the
 * fact. Nothing may read this function to decide money.
 */
export async function foundingDisplay(): Promise<FoundingState> {
  // count(distinct) is not expressible through the query builder, so the account ids are
  // read and deduplicated here. Bounded by design - the founding set is twenty accounts
  // and their markets - so this is a handful of rows, not a scan. If it ever is not,
  // it becomes an RPC.
  const { data, error } = await db()
    .from('subscriptions')
    .select('account_id')
    // BOTH founding prices. The cohort has a monthly and an annual rate and is ONE cohort of
    // twenty, not twenty of each. Counting only the monthly one would let the cap leak to
    // forty permanent discounts, which is the same defect this whole section exists to stop.
    .in('price_key', ['premium_founding_monthly', 'premium_founding_annual'])
    .neq('status', 'incomplete_expired');

  // A counter that cannot be read must not silently hand out the founding rate.
  if (error) throw new Error(`Founding count failed: ${error.message}`);

  const taken = new Set((data ?? []).map((r) => (r as { account_id: string }).account_id)).size;
  const remaining = Math.max(0, FOUNDING_SEATS - taken);
  return {
    taken,
    remaining,
    priceKey: remaining > 0 ? 'premium_founding_monthly' : 'premium_monthly',
  };
}

/**
 * When the founding offer closes. §3 of the pricing plan: 30 September 2026, or twenty places,
 * whichever comes first.
 *
 * End of that day in Adelaide, expressed in UTC. A cap on a date that quietly means "the
 * morning of the 30th, if you are east of us" is the kind of detail somebody finds out about
 * by being refused.
 */
export const FOUNDING_CLOSES = new Date('2026-10-01T13:30:00Z');

/**
 * THE ONE THE PAGE READS. Null means DO NOT OFFER, and the caller renders no founding block at
 * all - not a block without a number.
 *
 * FAILS CLOSED, and this is the whole point of the function.
 *
 * Until 28 Aug 2026 this was foundingDisplayOrNull(), it returned null on failure, and the
 * callers read null as "render the offer without a count". So an unreadable counter offered
 * the founding rate to everybody, indefinitely, with nothing to say how many places were
 * left - which is selling an unbounded number of permanent 40% discounts and not finding out.
 * A failed count cannot tell you whether the offer is open, so it cannot be offered.
 *
 * AND IT ALERTS. A silently broken count refuses the offer to every visitor while the page
 * looks perfectly normal - the same defect in the opposite direction, and the one more likely
 * to run for a week before anybody notices. The read failing is the alert; a genuine zero is
 * not an error and does not alert.
 */
/**
 * One alert per process per half hour, not one per page render.
 *
 * FOUND BY BREAKING IT. The Gate 4 fail-closed proof fired three alerts in twenty seconds from
 * three page loads, and this page is rendered by every visitor. On production that is an inbox
 * flooded within a minute and, worse, a good chance of hitting Resend's rate limit - which
 * would take out the alert channel for the failures that actually cost a customer.
 *
 * In-process and deliberately not in the database: a counter that needs a working database to
 * report a broken database is the same mistake as an alert address on the domain it monitors.
 * Several instances each sending one an hour is a fine outcome; a fleet sending one per render
 * is not.
 */
const ALERT_EVERY_MS = 30 * 60_000;
let lastFoundingAlert = 0;

/**
 * THE LAST COUNT THAT READ CLEANLY, AND WHY SERVING IT IS NOT WEAKENING THE GUARD.
 *
 * The fail-closed rule exists to stop an unreadable counter handing out unlimited permanent
 * discounts. It does not do that work alone and never did: `claim_founding_seat` decides the
 * charge atomically, in Postgres, at the moment of buying. This build's own rule is that the
 * check belongs where the decision is made rather than where the number is shown - so a page
 * showing US$149 hands out nothing by itself, and a stale count can only cost anything if more
 * people buy inside the cache window than the margin allows.
 *
 * What failing closed DOES cost is real: every visitor sees US$249 for the duration, at the one
 * moment they were closest to buying, and the page looks completely normal while it happens.
 *
 * So a count that read cleanly less than a minute ago is served when the live read fails, but
 * ONLY while it showed comfortable room. Near the cap it falls closed as before, because that is
 * the only region where staleness could actually overshoot.
 */
const COUNT_CACHE_MS = 60_000;

/**
 * How much room the cached count must show before it is trusted after a failed read.
 *
 * Three seats. The exposure is "founding purchases completed inside sixty seconds", and three is
 * far beyond any rate this product has seen or plausibly will - while still refusing to guess in
 * the region where guessing could hand out seat twenty-one.
 */
const FOUNDING_STALE_MARGIN = 3;

let lastGoodCount: { at: number; state: FoundingState } | null = null;

/**
 * ONE RETRY, AND ONLY WHEN THERE IS NOTHING CACHED TO FALL BACK ON.
 *
 * Added 1 Sep 2026 on the theory that `JWT issued at future` was a momentary blip. It is not:
 * both attempts failed with the identical error 150ms apart, twice, which is recorded in
 * ops_alerts.detail. The skew outlasts the retry, so retrying costs 150ms of page latency and
 * fixes nothing - except on a cold instance, which has no cached count and nothing else to try.
 */
const COUNT_RETRY_MS = 150;

export async function foundingOfferOrNull(): Promise<FoundingState | null> {
  if (Date.now() >= FOUNDING_CLOSES.getTime()) return null;

  try {
    const state = await foundingDisplay();
    lastGoodCount = { at: Date.now(), state };
    // A real, readable zero. Not an error, and not alert-worthy: it is the offer selling out,
    // which is the outcome it was designed for.
    return state.remaining > 0 ? state : null;
  } catch (err) {
    const firstFailure = err instanceof Error ? err.message : String(err);

    const cached =
      lastGoodCount && Date.now() - lastGoodCount.at < COUNT_CACHE_MS ? lastGoodCount.state : null;

    if (cached && cached.remaining > FOUNDING_STALE_MARGIN) {
      // NOT SILENT. A served-from-cache render and a live one must not look identical to whoever
      // reads the logs later, which is the same rule the alert below is written to.
      console.warn(
        `founding: count failed, serving the count from ${Math.round((Date.now() - lastGoodCount!.at) / 1000)}s ` +
          `ago (${cached.remaining} remaining, margin ${FOUNDING_STALE_MARGIN}). ${firstFailure}`,
      );
      return cached;
    }

    // Nothing usable to fall back on. Try once more before withholding - on a cold instance this
    // is the only attempt that can help, and it is the case the cache cannot cover.
    await new Promise((r) => setTimeout(r, COUNT_RETRY_MS));
    try {
      const state = await foundingDisplay();
      lastGoodCount = { at: Date.now(), state };
      return state.remaining > 0 ? state : null;
    } catch (err2) {
      const message = err2 instanceof Error ? err2.message : String(err2);
      // ALWAYS LOGGED, even when the email is throttled: the log line is the record that this
      // happened at all, and sendOpsAlert's own console line is the one being suppressed.
      console.error(`founding: count unavailable, offer withheld. ${message}`);

      const now = Date.now();
      if (now - lastFoundingAlert < ALERT_EVERY_MS) return null;
      lastFoundingAlert = now;

      const why = cached
        ? `A count from ${Math.round((now - lastGoodCount!.at) / 1000)}s ago was available but showed only ` +
          `${cached.remaining} places left, inside the margin of ${FOUNDING_STALE_MARGIN}, so it was not trusted.`
        : 'Nothing was cached on this instance, so there was nothing to fall back on.';

      // Never throws, never blocks the page. The pricing block is worth less than the page.
      await sendOpsAlert({
        subject: 'Founding count unavailable - the offer is being withheld from every visitor',
        lines: [
          'foundingOfferOrNull() could not read the founding count, so the founding block is not',
          'rendering and every visitor is being shown the standard US$249 rate.',
          '',
          'This is the fail-closed path working as designed. It is still wrong to leave: the page',
          'looks completely normal while the offer is switched off, which is why this alert exists.',
          '',
          `Reason, on the retry: ${message}`,
          `Reason, first attempt:  ${firstFailure}`,
          '',
          why,
          '',
          'A count that read cleanly in the last sixty seconds is normally served instead of',
          'withholding, so reaching this line means there was none, or it was too near the cap',
          'to trust. Supabase answered "JWT issued at future" on 30 Aug and 1 Sep 2026 - a clock',
          'skew inside their gateway, not a token of ours; neither of our keys is a JWT.',
        ],
      }).catch(() => {});
      return null;
    }
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
  /** Where this customer came from. Set on insert only: first touch does not change later. */
  scanId?: string | null;
  /** Cohort code from the session metadata. Insert only, like scanId. */
  discountCode?: string | null;
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
        // THE PLAN'S price, not whichever item Stripe listed first. A two item subscription
        // carries the location line too, and recording that here would say a US$249 subscriber
        // is paying US$30.
        stripe_price_id: planItem(sub)?.price.id ?? existing.stripe_price_id,
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
      stripe_price_id: planItem(sub)?.price.id ?? '',
      price_key: input.priceKey,
      scan_id: input.scanId ?? null,
      discount_code: input.discountCode ?? null,
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

/**
 * A founding subscription exists. Can the counter see it?
 *
 * THE NON-ZERO PATH, and it is the half a count cannot verify about itself. `foundingDisplay()`
 * returning zero is indistinguishable from a counter that is blind - a stale price_key inside
 * claim_founding_seat, a query pointed at the wrong Stripe mode, a constraint renamed without
 * the function that reads it. Every one of those answers "zero" with complete confidence, and
 * on 28 Aug 2026 one of them was real.
 *
 * So the first founding subscription to land is the test. If a row exists on a founding price
 * and the counter still says nobody holds one, the counter is wrong and the cap is not
 * capping - which means an unbounded number of permanent 40% discounts, quietly.
 *
 * NEVER THROWS. It is called after the subscription is already written; a check that took down
 * the webhook would turn a reporting fault into a lost customer.
 */
export async function verifyFoundingCountSaw(priceKey: string, subscriptionId: string): Promise<void> {
  if (!priceKey.startsWith('premium_founding_')) return;

  try {
    const state = await foundingDisplay();
    if (state.taken > 0) return;

    console.error(
      `founding: subscription ${subscriptionId} is on ${priceKey} but the counter reports 0 taken.`,
    );
    await sendOpsAlert({
      subject: 'The founding counter cannot see a founding subscription',
      lines: [
        `Subscription ${subscriptionId} was just written on ${priceKey}, and foundingDisplay()`,
        'still reports 0 places taken.',
        '',
        'THE CAP IS NOT CAPPING. A counter that cannot see a subscription that exists will not',
        'refuse the twenty-first either, and every visitor is being offered a permanent 40%',
        'discount that nobody is counting.',
        '',
        'The three ways this has happened or nearly happened:',
        '  - a price_key renamed without the query that reads it (0021)',
        '  - claim_founding_seat holding a stale string while every display guard passed',
        '  - a count reading one Stripe mode while the charge happens in the other',
        '',
        'Check `npm run stripe:mode` and the price_key values in subscriptions.',
      ],
    }).catch(() => {});
  } catch (err) {
    // The count itself failing here is already alerted by foundingOfferOrNull on the next page
    // render. Log and move on rather than double-alerting from the webhook.
    console.error(
      `founding: could not verify the counter after ${subscriptionId}: ${err instanceof Error ? err.message : err}`,
    );
  }
}
