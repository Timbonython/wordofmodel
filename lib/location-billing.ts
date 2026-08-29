/**
 * Adding and removing a town on a subscription that is already running.
 *
 * WHY THIS IS NOT A SECOND PASS THROUGH THE WIZARD. `assertScopeEditable` refuses any scope
 * that has runs, and that guard is right and stays: rewriting an approved question after
 * evidence exists against it destroys comparability, which is the product. A location touches
 * neither the questions nor the competitors. It is a different operation and it gets its own
 * path rather than a hole cut in that one.
 *
 * THE APPROVAL MECHANIC IS PRESERVED. A subscriber approved five questions about one town.
 * `previewLocation()` renders those same five as they will actually be asked about the new
 * town, and the page shows them before anything is charged. That is the honest analogue of the
 * original approval, and it is also the only way the subscriber can catch a substitution that
 * reads badly.
 *
 * THE ORDER OF THE TWO WRITES IS A DECISION ABOUT WHO LOSES.
 *
 *   row first, then Stripe   a Stripe failure leaves a town we run and do not charge for
 *   Stripe first, then row   a database failure leaves a town they pay for and never receive
 *
 * The row goes first. A run is about US$3.69; the other direction takes US$30 a month for
 * nothing and the subscriber finds out by reading a report that never mentions their town.
 * Erring toward our own cost is the same choice the founding counter makes when it cannot read
 * its own count, and for the same reason.
 */

import 'server-only';
import type Stripe from 'stripe';
import { db } from './db';
import { stripe, priceIdFor, locationItem, planItem, PRICES, type PriceKey } from './stripe';
import { locationsForScope } from './locations';
import { localiseQuestion } from './location-text';
import { placeLabel } from './geo';
import { resolveLocality } from './serp/locations';
import { sendOpsAlert } from './billing-mail';
import { startRun } from './run';
import { MAX_EXTRA_LOCATIONS } from './scope';
import type { SubscriptionRow } from './billing';

export class LocationError extends Error {}

interface ScopeForLocation {
  id: string;
  market_country: string;
  locality: string | null;
  locality_canonical: string | null;
  locality_city: string | null;
  locality_region: string | null;
}

async function scopeFor(scopeId: string): Promise<ScopeForLocation> {
  const { data, error } = await db()
    .from('scopes')
    .select('id, market_country, locality, locality_canonical, locality_city, locality_region')
    .eq('id', scopeId)
    .single();
  if (error || !data) throw new LocationError(`Could not read your subscription's market.`);
  return data as ScopeForLocation;
}

function scopeLocality(scope: ScopeForLocation) {
  return scope.locality
    ? {
        input: scope.locality,
        canonical: scope.locality_canonical,
        city: scope.locality_city,
        region: scope.locality_region,
      }
    : null;
}

export interface LocationPreview {
  town: string;
  questions: { slot: string; text: string }[];
  perMonthUsd: number;
}

/**
 * What the new town will actually be asked, and what it costs. Nothing is written.
 *
 * THIS IS ALSO THE VALIDATION, and it runs before any money moves. Every refusal the real
 * operation can hit is hit here first: no locality to substitute against, a question that does
 * not name the place, a duplicate, the cap. A subscriber who gets a preview can be charged; one
 * who cannot get a preview was never going to receive a report.
 */
export async function previewLocation(scopeId: string, town: string): Promise<LocationPreview> {
  const name = town.trim().replace(/\s+/g, ' ').slice(0, 120);
  if (!name) throw new LocationError('Type the name of the town.');

  const scope = await scopeFor(scopeId);
  const from = scopeLocality(scope);
  if (!from) {
    throw new LocationError(
      'Your questions are written for a whole country rather than a town, so there is no place ' +
        'in them to swap. Reply to your last report and we will sort it out by hand.',
    );
  }
  if (name.toLowerCase() === from.input.trim().toLowerCase()) {
    throw new LocationError(`${from.input} is already your main location.`);
  }

  const existing = await locationsForScope(scopeId);
  if (existing.some((l) => l.locality.toLowerCase() === name.toLowerCase())) {
    throw new LocationError(`${name} is already on your subscription.`);
  }
  if (existing.length >= MAX_EXTRA_LOCATIONS) {
    throw new LocationError(
      `That would be more than ${MAX_EXTRA_LOCATIONS} extra locations. Reply to your last report ` +
        'and we will set it up.',
    );
  }

  const { data: qRows, error } = await db()
    .from('questions')
    .select('slot, text')
    .eq('scope_id', scopeId)
    .not('approved_at', 'is', null);
  if (error) throw new LocationError('Could not read your approved questions.');
  const questions = (qRows ?? []) as { slot: string; text: string }[];
  if (questions.length !== 5) {
    throw new LocationError('Your five questions are not all approved yet.');
  }

  // The substitution is attempted on all five HERE, so a question that cannot be localised is
  // refused before the subscriber is charged rather than by a run that fails four hours later.
  const localised = questions.map((q) => ({
    slot: q.slot,
    text: localiseQuestion({
      text: q.text,
      slot: q.slot,
      fromPlace: placeLabel(scope.market_country, from),
      toPlace: placeLabel(scope.market_country, { input: name, canonical: null, city: null, region: null }),
      fromLocality: from.input,
      toLocality: name,
    }),
  }));

  return { town: name, questions: localised, perMonthUsd: PRICES.location_monthly.amount / 100 };
}

