# The result state — the page that has to sell the US$69
**5 September 2026.** Implementation brief. Written for Claude Code.

Pairs with `word-of-model-site-brand-and-structure.md` §4 (the homepage's single-mindedness and the
fold rule), `word-of-model-purchase-path.md` §0 (the PriceCard invariant) and
`word-of-model-scan-grounding-and-confirm.md` (the confirm card immediately upstream of this).
Governed by `word-of-model-engineering-principles.md` §1, §2, §5 and §8.

**This brief describes required behaviour, not current behaviour.** `build-status` is not in this
project. Read the result component before implementing; nothing below should be read as a claim
about what renders today.

---

## 0. The defect, observed

Read from `wordofmodel.ai` on an iPhone, 5 September, with a completed run on screen.

**The post-scan view is the homepage with the result appended to it.** After a domain, a confirm
card and a forty-second wait, the top of the viewport still reads *"Your buyers stopped Googling."*
The visitor's own result is below the fold, underneath copy they read before they clicked.

Three consequences, in order of cost.

**The highest-attention moment on the site opens with a pitch.** More commitment has been spent
reaching this screen than on any ad click. It is spent re-reading the hero.

**Three generic sections sit between the result and a price** — *What comes back*, *What an answer
looks like*, *Every category is fed by different sources*. One of them contradicts the result
directly: a visitor told *"Good news. You came up first on ChatGPT"* scrolls a short distance to
*"You were not in this answer."*

**The entire US$69 argument is the smallest text on the screen.** *"One question, two engines. The
full picture takes twenty five."* That sentence is the business, set as a caption.

This is §8 of the principles in a new place. The architecture knows the free scan is 2 of 25. The
page says so in grey, once, below the fold.

### Window on the above

One reading of the live site on one device on one day. It is an observation about structure, not a
measured conversion rate, and no number in this brief should be reported as one. Ads are off as at
5 September, so nothing here can be A/B tested against paid traffic yet.

---

## 1. The invariant

Per §1 — prefer impossibility over detectability.

**The post-scan view is its own state, not the marketing page with a result appended.** A visitor
holding their own result and a cold visitor who has never typed a domain are two different readers,
and one component cannot be optimised for both. Today it serves the second.

Consequences that must hold by construction:

- Every block on the result state exists because a completed run produced it. A block that renders
  identically for every visitor does not belong on this screen; it belongs on `/method`.
- The result headline occupies the top of the viewport. Nothing renders above it.
- **Exactly one price and one CTA on the screen**, both inside `PriceCard` per `purchase-path` §0.
  Grep still returns zero rendered prices outside it after this change.

---

## 2. Order of blocks

Replacing everything currently between the result and the footer.

| # | Block | Source |
|---|---|---|
| 1 | Result headline and sub | The run |
| 2 | The coverage grid — 2 of 25 | The run |
| 3 | The four questions not asked | The run |
| 4 | Three ranked actions, headings shown, bodies withheld | The run |
| 5 | Price, close and CTA — state-dependent | `PriceCard` |
| 6 | Email capture, demoted | — |
| 7 | Footer | — |

Cut from this state: *What comes back*, *What an answer looks like*, *Every category is fed by
different sources*. They are cold-visitor copy and they stay on `/` for cold visitors. Link to
`/method` once, in the footer, and not before the CTA.

---

## 3. The coverage grid

Five questions by five surfaces, twenty five cells. The free run lights the two it actually ran.

- Lit cells are `--green`. Unrun cells are `--paper` with a `--line` hairline. **Empty, not locked,
  not blurred, not ticked.** They are not withheld — they do not exist. §5 of the principles cuts
  both ways here: a cell that was never run must not render as one that was.
- The lit cells reflect **what the run actually did**, read from the run, never hardcoded to
  `(Q1, GPT)` and `(Q1, PPX)`. If the free scan's engine pair changes, the grid changes with it.
  A grid that lies about coverage is worse than no grid.
- Caption beneath, in body text not caption grey: *"You just ran two of twenty five. One question,
  two engines, this morning."* The last three words are the subscription argument in miniature and
  should not be cut.

This replaces the *What we are holding back* checkbox list. An unticked box reads as a form the
visitor is meant to complete, and it also claims we are sitting on three things we will not show —
which is a slightly worse thing to be than one that has not run them.

---

## 4. Three ranked actions

