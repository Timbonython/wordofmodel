/**
 * The facts the privacy policy and the terms both state, in one place.
 *
 * Here rather than typed into two pages because an entity name that disagrees with itself
 * across two legal documents is the kind of detail that undermines both.
 *
 * NO STREET ADDRESS IS PUBLISHED, DELIBERATELY. Nothing in Australian law requires one on a
 * website, ABN Lookup discloses only the state and postcode, and the only address available
 * today is a home address. When cold email starts, US anti-spam law does require a physical
 * postal address in the message itself: that goes in the email footer rather than on the
 * site, and it should be a business address the owner is happy to publish. Whatever is used
 * must not be Frame's, because Word of Model is deliberately outside Frame.
 */

export const ENTITY = 'Timothy Pearce, trading as Word of Model';

export const ABN = 'ABN 99 301 966 719';

export const CONTACT_EMAIL = 'hello@wordofmodel.ai';

/** Bump when either page changes in a way a subscriber would want to know about. */
export const LAST_UPDATED = '22 August 2026';

/** The governing law for the terms. Adelaide, South Australia. */
export const JURISDICTION = 'South Australia, Australia';

/**
 * The prices are NOT redefined here. lib/scope.ts holds the dollars, lib/stripe.ts holds the
 * cents, and stripe.ts throws at load if the two disagree. A third copy in the terms is how a
 * page ends up promising a price nobody charges.
 */
export { PRICE_USD, priceLabel } from './scope';
