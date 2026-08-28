/**
 * The USD 69 local cohort code, validated here and applied by the server.
 *
 * WHY NOT allow_promotion_codes. A code entered inside Stripe's own Checkout page means the
 * pricing block said 249 and Stripe charges 69, and the customer sees one number and is
 * charged another. checkout:check exists to make that unrepresentable. So the code goes in
 * the wizard, the page re-renders with the real number, and the session is created carrying
 * the discount that number was calculated from.
 *
 * THE PROMOTION CODE IS APPLIED, NOT THE COUPON, AND THAT IS THE WHOLE CAP.
 * DISCOUNT-CODES-BRIEF.md is right that max_redemptions and redeem_by belong on the
 * promotion code rather than the coupon, and then leaves out the consequence: Stripe accepts
 * either object in `discounts`, and passing the COUPON applies the coupon's own limits and
 * ignores the promotion code entirely. The cap the brief calls the only thing standing
 * between us and a hundred USD 69 subscriptions would not have been in the request. Every
 * code in this build is applied as `{ promotion_code }`.
 *
 * THE DISCOUNT SITS ON THE STANDARD PRICE, NOT THE FOUNDING ONE. The brief does not say
 * which, and it decides two things. On standard, the subscription is written with
 * price_key 'standard_monthly', so foundingDisplay() - which counts distinct accounts on
 * 'founding_monthly' - cannot see it, and the public counter stays a count of people who
 * paid 149 rather than a count of giveaways. And month four steps to 249, which is what the
 * brief asks for. The consequence to accept is that a code holder never becomes founding.
 *
 * A DISCOUNTED CHECKOUT NEVER CLAIMS A SEAT. Not filtered out afterwards: claimFoundingSeat
 * is not called at all, so there is no window in which a place is held by somebody who was
 * never going to consume it.
 */

import 'server-only';
import type Stripe from 'stripe';
import { stripe } from './stripe';
import { PRICE_USD } from './scope';

/**
 * USD 249 less USD 180. The cents are what Stripe carries; the dollars are what prints.
 *
 * Moved from 200 off (USD 49) to 180 off (USD 69) on 25 Aug 2026, before any code was minted
 * in live mode. The amount on a Stripe coupon cannot be edited, so this is a NEW coupon id
 * rather than a change to the old one - see scripts/discount-setup.mjs. Any code minted
 * against the old one is refused by the amount check below rather than honoured quietly at
 * the old price, which is the behaviour to want: a stale code fails loudly on our side and
 * the customer is told to email us.
 */
export const DISCOUNT_OFF_CENTS = 18_000;
export const DISCOUNT_MONTHS = 3;

/** What the page prints for a valid code. Derived, so it cannot drift from the coupon. */
export const COHORT_PRICE_USD = PRICE_USD.standard_monthly - DISCOUNT_OFF_CENTS / 100;

/** The coupon every cohort code must point at. Created by scripts/discount-setup.mjs. */
/**
 * Shown to the customer on Checkout and on every invoice, so it follows the US$ rule.
 *
 * SAFE TO CHANGE, unlike the amount. COUPON_ID is stable (`local_cohort_69_3mo`) and a coupon's
 * `name` is editable in Stripe where `amount_off` is not, so this does not mint a second
 * coupon. But `discount-setup.mjs` only sets the name at CREATION - an existing coupon keeps
 * the old name until somebody updates it, in test and in live.
 */
export const COUPON_NAME = 'Local cohort - US$69 for three months';

/**
 * 0016 says USD 49 in its comments and names LOCAL49 as the example code. It is left alone
 * deliberately: it has been applied, and an applied migration is a record of what ran rather
 * than a document to keep current. This file is where the price lives.
 */

export interface ValidDiscount {
  /** Stripe promotion code id, `promo_...`. This is what goes in the session. */
  promotionCodeId: string;
  /** The code as Stripe holds it, uppercase. Echoed back so the wizard shows the real one. */
  code: string;
  /** Cents charged on each of the first three invoices. */
  netCents: number;
  months: number;
  /** Redemptions left, when the code is capped. Null when it is not. */
  remaining: number | null;
}

export class DiscountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiscountError';
  }
}

/**
 * Refuse anything that is not exactly the discount this build thinks it is applying.
 *
 * Same discipline as assertPrice() and assertSonar(): a code is an opaque string somebody
 * typed, and a coupon that has been edited in the dashboard to 90% off, or to forever, is
 * invisible until an invoice goes out. Checked at the moment of use rather than at boot,
 * because a coupon is configuration and configuration is what changes in between.
 *
 * Every refusal returns a sentence a customer can act on. A code that fails silently to the
 * full price is the same failure as one that fails silently to a discount.
 */