Numbered 1, 2, 3 — not bulleted, not a checklist. The rank is the product (*"In order, with why
that one is first. Not eight. Not a backlog."*). Bullets flatten the one property being sold, and
a checklist repeats the device this brief just retired one block above it.

**Each action renders a visible heading and a withheld body.** The heading names the subject; the
body is redacted with the same device as the leaderboard.

The distinction is load-bearing. Three fully-black bars prove nothing — anyone can black out three
lines, and a visitor who suspects that is right to. A heading that could only have come from their
own run is the proof; the bar is the price.

### The headings must be derived, not templated

**A heading names something the run observed.** A page on their site, a domain the engines cited, a
competitor from the sixteen, a question they came closest to winning. Those are facts already in
the run, not recommendations, so producing them costs nothing extra.

**If the free run does not hold enough to derive three real headings, do not ship the redacted
bars.** A generic heading across every visitor is furniture, and a black bar under a generic
heading claims something exists that does not — §5, in the direction that costs the most, on the
block that asks for money.

Read the free run's output first and report what it actually holds. That answer decides between:

- three derived headings with redacted bodies, as specified; or
- no action block on the free result at all, with the actions named only in the price copy.

Do not invent a third option in which the headings are written from the category rather than the
run.

---

## 5. The three result states

The close is different for each, because the visitor's own next question is different. Result-based
headlines already exist; this extends the same branch through the close and the CTA.

| State | What they are asking | CTA |
|---|---|---|
| Recommended | *How do I keep this?* | Hold my ranking |
| Named, not recommended | *Why am I in the list but never the pick?* | Get me recommended |
| Absent | *How do I get in at all?* | Get me in the answer |

**Recommended.** The close is fragility, and it is honest: one question, one morning, and the
sources underneath the answer churn. Sub: *"You're first because of pages neither engine got from
your site. Those move, and so do you."*

**Named, not recommended.** The sharpest of the three and the one most likely to convert — it is
the only state where the visitor knows something is wrong and cannot tell what. The gap between
named and recommended is already the site's best line; this is where it gets used.

**Absent.** Sub: *"Not necessarily because you're worse. Because of what the engines read, and
where they read it."*

**"Not necessarily" is not a hedge to be tidied away in copy review.** One question on two engines
cannot support *"not because you're worse."* It might be exactly because they're worse. This is the
site whose method page has to be able to back every sentence, and a close that overstates by one
word is the one-minute-runtime defect at a smaller dose.

Every state ends on one button. No second CTA, no "run another scan", no re-pitch of the free scan.

---

## 6. The email capture moves, and changes job

It drops below the price and becomes the fallback for a visitor who is not buying today: *"Not
today? We'll email this one, so you can forward it."* One field, as now.

The trade is stated rather than assumed. **Fewer email captures, a price in front of everyone who
scrolls.** Today the gate is the only door on the screen and the price is four scrolls further on.
If captures fall and nothing else moves, this is reversible in one deploy — but instrument the
change (§8) rather than reasoning about which way it went.

---

## 7. One accent per view

`site-brand-and-structure` §2: green is a scalpel, one accent per view. The grid's lit cells claim
the green on this screen, so **the CTA is `--ink`, not `--green`**, and the numeral `1` on the
first action is the only other green permitted.

Decide this once and site-wide rather than per block. If the CTA keeps green everywhere else, the
grid's lit cells need a different treatment and this brief is wrong about the grid, not about the
button.

---

## 8. Verification — observed, not reasoned

- [ ] Complete a free run on a real domain at 390px. **The result headline is in the first
      viewport.** Screenshot at 390 × 844 / 734 / 664 / 628 and attach all four.
- [ ] The homepage hero does not render above the result in the post-scan state.
- [ ] Grid lit cells match the engines the run actually queried. Change the engine pair in a test
      run and confirm the grid follows.
- [ ] A run that queried one engine rather than two lights one cell, not two.
- [ ] Each of the three action headings differs between two runs on two different domains. If any
      heading is identical across both, it is templated and §4 is not satisfied.
- [ ] All three result states render end to end. Force each one rather than waiting to meet it.
- [ ] Grep: no rendered price outside `PriceCard`, on this state or any other.
- [ ] Confirm-card fold rule from `scan-grounding-and-confirm` §5 still holds after the change.
- [ ] `npm run check`, `copycheck`, `brandcheck`, `docscheck` clean.

### Watch the guard fail

Per §2 — a guard is not shipped until you have watched it fail.

1. Hand the result state a run with **no derivable action headings** and confirm the action block
   does not render at all, rather than falling through to generic headings with black bars under
   them.
2. Hand it a run whose engine list is empty and confirm the grid renders zero lit cells and says
   so, rather than defaulting to two.

---

## 9. Instrument it, or the change is unmeasurable

Two events, or the before-and-after is a story rather than a reading:

- The result state rendering, carrying the state (recommended / named / absent).
- The CTA pressed, carrying the same.

Without those, a change in checkouts cannot be attributed to this and the email-capture trade in §6
cannot be evaluated. `visits` and `funnel_events` already exist; this is a row shape decision, not
new infrastructure.

`SubscribedButtonClick` in Events Manager still holds the pre-shutdown window and can be read
whenever it is wanted. Ads are off, so it is not urgent and it is not a blocker for this.

---

## 10. Not settled

- **What the free run actually holds.** Decides §4 entirely. Read it before building the action
  block.
- Whether the free scan's engine pair is fixed or varies. Decides how the grid derives its lit
  cells.
- Whether the homepage input's copy should name the free scan's scope — *one question, two
  engines* — alongside *about three minutes*. It under-promises where the page currently
  over-promises, but it also adds a qualifier to the one line the fold rule protects. Separate
  decision, separate deploy.
- Whether `/pricing` and `/` need the same three-state treatment. They do not have a run to branch
  on, so probably not, but the CTA labels may want to agree.
