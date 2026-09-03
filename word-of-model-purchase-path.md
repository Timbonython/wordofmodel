# Homepage and pricing page — the purchase path
**29 August 2026.** Implementation brief. Follows the four gates.

---

## 0. The defect, stated as an invariant

Last night US$69 was not purchasable at all. This morning it is purchasable, but **only from `/pricing`**. The homepage renders a Monitoring card showing US$69 with no way to buy it, and a single button that lives inside the founding block.

A price on a page with no purchase path is the same defect as a price checkout cannot honour. Both print a number the visitor cannot act on. One was caught yesterday because the type system refused a tier without a price; this one shipped because **nothing connects a rendered price to a working button.**

### The fix is structural, not a button

Per the standing principle — prefer impossibility over detectability:

**Build one `PriceCard` component that renders the amount and its CTA together, and make the CTA non-optional.** A price cannot then be displayed anywhere without a door, because there is no way to express one.

- Both the homepage strip and `/pricing` consume that component. They are currently two hand-written renderings of the same catalogue and they have already drifted: `/pricing` builds premium's feature list by construction from `MAIN_FEATURES + PREMIUM_ADDITIONS`, while the homepage abbreviates it to *"Everything in Monitoring."* Two renderings of one truth is how the 54 hex literals happened.
- The CTA's `href` derives from the tier key, so a tier that exists in `TIERS` gets a working link by construction rather than by someone remembering.

**Acceptance:** grep for a rendered price that is not inside a `PriceCard`. Zero results, and say so.

---

## 1. Every tier gets its own button

| Card | CTA | Destination |
|---|---|---|
| Monitoring US$69 | Start Monitoring | `/start?plan=main` |
| Monitoring + Review US$249 | Start Monitoring + Review | `/start?plan=premium` |
| Founding US$149 | Take a founding place | `/start?plan=premium_founding` |

Three prices, three doors. The current single "Set up my report" button is ambiguous about which plan it starts, and a buyer who wants the US$69 has no way to say so.

---

## 2. Show the four steps before the click

`/start` is a four-step wizard: **The business → The competitors → The questions → Payment.** A visitor clicking a price button has no idea three screens of setup sit between them and the thing they just decided to buy. That is a drop-off generator, and it is the same shape as the defect that cost two days last week — the destination is not what the button implied.

**Do not hide that payment is last. Lead with it.** The order is genuinely in the buyer's favour and saying so converts a friction into a reason to trust:

> Four steps, about five minutes. Your business, your competitors, your five questions, then payment.
> **You approve the questions before anything is charged.**

Place it once, directly beneath the card row, in mono at label scale. Not inside each card — three copies of the same sentence is noise.

**Mirror it on `/start` itself.** The wizard already shows the four steps; add the same "nothing is charged until step four" line at step one so the reassurance survives the click.

---

## 3. The founding block

Currently: *"All 20 founding places are open, held at that price for as long as you stay. Capped because each one includes time with Tim, and 20 is what he can do."*

The cap and the reason are right and stay exactly as they are. **"All 20 are open" should go.** It is true, and the honesty rule is satisfied without it — "20 founding places" is a complete statement. Volunteering that none are taken is the same self-inflicted emptiness that "first 20 subscribers" was avoiding from the other direction.

Show a remaining count once at least one is taken. Before that, state the cap alone.

**Updated 3 September 2026.** The fail-closed rule from the Stripe plan has been reversed: if the count query errors, render the block anyway, with the cap and the reason and no remaining count — the same shape as "none taken yet" — and alert. It used to say render no block at all. See §3 of the Stripe plan for the evidence: three failures in five days from clock skew inside Supabase's gateway, the offer switched off for every visitor each time, and two free scans and zero purchases of demand across the window.

Note that this rule applies to the **wizard** too, and did not until that date. `/start` printed "20 of 20 places left" from the day it shipped — the exact "all 20 are open" sentence this section says to remove, and under a failed count it would have stated a figure nobody could read. The count is now suppressed there on the same condition as here.

**Also fix the person.** The block says *"time with Tim"* and *"20 is what he can do"* — third person, on Tim's own site, in a paragraph that is otherwise first-person elsewhere. Pick one. First person is stronger here: *"each one includes time with me, and 20 is what I can do."*

---

## 4. Homepage placement

The pricing strip stays where it is, below the scan. The homepage's job is still starting a free scan first — that has not changed and the fold rule from Gate 3 still binds: **the scan input must be visible without scrolling at 390×628.** Re-measure at all four heights after this change; adding buttons below cannot be allowed to push the input down.

Order on the homepage is unchanged: hero and scan, what comes back, what an answer looks like, what we don't claim, **pricing strip with working buttons**, footer.

---

## 5. Verification — observed, not reasoned

- [ ] From a clean incognito session, buy Monitoring at US$69 end to end in **test mode**. Screenshot the invoice. US$69.00.
- [ ] Same for premium and for a founding place.
- [ ] Every price rendered on `/` and on `/pricing` has a button, and every button reaches a checkout for the tier it names. Click all of them.
- [ ] The four-step line appears once on the homepage and once at step one of `/start`.
- [ ] Fold re-measured at 390 × 844 / 734 / 664 / 628. Scan input still above the fold at all four.
- [ ] No rendered price exists outside `PriceCard`.

---

## 6. Related, already in motion

`local_cohort_69_3mo` has `applies_to = ALL PRODUCTS` — US$180 off anything, which turns US$69 into $0, a US$149 founding place into $0, and a US$30 location into $0. The app blocks it (the offer registry pins it to `premium_monthly`), so the exposure is only a session built outside the app from the Dashboard. `applies_to` cannot be edited on an existing coupon.

**Re-mint it now.** Zero redemptions makes this free today and expensive the moment a code is in someone's hand. Tim has actioned this.

The founding trial coupon is correct: `percent_off 100`, repeating 3 months, `applies_to` the live Monitoring product only, 20 one-use expiring codes. All three guards proved in test — scoping refuses premium, founding and location; a card is stored at $0; month four charges 6900.

The one thing not provable without real money is card-at-$0 on live. The first genuine redemption answers it: a missing card shows immediately as a subscription with no `default_payment_method`. **Check that on the first trial signup rather than waiting for month four to tell you.**