/** The location price matching the plan's own billing period. Never passed in. */
function locationKeyFor(sub: Stripe.Subscription): PriceKey {
  return planItem(sub)?.price.recurring?.interval === 'year' ? 'location_annual' : 'location_monthly';
}

/**
 * Move the location quantity on Stripe to `count`, adding or removing the line as needed.
 *
 * PRORATED ONTO THE NEXT INVOICE rather than charged immediately. `always_invoice` would take
 * the money now, and an immediate invoice can be declined - which would leave a town already
 * running against a subscription tipping into past_due over US$30. Deferring puts it on the
 * normal cycle where Smart Retries already handle a bad card. Set deliberately, like
 * automatic_tax, so the billing behaviour is the one that was decided rather than a default.
 */
async function setStripeQuantity(sub: Stripe.Subscription, count: number): Promise<void> {
  const existing = locationItem(sub);

  if (count === 0) {
    if (!existing) return;
    await stripe().subscriptionItems.del(existing.id, { proration_behavior: 'create_prorations' });
    return;
  }

  if (existing) {
    await stripe().subscriptionItems.update(existing.id, {
      quantity: count,
      proration_behavior: 'create_prorations',
    });
    return;
  }

  await stripe().subscriptionItems.create({
    subscription: sub.id,
    price: await priceIdFor(locationKeyFor(sub)),
    quantity: count,
    proration_behavior: 'create_prorations',
  });
}

/**
 * Add a town to a live subscription: write it, charge for it, start measuring it.
 *
 * The baseline run is opened here rather than left to the daily scheduler, so the new town's
 * first report arrives in about twenty minutes - exactly what a new subscriber gets, and what
 * they are paying from today. `scopesAwaitingFirstRun` is still the net under it.
 */
export async function addLocation(
  subscription: SubscriptionRow,
  town: string,
): Promise<{ locationId: string; runId: string | null; count: number }> {
  const preview = await previewLocation(subscription.scope_id, town);
  const scope = await scopeFor(subscription.scope_id);

  const resolved = await resolveLocality(preview.town, scope.market_country);

  const { data: inserted, error: insertErr } = await db()
    .from('scope_locations')
    .insert({
      scope_id: subscription.scope_id,
      locality: preview.town,
      locality_canonical: resolved?.canonical ?? null,
      locality_city: resolved?.city ?? null,
      locality_region: resolved?.region ?? null,
    })
    .select('id')
    .single();
  if (insertErr || !inserted) {
    // The unique constraint is the race: two tabs, same town. Reported as the ordinary thing it
    // is rather than as a failure, and nothing was charged.
    if (/duplicate|unique/i.test(insertErr?.message ?? '')) {
      throw new LocationError(`${preview.town} is already on your subscription.`);
    }
    throw new LocationError('Could not add that location. Nothing has been charged.');
  }
  const locationId = (inserted as { id: string }).id;

  const count = (await locationsForScope(subscription.scope_id)).length;

  try {
    const sub = await stripe().subscriptions.retrieve(subscription.stripe_subscription_id);
    await setStripeQuantity(sub, count);
  } catch (err) {
    // ROLLED BACK, because the row is what makes us run and charge for the town. Leaving it
    // would measure a town nobody is paying for; the alert exists for the case where even the
    // rollback fails, which is the only version of this that can go unnoticed.
    const { error: undoErr } = await db().from('scope_locations').delete().eq('id', locationId);
    if (undoErr) {
      await sendOpsAlert({
        subject: `Location added but not billed: ${preview.town}`,
        lines: [
          `scope ${subscription.scope_id} has a scope_locations row that Stripe never took.`,
          `The row could not be removed either: ${undoErr.message}`,
          'This town will be RUN and NOT CHARGED until the row is deleted by hand.',
          `Stripe subscription: ${subscription.stripe_subscription_id}`,
        ],
      });
    }
    throw new LocationError(
      'We could not update your billing, so the location has not been added and you have not ' +
        'been charged. Try again in a minute.',
    );
  }

  // Failing to open the run must not undo a location that is written and paid for. The daily
  // scheduler asks per town and will open it within a day; the subscriber loses speed, not the
  // town.
  let runId: string | null = null;
  try {
    const { run } = await startRun({
      scopeId: subscription.scope_id,
      period: 'monthly',
      periodStart: new Date().toISOString().slice(0, 10),
      triggerSource: 'baseline',
      locationId,
    });
    runId = run.id;
  } catch (err) {
    console.error(`addLocation: could not open the first run for ${locationId}`, err);
  }

  return { locationId, runId, count };
}