export async function validateDiscount(raw: string): Promise<ValidDiscount> {
  const code = raw.trim().toUpperCase().slice(0, 60);
  if (!code) throw new DiscountError('Enter a code, or continue without one.');

  let found: Stripe.PromotionCode | undefined;
  try {
    // Looked up by code rather than by id. `active: true` is Stripe's own filter and it
    // already accounts for expiry and an exhausted cap, but each is checked again below so
    // the message tells the customer which one it was.
    //
    // The coupon is EXPANDED, and it has to be asked for. In API version 2026-07-29.dahlia
    // a promotion code no longer carries `coupon` at the top level: it carries
    // `promotion: { type, coupon }`, and the coupon inside it is an id string unless
    // expanded. Reading the old shape returns undefined, and every assertion below would
    // then be comparing against undefined and refusing every code - or, written the other
    // way round, waving every code through. Found by running it.
    const list = await stripe().promotionCodes.list({
      code,
      active: true,
      limit: 1,
      expand: ['data.promotion.coupon'],
    });
    found = list.data[0];
  } catch (err) {
    throw new DiscountError(
      `We could not check that code just now. Try again, or continue at the standard price. (${(err as Error).message})`,
    );
  }

  if (!found) throw new DiscountError(`We do not recognise the code ${code}.`);

  const promo = found;
  const coupon = promo.promotion?.coupon;
  if (!coupon || typeof coupon === 'string') {
    // Either the promotion is not a coupon at all, or the expand did not come back. Both are
    // our problem rather than the customer's, and neither is a reason to charge them a price
    // nobody verified.
    console.error(`Promotion code ${code} (${promo.id}) has no expanded coupon behind it.`);
    throw new DiscountError(
      `We could not read the discount behind ${code}. Continue at the standard price and email hello@wordofmodel.ai.`,
    );
  }

  if (promo.expires_at && promo.expires_at * 1000 < Date.now()) {
    throw new DiscountError(`The code ${code} has expired.`);
  }
  if (promo.max_redemptions !== null && promo.times_redeemed >= promo.max_redemptions) {
    throw new DiscountError(`The code ${code} has been used as many times as it allows.`);
  }
  if (promo.restrictions?.first_time_transaction || promo.restrictions?.minimum_amount) {
    throw new DiscountError(
      `The code ${code} carries conditions this checkout does not apply. Continue at the standard price and email hello@wordofmodel.ai.`,
    );
  }

  const problems: string[] = [];
  if (!coupon.valid) problems.push('the coupon behind it is no longer valid');
  if (coupon.currency && coupon.currency !== 'usd') problems.push(`it is in ${coupon.currency}, not usd`);
  if (coupon.percent_off !== null) problems.push('it is a percentage rather than a fixed amount');
  if (coupon.amount_off !== DISCOUNT_OFF_CENTS) {
    problems.push(`it takes off ${coupon.amount_off}, not ${DISCOUNT_OFF_CENTS}`);
  }
  if (coupon.duration !== 'repeating') problems.push(`it runs ${coupon.duration}, not for a fixed number of months`);
  if (coupon.duration_in_months !== DISCOUNT_MONTHS) {
    problems.push(`it runs ${coupon.duration_in_months} months, not ${DISCOUNT_MONTHS}`);
  }

  if (problems.length) {
    // Deliberately not shown to the customer. This is our configuration being wrong, not
    // their code, and the recovery is ours to make.
    console.error(`Refusing promotion code ${code} (${promo.id}): ${problems.join(', ')}.`);
    throw new DiscountError(
      `The code ${code} is not set up correctly on our side. Continue at the standard price and email hello@wordofmodel.ai.`,
    );
  }

  const netCents = PRICE_USD.standard_monthly * 100 - DISCOUNT_OFF_CENTS;
  return {
    promotionCodeId: promo.id,
    code,
    netCents,
    months: DISCOUNT_MONTHS,
    remaining:
      promo.max_redemptions === null ? null : Math.max(0, promo.max_redemptions - promo.times_redeemed),
  };
}

/** The line under the price on the wizard's pay step. Copy, so it lives with the numbers. */
export function discountLine(d: ValidDiscount): string {
  const net = (d.netCents / 100).toFixed(0);
  return (
    `Code ${d.code} applied: US$${net} a month for ${d.months} months, then ` +
    `US$${PRICE_USD.standard_monthly}. Cancel any time.`
  );
}
