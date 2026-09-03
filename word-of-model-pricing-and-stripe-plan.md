# Word of Model — pricing ladder and Stripe build plan
**28 August 2026.** Decisions locked. This document is the source of truth for what gets built today.

Goal it serves: **US$25,000 per month.** On this ladder, at an 80/20 split between tiers with 60% taking annual, that is roughly **250 paying businesses**.

---

## 1. The ladder

All prices in **USD**, displayed as **US$**. See §4.

| | Monthly | Annual | Effective monthly on annual |
|---|---|---|---|
| **Monitoring** (main) | $69 | $690 | $57.50 |
| **Additional location** (add-on, either tier) | $30 | $300 | $25.00 |
| **Monitoring + Review** (premium) | $249 | $2,490 | $207.50 |
| **Founding premium** (capped, see §3) | $149 | $1,490 | $124.17 |

Annual is **two months free** on every line. Ten times the monthly price. No exceptions, no rounding — the arithmetic being obvious is part of the offer.

### What separates the tiers

Premium is **cumulative, never a substitution.** The customer gets the entire Monitoring product, every month, unchanged, and a human deep-dive from Tim each quarter stacked on top of it.

This is not a cadence difference. A tier that swaps monthly automation for quarterly human work reads as paying 3.6× more for a report four times less often, and no amount of copy rescues that. The page must make the stacking visually obvious: premium's feature list is main's list, verbatim, plus additions.

### What is not on the ladder

**No free tier.** A recurring free subscription costs API spend in perpetuity for someone who has already decided not to pay, carries a support surface, and — with only a one-question, two-model gap to the paid tier — gives people a reason to stay put rather than upgrade.

**The free scan stays exactly as it is.** One-off, no account, no card. It is not a tier; it is the shopfront, and it is the destination of every ad currently running. Nothing in this plan touches it.

---

## 2. Why no migration is needed

Confirmed 28 August: **nobody is currently paying.** This is a clean build. No grandfathering, no proration, no notice period, no legacy price IDs to keep alive.

That will not be true again. Everything below is built once, correctly, while it is still free to do so.

---

## 3. The founding offer

**20 places at $149/month, held at that price for as long as the subscription stays active.** Closes when 20 are taken or on **30 September 2026**, whichever comes first.

### Say why it is capped

The cap is real and it is Tim's calendar. Premium includes a quarterly human review; 20 of those is about 10 hours a month, and that is the ceiling one person has.

State that reason on the page:

> 20 founding places at $149/month, held at that price for as long as you stay. Capped because each one includes time with me, and 20 is what I can do.

**Do not write "the next 20 positions."** It implies a first 20 that were taken, and they weren't. The method page is the strongest asset on this site precisely because it is the page where the product does not do that, and a scarcity line that the method page would have to walk back costs more than it earns. Real constraint, honestly stated, closes harder than an invented queue — because access to a human is the actual difference against an automated competitor.

### Build it as a price, not a coupon

Create a **separate Stripe price** (`premium_founding_monthly`, `premium_founding_annual`) rather than a discount coupon on the standard price.

A coupon carries a `duration` field. Set it wrong and the founding cohort silently reverts to $249 after three months, which breaks a promise to the twenty people who backed the product earliest. A distinct price cannot expire. It also makes the cap countable with one query and keeps the cohort legible in reporting forever.

### The cap: what closes the offer, and what does not

Availability is decided in code: count active subscriptions on the founding price IDs, compare against 20, compare the date against 30 September 2026.

**Two things close the offer, and both are hard-coded.** The date gate, and a count that comes back cleanly at zero remaining. Neither is negotiable and neither depends on anything being reachable at the moment it is read.

#### Reversed 3 September 2026: an unreadable count now fails OPEN

This section said the opposite from 28 August to 3 September, and the reasoning was right when it was written:

> **If that count query errors or returns nothing, do not offer the founding price.** Show $249. A failed count that falls through to "offer it" is indistinguishable from a genuine zero, and the failure mode is selling an unlimited number of permanent 40% discounts with nobody noticing.

What changed is the evidence, not the principle.

- The count failed **three times in five days**, every time from clock skew inside Supabase's gateway answering `JWT issued at future`. Nothing in this codebase causes it and nothing here can fix it — neither of our keys is a JWT.
- Each failure **withheld the offer from every visitor** for the duration, at the one moment they were closest to buying, on a page that looked completely normal.
- Total demand across that window was **two free scans and zero purchases**.

The guard was more expensive than the risk it prevented. It was also buying protection the display layer never provided on its own: `claim_founding_seat` decides the charge atomically, in Postgres, at the moment of buying, and returns the standard rate if it cannot reach the database. A page showing $149 hands out nothing by itself.

**On a failed count, render the founding block with the cap and the reason and no remaining count** — the same shape as "none taken yet", because there is nothing useful to say about a number nobody could read. Log the error and alert, exactly as before. This changed what happens on failure, not whether the failure is visible.

The accepted cost, stated plainly: a visitor can be shown the founding rate and then charged $249, because the seat could not be claimed. That is smaller than switching the offer off for everybody, and it is the trade this reversal made.

---

## 4. Currency

**USD only.** Decided 28 August. No `currency_options`, no AUD price list, no presentment settings — Stripe handles conversion at the card.

The site displays USD everywhere and labels it as such: **US$69**, not $69. The two-character prefix is the whole guard. An Australian who reads "$69" and is charged A$106 has been surprised; one who reads "US$69" has not, and Australian small businesses buy USD software constantly.