/**
 * Remove a town.
 *
 * BUILT AT THE SAME TIME AS ADDING, on purpose. A subscriber who can add a US$30 line and not
 * remove it has to email somebody to stop paying, and a page that can only increase what you
 * are charged is not a self service page.
 *
 * Stripe first here, and that is not an inconsistency with addLocation - it is the same rule.
 * Both orders err toward our cost: stopping the charge before stopping the measurement means a
 * failure between them leaves a town measured and not billed, never billed and not measured.
 *
 * The runs and the evidence stay. `runs.location_id` is `on delete cascade`, so deleting the
 * row would take the town's whole history with it, and a subscriber who re-adds Ballarat in
 * March should see January.
 */
export async function removeLocation(
  subscription: SubscriptionRow,
  locationId: string,
): Promise<{ count: number }> {
  const before = await locationsForScope(subscription.scope_id);
  const target = before.find((l) => l.id === locationId);
  if (!target) throw new LocationError('That location is not on your subscription.');

  const sub = await stripe().subscriptions.retrieve(subscription.stripe_subscription_id);
  try {
    await setStripeQuantity(sub, before.length - 1);
  } catch {
    throw new LocationError('We could not update your billing, so nothing has changed. Try again in a minute.');
  }

  const { error } = await db().from('scope_locations').delete().eq('id', locationId);
  if (error) {
    await sendOpsAlert({
      subject: `Location billed down but not removed: ${target.locality}`,
      lines: [
        `scope ${subscription.scope_id}: Stripe quantity is now ${before.length - 1} but the`,
        `scope_locations row ${locationId} could not be deleted: ${error.message}`,
        'This town will be RUN and NOT CHARGED until the row is deleted by hand.',
      ],
    });
    throw new LocationError('Your billing was updated but the location did not come off. We have been told.');
  }

  return { count: before.length - 1 };
}

/**
 * Do the rows we run and the quantity we charge agree?
 *
 * THE MISMATCH IS SILENT IN BOTH DIRECTIONS, which is why it needs asking out loud on a
 * schedule rather than trusted to the two writes above. Too few rows and the subscriber pays
 * for a town that is never measured - the exact defect this whole feature was built to remove.
 * Too many and we measure a town nobody pays for. Neither errors, neither appears in a log, and
 * neither is visible on any page.
 */
export interface LocationBillingAudit {
  /**
   * How many live subscriptions were actually compared.
   *
   * RETURNED SO THAT ZERO CANNOT READ AS HEALTHY. A reconciliation over no subscriptions
   * reports no mismatches, which is indistinguishable from a reconciliation over fifty that
   * found none - and the first proves nothing at all. This build has already been bitten by a
   * confident, wrong zero once, in `claim_founding_seat`, and by a founding count that would
   * have read clean while pointed at the wrong Stripe ledger.
   */
  examined: number;
  /** Subscriptions Stripe would not answer for. Not mismatches; unknowns, and reported as such. */
  unreadable: string[];
  mismatches: { scopeId: string; subscriptionId: string; rows: number; billed: number }[];
}

export async function locationBillingMismatches(): Promise<LocationBillingAudit> {
  const { data, error } = await db()
    .from('subscriptions')
    .select('scope_id, stripe_subscription_id, status')
    .in('status', ['active', 'trialing', 'past_due']);
  if (error) throw new Error(`Could not list live subscriptions: ${error.message}`);

  const mismatches: LocationBillingAudit['mismatches'] = [];
  const unreadable: string[] = [];
  let examined = 0;
  for (const row of (data ?? []) as { scope_id: string; stripe_subscription_id: string }[]) {
    const rows = (await locationsForScope(row.scope_id)).length;
    let billed = 0;
    try {
      const sub = await stripe().subscriptions.retrieve(row.stripe_subscription_id);
      billed = locationItem(sub)?.quantity ?? 0;
    } catch (err) {
      // NOT COUNTED AS EXAMINED. A subscription Stripe would not answer for has not been
      // checked, and folding it into the clean count is how an outage becomes an all-clear.
      console.error(`locationBillingMismatches: could not read ${row.stripe_subscription_id}`, err);
      unreadable.push(row.stripe_subscription_id);
      continue;
    }
    examined++;
    if (rows !== billed) {
      mismatches.push({ scopeId: row.scope_id, subscriptionId: row.stripe_subscription_id, rows, billed });
    }
  }
  return { examined, unreadable, mismatches };
}
