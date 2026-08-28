import 'server-only';
import type Stripe from 'stripe';
import { db } from './db';
import { env } from './env';
import { assertOneInterval, assertPrice, PRICE_KEYS, priceIdFor, stripe, type PriceKey } from './stripe';
import { attachSessionToClaim, claimFoundingSeat, releaseClaim, CLAIM_MINUTES } from './founding';
import { DiscountError, validateDiscount, type ValidDiscount } from './discount';
import { recordFunnel } from './funnel';
import { FOUNDING_TIER, TIER_BASE_PRICE, type PlanTier } from './scope';
import type { AccountRow, ScopeRow } from './accounts';

/**
 * Stripe Checkout, hosted. The spec is explicit: do not build a card form.
 */

/**
 * One Stripe customer per account, id kept on accounts.stripe_customer_id.
 *
 * Reused rather than recreated, because a second customer for the same person
 * splits their billing history in two and hands them a Customer Portal that
 * cannot see the subscription they are trying to cancel.
 */
export async function customerFor(account: AccountRow): Promise<string> {
  if (account.stripe_customer_id) return account.stripe_customer_id;

  const customer = await stripe().customers.create({
    email: account.email,
    metadata: { account_id: account.id },
  });

  const { error } = await db()
    .from('accounts')
    .update({ stripe_customer_id: customer.id })
    .eq('id', account.id);
  if (error) throw new Error(`Could not save the customer: ${error.message}`);

  return customer.id;
}

/**
 * The session that takes the card, created only after the questions are approved
 * and written.
 *
 * expires_at is set to Stripe's 30 minute minimum. Nothing is being held open by
 * it here, since the founding count is of confirmed subscriptions only, but an
 * abandoned session that lingers for a day is a stale price sitting in somebody's
 * open tab, and the price they see should be the price they get.
 */
