'use client';

import { confirmFact, type BusinessProfile } from '@/lib/profile';

/**
 * The three facts a question is written from, shown back to the person they are about.
 *
 * ONE COMPONENT, TWO CONSUMERS: the free scan's confirm card and /start step one. §5 of the
 * grounding brief asks for that explicitly, and `purchase-path` §0 records what happened when
 * two hand-written renderings of one truth were allowed to exist - the pricing pages drifted.
 *
 * WHAT AN EMPTY FIELD LOOKS LIKE IS THE POINT. Principle §5: absence renders as its opposite.
 * The card this replaced read "You sell X to {buyer || 'buyers in your category'} in
 * {country || 'your market'}" - a missing fact rendered as plausible prose in the same
 * typography as a found one, so nobody could see which was which. A field with nothing in it now
 * carries a dashed rule, its own line of text, and no value at all.
 */
export function BusinessFacts({
  value,
  onChange,
  brandName,
  heading,
  onFieldBlur,
}: {
  value: BusinessProfile;
  onChange: (next: BusinessProfile) => void;
  /** Shown in the heading so the card reads as being about them, not about a form. */
  brandName?: string;
  /** The wizard is not confirming a read; it is collecting. Same fields, different sentence. */
  heading?: string;
  /**
   * Fired when a row loses focus.
   *
   * Exists for one caller: /start resolves a typed locality against the SERP gazetteer on blur
   * and shows what it matched. Optional, because the scan has nothing to resolve against and
   * should not pretend to.
   */
  onFieldBlur?: (key: 'sells' | 'buyer' | 'location') => void;
}) {
  const rows = [
    {
      key: 'sells' as const,
      label: 'You are',
      hint: 'What someone would say you do',
      missing: 'We could not find this on your site',
    },
    {
      key: 'buyer' as const,
      label: 'Your buyers are',
      hint: 'The person choosing, not the trade you sell into',
      missing: 'We could not work out who chooses you',
    },
    {
      key: 'location' as const,
      label: 'You serve',
      hint: 'A town, a city, or leave it empty',
      missing: 'We could not find a location on your site',
    },
  ];

  return (
    <div className="facts">
      <div className="eyebrow">
        {heading ?? `We read ${brandName ? `${brandName}'s site` : 'your site'} as`}
      </div>
      <div className="facts-rows">
        {rows.map((row) => {
          const held = value[row.key];
          const empty = !held;
          return (
            <label className="facts-row" key={row.key}>
              <span className="facts-label">{row.label}</span>
              <span className="facts-field">
                <input
                  className={empty ? 'field facts-input facts-input-empty' : 'field facts-input'}
                  value={held?.value ?? ''}
                  placeholder={row.hint}
                  onChange={(e) => onChange({ ...value, [row.key]: confirmFact(held, e.target.value) })}
                  onBlur={() => onFieldBlur?.(row.key)}
                />
                {/* SAYS SO, rather than sitting quietly empty and looking like a design choice. */}
                {empty ? <span className="facts-missing">{row.missing}</span> : null}
              </span>
            </label>
          );
        })}
      </div>
      <p className="facts-note">
        {value.location
          ? 'Correct anything that is wrong. The question is built from these three, and a question you would not ask makes the answer worthless.'
          : 'Leaving the location empty is fine. The question will simply not mention a place, which is better than naming the wrong one.'}
      </p>
    </div>
  );
}
