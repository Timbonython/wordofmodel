/**
 * The facts the privacy policy and the terms both state, in one place.
 *
 * Here rather than typed into two pages because an entity name that disagrees with itself
 * across two legal documents is the kind of detail that undermines both.
 *
 * ABN IS A PLACEHOLDER AND MUST BE FILLED BEFORE WIZARD_LIVE. A subscription contract that
 * does not name the entity behind it is not much of a contract, and the number is printed
 * on both pages. Same for the trading address if one is ever added: it must not be Frame's,
 * because Word of Model is deliberately outside Frame.
 */

export const ENTITY = 'Timothy Pearce, trading as Word of Model';

/** TODO before go-live: the real ABN. */
export const ABN = 'ABN pending';

export const CONTACT_EMAIL = 'hello@wordofmodel.ai';

/** Bump when either page changes in a way a subscriber would want to know about. */
export const LAST_UPDATED = '22 August 2026';

/** The governing law for the terms. Adelaide, South Australia. */
export const JURISDICTION = 'South Australia, Australia';

/** Monthly price in US dollars, and the founding rate. Kept in step with lib/stripe.ts. */
export const STANDARD_PRICE_USD = 249;
export const FOUNDING_PRICE_USD = 149;