export async function createCheckout(input: {
  account: AccountRow;
  scope: ScopeRow;
  /** The scan this subscriber came from, if they came from one. Attribution's join key. */
  scanId?: string | null;
  /**
   * A cohort code, already validated by the wizard and re-validated here.
   *
   * Re-validated rather than trusted, because the wizard's validation happened on a screen
   * the customer could have left open while the code expired or filled up, and because the
   * value arrives from a browser. The price the session charges is decided by THIS read.
   */
  discountCode?: string | null;
  /**
   * Which plan they chose. Defaults to premium, which is what this checkout sold exclusively
   * until 29 Aug 2026 - so an absent or malformed value can only ever resolve to the plan that
   * was already being charged, never quietly downgrade a purchase.
   */
  tier?: PlanTier;
  /** The requesting browser, recorded on the funnel row. Never used to decide anything. */
  userAgent?: string | null;
}): Promise<{ url: string; priceKey: PriceKey; discount: ValidDiscount | null }> {
  // THE SEAT IS CLAIMED HERE, AND THIS IS THE READ THAT DECIDES THE PRICE.
  //
  // It used to count confirmed subscriptions, which are written by the webhook after payment,
  // so two people checking out for the last place both read nineteen taken and both got it.
  // The claim is atomic and holds the place for as long as the session can be paid.
  //
  // priceKey comes out of the claim and goes straight into assertPrice() and the line item
  // below. There is no second read between deciding and charging, which is what makes the
  // price on Stripe's page the price this function decided.
  //
  // A DISCOUNTED CHECKOUT NEVER CLAIMS A SEAT, and it does not claim one and give it back.
  // claimFoundingSeat is not called at all, so there is no window in which one of twenty
  // places is held by somebody who was never going to take it. The discount sits on the
  // standard price, so the subscription is written price_key 'premium_monthly' and
  // foundingDisplay() cannot see it: the public counter stays a count of people who paid
  // 149 rather than a count of giveaways.
  const tier: PlanTier = input.tier ?? 'premium';

  // THE CODE BOX IS A PREMIUM OFFER TOO. The only discount in circulation is the local cohort
  // coupon, whose whole shape - US$180 off, three months, then US$249 - is written against the
  // premium price. Applied to Monitoring at US$69 it would floor the invoice at zero and then
  // "revert" to a price the customer was never quoted. Refused with a sentence they can act on
  // rather than silently ignored, because a code that vanishes reads as a bug.
  if (tier !== 'premium' && input.discountCode) {
    throw new DiscountError(
      'That code applies to Monitoring + Review. Choose that plan to use it, or continue on ' +
        'Monitoring at the standard price.',
    );
  }

  const discount = input.discountCode ? await validateDiscount(input.discountCode) : null;

  // FOUNDING IS PREMIUM ONLY, and Monitoring must not consume one of the twenty: the place is
  // capped by Tim's calendar and what it buys is the quarterly hour, which is premium's.
  // A Monitoring checkout therefore never calls claimFoundingSeat at all - there is no window
  // in which a place is held by somebody who was never eligible for it.
  const { claimId, priceKey } = discount
    ? { claimId: null as string | null, priceKey: 'premium_monthly' as PriceKey }
    : tier === FOUNDING_TIER
      ? await claimFoundingSeat(input.account.id)
      : { claimId: null as string | null, priceKey: TIER_BASE_PRICE[tier] as PriceKey };
  await assertPrice(priceKey);

  const customer = await customerFor(input.account);
  const metadata = {
    account_id: input.account.id,
    scope_id: input.scope.id,
    price_key: priceKey,
    ...(claimId ? { founding_claim_id: claimId } : {}),
    // Carried through Stripe rather than held in a cookie, because the cookie died the moment
    // they scanned on a phone and paid on a laptop. The webhook writes it onto the
    // subscription, so the ad that produced a customer is still knowable months later.
    ...(input.scanId ? { scan_id: input.scanId } : {}),
    // On the subscription too, so month four - when the coupon runs out and the invoice
    // steps to 249 - can be traced back to a cohort rather than looking like a price rise
    // nobody can explain.
    ...(discount ? { discount_code: discount.code } : {}),
  };

  let session: Stripe.Checkout.Session;
  const lineKeys: PriceKey[] = [priceKey];
  assertOneInterval(lineKeys);

  try {
    session = await stripe().checkout.sessions.create({
      mode: 'subscription',
      customer,
      client_reference_id: input.scope.id,
      // ONE ARRAY, ASSERTED BEFORE IT IS PRICED. There is a single key in it today; the shape
      // is plural so that an add-on line cannot be added later without passing the interval
      // rule on its way to the charge. See assertOneInterval.
      line_items: await Promise.all(
        lineKeys.map(async (k) => ({ price: await priceIdFor(k), quantity: 1 })),
      ),
      // The PROMOTION CODE, never the coupon. Stripe takes either, and passing the coupon
      // applies the coupon's own limits and ignores max_redemptions and redeem_by on the
      // promotion code entirely - which is where the cap lives. A leaked code with its cap
      // bypassed is a hundred USD 49 subscriptions.
      ...(discount ? { discounts: [{ promotion_code: discount.promotionCodeId }] } : {}),
      metadata,
      // The same metadata on the subscription, because customer.subscription.*
      // events do not carry the session and would otherwise arrive with no way to
      // tell which account or scope they belong to.
      subscription_data: { metadata },
      // Set deliberately, not by accident. Not GST registered, so no Australian
      // GST is charged. The EU and UK VAT question is open and is flagged for the
      // accountant in the build plan; turning this on later is a decision, not a
      // default.
      automatic_tax: { enabled: false },
      // Managed Payments is Stripe's merchant of record product, and it is ON by
      // default on new accounts. It handles tax for you, which is why it refuses a
      // session with automatic_tax off: the two cannot both be true.
      //
      // Turned off here so the tax position stays the one that was decided rather
      // than the one that was defaulted. Tim is the merchant of record, no
      // Australian GST is charged, and nothing about the EU/UK VAT question is
      // silently answered by a Stripe default.
      //
      // Worth a real decision with the accountant, because Managed Payments is a
      // plausible answer to the VAT question the spec parks: it would make Stripe
      // the merchant of record and put EU and UK VAT on them. It also changes the
      // fees and whose name is on the invoice, so it is a commercial choice, not a
      // configuration one.
      managed_payments: { enabled: false },
      billing_address_collection: 'auto',
      // No trial. The free scan is the trial.
      //
      // Stated only when there is no discount, and that is Stripe's rule rather than a
      // preference: `allow_promotion_codes` and `discounts` are mutually exclusive and the
      // API refuses a session carrying both, even with the flag set to FALSE. Omitting it
      // defaults to the same thing. The explicit false is kept everywhere else because it is
      // the line that says a customer cannot type a code into Stripe's page and be charged a
      // number our page never showed them.
      ...(discount ? {} : { allow_promotion_codes: false as const }),
      expires_at: Math.floor(Date.now() / 1000) + CLAIM_MINUTES * 60,
      success_url: `${env.siteUrl}/start/confirmed?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.siteUrl}/start?step=pay&resumed=1`,
    });
  } catch (err) {
    // A place held for a session that does not exist is a place nobody can buy. It would free
    // itself in half an hour; giving it back now is better.
    if (claimId) await releaseClaim(claimId, 'released');
    throw err;
  }

  if (!session.url) {
    if (claimId) await releaseClaim(claimId, 'released');
    throw new Error('Stripe did not return a checkout URL.');
  }

  // Now the claim can be tied to the thing that will convert or expire it.
  if (claimId) await attachSessionToClaim(claimId, session.id);

  await recordFunnel({
    event: 'checkout_started',
    scanId: input.scanId ?? null,
    accountId: input.account.id,
    userAgent: input.userAgent ?? null,
  });

  return { url: session.url, priceKey, discount };
}