One consequence to accept rather than fix: some AU banks add a foreign transaction fee of around 3%, so the customer's statement lands a few dollars above the conversion. That is between them and their bank as long as the site never implied otherwise, which "US$" ensures.

---

## 5. Stripe object model

Three products, eight prices. Use `lookup_key` on every price so application code never hardcodes a `price_...` ID.

```
Product: Word of Model — Monitoring
  price  6900  usd  recurring/month   lookup_key: main_monthly
  price 69000  usd  recurring/year    lookup_key: main_annual

Product: Word of Model — Monitoring + Review
  price  24900 usd  recurring/month   lookup_key: premium_monthly
  price 249000 usd  recurring/year    lookup_key: premium_annual
  price  14900 usd  recurring/month   lookup_key: premium_founding_monthly
  price 149000 usd  recurring/year    lookup_key: premium_founding_annual

Product: Additional location
  price   3000 usd  recurring/month   lookup_key: location_monthly
  price  30000 usd  recurring/year    lookup_key: location_annual
```

**Additional location is a quantity line, not a plan.** Billing scheme `per_unit`, usage type `licensed`, quantity set at checkout and adjustable afterwards. A fixed "$99 for two sites" plan has no answer for a five-clinic dental group, and a five-clinic group is the best customer on the list. Per-unit scales to any count: $69 + 4 × $30 = $189 for five locations.

Attach `metadata.tier` and `metadata.founding` to each price so reporting does not have to parse lookup keys.

**Annual and monthly must not be mixable within one subscription.** A monthly base with an annual add-on produces an invoice nobody can read. Enforce at checkout.

---

## 6. What must not break

The funnel was rebuilt and re-instrumented 48 hours ago at real cost. Pricing work touches `/start`, which is paid onboarding. It must not touch:

- The free scan on `/` — no card, no account, unchanged
- `landed` → `scan_started` → `scan_completed` event recording
- UTM capture on every funnel row
- The attribution gate that keeps crawler noise out

If any pricing change requires routing the free scan through anything Stripe-aware, stop and raise it rather than building it.

---

## 7. Verification — observed, not reasoned

Nothing on this list is satisfied by reading the code and concluding it should work. Each line needs an observation.

- [ ] Stripe **test mode**: complete a subscription on each of the eight prices. Record the actual invoice amount for each. Confirm every annual invoice is exactly ten times its monthly price.
- [ ] Founding cap: temporarily set the cap to 2, create 2 test subscriptions, confirm the **third** checkout is offered $249 and not $149.
- [ ] Founding cap **fails open on the display, closed on the charge** (reversed 3 Sep 2026, see §3): break the count query deliberately, then confirm *both* halves — the block still renders with the cap and the reason and **no remaining count**, and a checkout attempted while it is broken is charged **$249**, because `claim_founding_seat` could not claim a seat. Confirm the error is logged and alerted. The two halves disagreeing is the whole risk this reversal accepted, so check them separately or you have checked neither.
- [ ] Founding date gate: set the system date past 30 September 2026 in test, confirm $249.
- [ ] Location quantity: subscribe with quantity 4, confirm the invoice reads $189, not $99 or $120.
- [ ] Every price on the site and in checkout reads **US$**, not a bare dollar sign.
- [ ] Free scan end-to-end on `/`, no card, no account, completes and delivers.
- [ ] A `landed` row still records with `utm_content` intact after the deploy.
- [ ] Mixed billing period is refused at checkout.

---

## 8. Sequencing

**Pricing ships as its own deploy, separate from the design overhaul.**

The general rule about changing one variable at a time is for improving a funnel that works. This funnel converts at zero, and at zero you are not optimising, you are repairing — so shipping the branding, the pricing page and the landing pages together is correct and the attribution loss is not real.

Stripe is the exception, for a different reason. A pricing misconfiguration takes money incorrectly, and that is the one class of bug that does not roll back cleanly — refunds, apologies, and a bad first impression on the earliest customers. Keep it isolated so that if something is wrong, it is unambiguous what caused it.

Order:

1. Stripe objects created in **test mode**, §7 verification run in full
2. Stripe live mode, same objects, spot-check
3. Pricing page and site branding deploy
4. Landing pages deploy
5. Re-verify §6 after every deploy, not just the first

---

## 9. Open, and blocking the rest of the overhaul

**The runtime claim.** Every live ad closes with *"Free, about a minute, no account."* The product reportedly tells the user it takes two minutes. If that is right, every ad currently running overstates the speed, and the site copy does too.

This is the same defect that cost two days of spend last week — a promise made in the ad that the destination withdraws. It is cheap to fix and expensive to leave. Establish the real number from the product, then make the ads, the site and the report agree on it. "About two minutes" is a perfectly good claim; being wrong about one minute is not.

**The brand asset.** The site, the report and the ad creatives are currently three separate visual systems. Codifying one token set from the Facebook profile asset blocks the report upgrade, the site pass, the pricing page and the landing pages — every remaining item.

**The report's logos.** Both, per Tim: the Word of Model mark for identity, and the AI engine logos as evidence of which models were actually sampled. The standing rule governs the rest — add anything that is evidence, refuse anything that is decoration. Engine logos are evidence of coverage. A trend line of Recommendation Share is the argument made visible. A gauge, a donut, or a "score out of 100" is the swarm's visual language and stays out.
