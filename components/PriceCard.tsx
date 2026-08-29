import Link from 'next/link';
import type { ReactNode } from 'react';
import { startHref, type PlanParam } from '@/lib/scope';

/**
 * A price and its door, rendered together.
 *
 * THE CTA IS NOT OPTIONAL, AND THAT IS THE WHOLE COMPONENT. §0 of the purchase-path brief:
 * a price on a page with no purchase path is the same defect as a price checkout cannot
 * honour - both print a number the visitor cannot act on. One was caught yesterday because
 * the type system refused a tier without a price. This one shipped because nothing connected
 * a rendered price to a working button.
 *
 * So `cta` is a required prop. A price cannot be displayed through this component without a
 * door, because there is no way to express one. Prefer impossibility over detectability.
 *
 * THE HREF IS DERIVED, NEVER PASSED AS A STRING. `plan` goes in, startHref() builds the link.
 * A tier that exists gets a working button by construction rather than by somebody remembering,
 * and a typo in a path cannot reach a card.
 *
 * ONE COMPONENT, TWO DENSITIES. The homepage strip and /pricing were two hand-written
 * renderings of one catalogue and had already drifted: /pricing builds premium's feature list
 * by construction from MAIN_FEATURES + PREMIUM_ADDITIONS while the homepage abbreviated it to
 * "Everything in Monitoring" - the exact abbreviation §5 of the brand brief forbids. Two
 * renderings of one truth is how the 54 hex literals happened.
 */
export interface PriceCardProps {
  name: string;
  /** Already formatted, US$ prefix included. There is no unformatted path in. */
  amount: string;
  /** "a month" or "a year". Beside the amount, never inside it. */
  unit: string;
  /** REQUIRED. This is the invariant the component exists to hold. */
  cta: {
    label: string;
    plan: PlanParam;
  };
  /** A second line under the amount: the annual equivalent, or the founding condition. */
  sub?: string;
  /** The one-line description, or a full feature list on /pricing. */
  children?: ReactNode;
  /** Visual weight. Both render the same parts in the same order. */
  variant?: 'strip' | 'card';
  /** Marks the tier the page is steering toward. Cosmetic only. */
  featured?: boolean;
}

export function PriceCard({
  name,
  amount,
  unit,
  cta,
  sub,
  children,
  variant = 'card',
  featured = false,
}: PriceCardProps) {
  return (
    <section className={`pricecard pricecard-${variant}${featured ? ' pricecard-featured' : ''}`}>
      <h3 className="pricecard-name">{name}</h3>
      <p className="pricecard-amount">
        <span className="pricecard-figure">{amount}</span> <span className="pricecard-unit">{unit}</span>
      </p>
      {sub ? <p className="pricecard-sub">{sub}</p> : null}

      {/* Before the detail, not after it. A buyer who has decided at the price should not have
          to scroll a feature list to find the button. */}
      <Link className={`button pricecard-cta${featured ? '' : ' ghost'}`} href={startHref(cta.plan)} prefetch={false}>
        {cta.label}
      </Link>

      {children ? <div className="pricecard-detail">{children}</div> : null}
    </section>
  );
}