/**
 * Card updates and cancellation, self serve, so billing never lands on Tim.
 *
 * The configuration created by scripts/stripe-setup.mjs cancels at period end
 * and has plan switching off. Cancellation has to be no harder than signup: that
 * is both the Unfair Trading Practices Bill position from July 2027 and the only
 * defensible way to sell a subscription.
 */
export async function portalSession(customerId: string, returnUrl: string): Promise<string> {
  const session = await stripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
    ...(env.stripePortalConfigurationId
      ? { configuration: env.stripePortalConfigurationId }
      : {}),
  });
  return session.url;
}

/**
 * The price key a subscription is on, read from its own metadata first.
 *
 * NOW READS THE LOOKUP KEY, which is what the price itself carries. The old version compared
 * the price id against one env var and returned 'premium_monthly' for everything else, which
 * silently mislabelled the six prices that did not exist yet. Since the lookup key IS the
 * application's name for a price, a subscription on any of the eight identifies itself.
 */
export async function priceKeyOf(
  sub: Stripe.Subscription,
  fallbackPriceId?: string,
): Promise<PriceKey> {
  const fromMetadata = sub.metadata?.price_key;
  if (fromMetadata && (PRICE_KEYS as readonly string[]).includes(fromMetadata)) {
    return fromMetadata as PriceKey;
  }

  // Metadata missing means the subscription was made outside the wizard, in the Stripe
  // dashboard. Read the price's own lookup key rather than guessing: guessing premium would
  // overcharge a founding subscriber, guessing founding would give away a capped seat.
  const item = sub.items.data[0]?.price;
  const lookup = item?.lookup_key;
  if (lookup && (PRICE_KEYS as readonly string[]).includes(lookup)) return lookup as PriceKey;

  const priceId = item?.id ?? fallbackPriceId;
  if (priceId) {
    const price = await stripe().prices.retrieve(priceId);
    if (price.lookup_key && (PRICE_KEYS as readonly string[]).includes(price.lookup_key)) {
      return price.lookup_key as PriceKey;
    }
  }

  // Nothing identified it. Premium monthly is the safe guess: it is the standard rate, so an
  // unrecognised subscription is never recorded as holding a capped founding place.
  console.error(`priceKeyOf: could not identify the price on ${sub.id}; recording premium_monthly.`);
  return 'premium_monthly';
}
