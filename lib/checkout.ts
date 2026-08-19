import 'server-only';
import type Stripe from 'stripe';
import { db } from './db';
import { env } from './env';
import { assertPrice, priceIdFor, stripe, type PriceKey } from './stripe';
import { foundingState } from './billing';
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
}): Promise<{ url: string; priceKey: PriceKey }> {
  const { priceKey } = await foundingState();
  await assertPrice(priceKey);

  const customer = await customerFor(input.account);
  const metadata = {
    account_id: input.account.id,
    scope_id: input.scope.id,
    price_key: priceKey,
  };

  const session = await stripe().checkout.sessions.create({
    mode: 'subscription',
    customer,
    client_reference_id: input.scope.id,
    line_items: [{ price: priceIdFor(priceKey), quantity: 1 }],
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
    allow_promotion_codes: false,
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    success_url: `${env.siteUrl}/start/confirmed?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.siteUrl}/start?step=pay&resumed=1`,
  });

  if (!session.url) throw new Error('Stripe did not return a checkout URL.');
  return { url: session.url, priceKey };
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

/** The price key a subscription is on, read from its own metadata first. */
export function priceKeyOf(sub: Stripe.Subscription, fallbackPriceId?: string): PriceKey {
  const fromMetadata = sub.metadata?.price_key;
  if (fromMetadata === 'founding_monthly' || fromMetadata === 'standard_monthly') {
    return fromMetadata;
  }
  // Metadata missing means the subscription was made outside the wizard, in the
  // Stripe dashboard. Fall back to matching the price id rather than guessing:
  // guessing standard would overcharge, guessing founding would give away a seat.
  const priceId = sub.items.data[0]?.price.id ?? fallbackPriceId;
  if (priceId === priceIdFor('founding_monthly')) return 'founding_monthly';
  return 'standard_monthly';
}
