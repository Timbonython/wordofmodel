# Word of Model — engineering principles
**28 August 2026.** Eight rules the day's work converged on, each with the instance that produced it. Written for Claude Code and for whoever picks this up next.

---

## 1. Prefer impossibility over detectability

The strongest version of a guard is one that makes the defect unrepresentable, not one that notices it afterwards.

- The hairline grid: moving the line from the container to the items means a short or tall row shows paper instead of a grey block. *"It converts a silent visual defect into an impossibility, rather than into something a checker has to remember to look for."*
- `TIERS` typed as `keyof typeof PRICE_USD` — the type system refuses a tier whose price does not exist, so an unhonourable price cannot be printed.
- The price check at module load fails the **build**, so a disagreement between the printed price and the charged price can never reach a request.
- A unique index on the click id — one click writes one row, enforced by the database rather than by a list of names bots go by.

A check is second best. Reach for it when the first is unavailable.

## 2. A guard is not shipped until you have watched it fail

`brandcheck` was proven by `sed`-ing a wrong value in. The fail-closed founding cap was proven by pointing it at a table that does not exist. The mixed-billing guard had nothing to enforce until the line-item shape was made plural, so it was built before it was claimed.

Corollary: proving the alert worked revealed that three page loads sent three emails, which on production would have flooded the channel and hit Resend's rate limit — taking out the alert for the failures that actually cost a customer.

## 3. The check belongs where the decision is made

`claim_founding_seat` counted a `price_key` that stopped existing under a rename. Zero holders on every call, forever, handing out unlimited permanent discounts while every display-layer guard passed.

A fail-closed rule written about what the page renders does not protect the function that decides the charge.

## 4. A count without a window is not a measurement

116 landed rows divided by one day of Ads Manager produced a confident 4.6× inflation that did not exist. 116 was cumulative all-time. Like-for-like it was 28 against 25 — the right shape and the right direction.

State the window or do not state the number.

## 5. Absence renders as its opposite

The recurring defect of this project, in roughly a dozen costumes:

- An attribution gate built to exclude crawlers, keyed on parameters crawlers inherit from the ad URL
- An empty grid cell rendering as a deliberate-looking grey block
- `var(--mono)` misspelled, so the typography looked like a design gap rather than a four-character typo
- An unset Stripe support email that does not render at all, indistinguishable from one that is absent by design
- A failed count and a genuine zero, identical on the page
- A CLAUDE.md Files table listing three artifacts that are not on disk, with nothing in the repo to say so
- Project instructions naming documents by path that the project does not contain

Whenever a value can be missing, ask what it looks like when it is, and make that different from what it looks like when it is present.

## 6. Screenshots catch what checks cannot

Item counts are statically knowable; computed margins are not. The `.cards` grey band was found only by reading `getBoundingClientRect` out of a live DOM. The unreadable nav button, the grey wordmark, the 32px icon reading as a green corner — none would have failed a typecheck or a build.

The fold test needs four heights, not one: 844 is the logical viewport and no real phone shows all of it.

## 7. Verify from an independent path

Two instruments agreeing can be one instrument twice. Two phantom outages in one day came from a local resolver, and both times the site was fine.

Before concluding that something external is broken, check it from somewhere that shares none of its failure modes.

## 8. Architecture and copy can disagree, and only one reaches the customer

The price architecture made reversion impossible. Five pieces of copy promised "locked for twelve months" anyway — reintroducing, in a receipt, the exact coupon-duration failure the architecture existed to prevent. A live Stripe product description still carried "introductory offer first 20 subscribers" after the phrase had been removed from the site.

When an architectural decision exists to prevent a specific failure, grep the copy for that failure being promised. Nothing checks that a sentence agrees with the schema.

---

## Two corollaries added 30 August

**Record the decision, never the current value, when nothing enforces the value.** The brand kit README documented nav tracking at `.11em`. That was true when written and stopped being true the next day when the bar moved to Condensed 600 at `.08em`. Anyone restoring the documented number would have reverted a fix. The departure from `.14em` is the decision; the number is not.

**A document that names files is a document that goes stale silently.** `CLAUDE.md`'s Files table listed seven artifacts, three of which were not on disk anywhere in the tree, and nothing would have told you. The same defect appeared in a set of project instructions that named three documents the project did not contain. If a list of filenames is worth keeping, something has to check it.

---

## Dead code is collision fuel

Four specificity collisions in one codebase in one day — `.legal a`, `.wordmark span`, `.sitenav-links a` twice — each an over-broad descendant selector swallowing something added later, none catchable by typecheck or build.

Seven dead classes survived the homepage cut. Worth deleting not for tidiness: *"a rule nobody can see the markup for is a rule nobody will check before nesting something under it."*
