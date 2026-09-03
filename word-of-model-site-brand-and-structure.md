# Site structure, branding and pricing page
**28 August 2026.** Implementation brief. Pairs with `word-of-model-pricing-and-stripe-plan.md`, which covers Stripe and is a separate deploy.

---

## 0. The landing count — what was wrong, and what is actually wrong

**Corrected 28 August, after diagnosis.** The first version of this section claimed 116 landings against 25 link clicks, a 4.6× inflation. That arithmetic was wrong. 116 was a **cumulative all-time count**, read at 07:41 on the 28th, and it was divided by a **single day** of Ads Manager. Two correct numbers, incompatible units.

Like-for-like, ACST 28 August against Meta's 25 link clicks:

| | Rows | vs Meta |
|---|---|---|
| All `landed` rows | 69 | 2.8× |
| With a real `fbclid` | 28 | 1.12× |
| With no `fbclid` at all | 41 | the entire excess |

**28 observed clicks against 25 reported is the right shape and the right direction.** Meta undercounts; we come in slightly above. That part of the instrument is fine.

### The real defect, and it is a design error not a bug

The excess is 41 rows carrying no click identifier. The cause is the attribution gate:

```js
// app/page.tsx:64
const attributed = Boolean(touch.utm_source || touch.utm_content || touch.fbclid);
```

`utm_source`, `utm_medium`, `utm_campaign` and `utm_content` are **baked into the ad's destination URL**. Anything that fetches that URL carries all four. Only `fbclid` is minted at click time.

So the gate admits every automated fetch of the ad URL as an attributed human visit. It was built to exclude crawler noise and instead defined crawler noise as attributed traffic.

The premise it rests on is stated in `CLAUDE.md:722` and `0019_landed_event.sql:27`: *"A crawler does not append utm_content; an ad click always does."* The second half is true. **The first half is false** — a crawler does not append it, it *inherits* it, which arrives at the same place by a different road.

Signature, unmistakable: 29 rows in 88 seconds on 27 August, zero `fbclid`s, gaps of 0.0s and 0.1s, walking across two ad URLs. And `outburst-video` recorded 22 landings on 28 August with zero `fbclid`s — an ad with **no observed clicks at all**. Those 22 are fetches.

Second, smaller cause: there is no dedup on `landed` at any level. The unique index `funnel_events_once_per_scan` is `where scan_id is not null`, and `scan_id` is null on 129 of 129 landed rows, so it never applies.

The `facebookexternalhit` exclusion **did ship** (commit `63e3066`, 27 August) and works. It just knows three strings. Every other crawler — link scanners, security scanners, uptime monitors, unfurlers, LLM crawlers — walks straight through. A blocklist of names was never going to hold.

### The corrected conclusion

Zero scans from **28 real clicks**, on a day when 96% of spend went to one creative, is a thin and unalarming number. It is not evidence that the page fails people. It is barely evidence of anything.

**Which leaves Tim's judgement call exactly where it was.** The overhaul below is not a response to a conversion rate. It is the right structure for the product, and it ships because it is correct.

### The fix, and why it is a definition rather than a patch

`landed` must mean *a click arrived*, enforced by the schema:

- Require a **click-time identifier**: `fbclid`, `gclid`, `ttclid`, `li_fat_id`, `msclkid`. Not `fbclid` alone — hard-coding one vendor's parameter makes the next paid channel invisible and nobody will remember why.
- **Unique index on it** for landed rows, so one click writes exactly one row. Enforced by the database, not by a list of names bots go by.
- Drop the UTM-only rows. They record that something fetched a URL, which is not a fact about a person.

This undercounts — privacy browsers strip click ids and those clicks vanish. Accept it. Undercounting is the safe direction, and a number that errs low is one you can trust when it rises.

**Store the user-agent on every funnel row from now on.** Not to filter on; a blocklist is precisely what just failed. Store it so the next version of this question can be answered from the data. The reason the 129 existing rows cannot be restated is that it was never stored.

Do not delete or restate history. Leave the 129 rows and label the cutover date wherever the series is read — a step down at the change is a definition change, not a traffic change.

### Two smaller things from the same screenshot

**rival-video took 96% of spend** ($12.31 of $12.76). Third day running. The 2×2 creative test is not running — outburst-static has 9 impressions and one cent. Meta has no conversion signal to optimise against, so it concentrates on the creative best at producing clicks. Until a completed scan is fed back, this will not correct itself, and no creative conclusion from this account is worth anything.

**There is a "Verification required for financial services ads for Australia" banner on the account.** Probably a blanket notice to all AU advertisers. Worth thirty seconds to confirm it is not gating delivery, because if Meta has classified these as financial services the ads stop and it will look like a budget problem.

### Two smaller things from the same screenshot

**rival-video took 96% of spend.** Third day running. The 2×2 creative test is not running — outburst-static has 9 impressions and one cent of spend. Meta has no conversion signal to optimise against, so it concentrates on the creative best at producing clicks. Until a scan completion is fed back, this will not correct itself, and no creative conclusion drawn from this account is worth anything.

**There is a "Verification required for financial services ads for Australia" banner on the account.** Probably a blanket notice to all AU advertisers rather than a classification of these ads. Worth thirty seconds to confirm it is not gating delivery, because if Meta has classified this as financial services the ads stop and it will look like a budget problem.

---

## 1. The mark — settle this before any pixel moves

Three different Word of Model marks are in public right now:

| Where | Mark |
|---|---|
| Browser tab / favicon | An open quotation mark, paper on ink |
| Every live ad creative | Five squares in a single row, first one green |
| Facebook profile | Five squares in a 3+2 grid, top-left green |

**Recommendation: the 3+2 grid wins.** Not on taste — on meaning. Five cells with one lit is Recommendation Share drawn as a logo. It depicts the one number the whole product exists to report. A quotation mark says "we quote things", which is true of every testimonial business on earth.

The quote mark's only real advantage is mechanical: it holds at 16px and the grid will turn to mush there. That is solvable and does not outrank meaning.

**Decision to implement:**

- Primary mark: **3+2 grid**, top-left cell green, remaining four in the neutral grey for the surface
- Lockup: mark + `WORD OF MODEL` in Plex Condensed 700, uppercase, letter-spacing `.02em`
- **Favicon / 16–32px: a reduced grid** — 2+1 cells, top-left green. Same idea, survives the size. Never the full five at small sizes, never the quotation mark again.
- Retire the five-in-a-row from ad creatives at the next render. Existing live ads are not worth re-uploading mid-flight; change it when the creative next changes.

Ship one mark to every surface in the same deploy. Three marks became four the moment someone made a fifth in good faith.

---

## 2. Brand tokens — one set, one file

Currently the site, the report and the ad creatives are three visual systems that share a name. Put these in one place (`app/globals.css` custom properties plus a `brand.ts` export) and have everything consume them.

```
--ink        #15171C   page ground on dark surfaces, primary type on light
--paper      #F7F6F2   page ground on light surfaces, primary type on dark
--green      #2E7D5B   the single accent. one cell, one rule, one link colour
--soft       #5C5F68   secondary type on paper
--mute       #A9ACB4   secondary type on ink
--faint      #8E9199   tertiary, timestamps, captions
--line       #DEDCD4   hairlines and inactive cells on paper
--cell-dark  #3A3D45   inactive cells on ink
```

**Type.** IBM Plex, three cuts, no fourth:

- `PlexCond 700` — headlines and the wordmark. Letter-spacing `-.012em` at display sizes.
- `PlexSans 400/600` — body, UI, report prose.
- `PlexMono 500` — eyebrows, labels, URLs, data. Uppercase, letter-spacing `.14em`.

The mono eyebrow is the system's signature. It is what makes the ads look like an instrument rather than a brochure, and it is currently missing from the site entirely.

**Green is a scalpel.** One accent per view. A page with a green button, a green rule, a green heading and a green icon has no accent, it has a second body colour.

---

## 3. Navigation

Tim's reference is Xero — a normal SaaS bar, because a product asking for a subscription should look like one.

```
[mark] WORD OF MODEL      How it works    Pricing    Sample report    [ Free scan ]
```

- **How it works** → `/method`. The strongest page on the site and currently reachable only by accident.
- **Pricing** → `/pricing`. New. See §5.
- **Sample report** → `/sample`. New, and the highest-value item in the bar.
- **Free scan** → the homepage scan, as a filled green button.

### Build the sample report page

A real report, run on a real business, published in full and permanently. Not a mockup, not blurred, not gated.

This is the answer to "it looks like nobody is home" — and it is a better answer than any scarcity line, because it is evidence rather than implication. It shows the buyer exactly what arrives, it demonstrates the product on a category they can judge, and it is the page a curious person sends to a colleague.

Run it on a business that has given permission, or on Frame Creative, and say which it is.

**Footer:** How it works · Pricing · Sample report · Writing · Contact · Terms · Privacy.

---

## 4. Homepage — single-minded on the scan

The current homepage opens with a full-viewport headline. The scan input's position relative to the fold on a 390px phone is unverified and is the cheapest available explanation for landings that never start.

### Required: the input is in the first viewport on a 390px-wide phone

Not "near the top". Visible without scrolling, with the reassurance strip under it. Screenshot at 390px and at desktop width and attach both to the PR. This is an observation, not a design opinion — if the headline has to shrink to make room, the headline shrinks.

### Structure, in order

**1. Hero**

> Your buyers stopped Googling.
> They started asking.
> **ChatGPT.**

Lede beneath, naming the breadth the hero narrowed: the five engines.

Then the input. One field, one button. Then:

> Free · about three minutes · no account, no card

**On "about three minutes":** the verified run took 2m 46s. The page currently says about two. That is the same species of defect that cost two days of spend last week — the promise running slightly ahead of the product — just a smaller dose. Say three and let people be pleasantly surprised. Update the ads in Meta to match, which is already queued.

**2. What comes back** — three items, concrete, no icons

The actual answer, word for word. Who got named and who got recommended. Three things to do about it.

**3. What an answer looks like**

The redacted-answer device from the rival creative, rendered as a real page element: a ranked list, the top entry blacked out and tagged RECOMMENDED, and the line *"You were not in this answer."* It is the most persuasive thing in the whole campaign and it exists only inside an ad.

**4. What we don't claim** — three lines, then a link to `/method`

The differentiator against every competitor in the category, who all claim a score out of 100.

**5. Pricing strip** — the two tiers as one line each, link to `/pricing`

**6. Footer**

### Cut from the homepage

Anything that is not one of the six blocks above. The homepage's only job is starting a scan; everything else has a page.

---

## 5. Pricing page

Full detail in the Stripe plan. Page requirements:

**Two cards, side by side.** Monitoring US$69, Monitoring + Review US$249. A monthly/annual toggle above both, annual labelled *two months free* with the annual figure shown, not calculated by the reader.

**Premium's feature list is Monitoring's list, verbatim, plus additions.** Repeat every line. A reader must be unable to construct the idea that premium swaps monthly reporting for quarterly. The additions are visually marked; the shared lines are not abbreviated to "everything in Monitoring".

**Additional location** sits below both cards as a quantity row, not a third card: *US$30/month per additional location, on either plan.* A stepper showing the total updating live is worth building — a five-clinic group needs to see US$189 without doing arithmetic.

**Founding block**, honest form:

> 20 founding places at US$149/month, held at that price for as long as you stay.
> Capped because each one includes time with me, and 20 is what I can do.
> Open until 30 September 2026, or until the 20 are taken.

**Fail-closed behaviour — resolved 28 August.** An earlier version of this section conflicted with §3 of the Stripe plan. The Stripe plan is correct and this is the binding rule:

If the count query errors or returns nothing, **the founding block does not render at all.** The premium tier shows its standard US$249. Do not render the block without a number, and never show "20 remaining" as a fallback.

The reasoning: a failed count cannot tell you whether the offer is open, so it cannot be offered. Selling an unbounded number of permanent 40% discounts is the expensive failure; a founding buyer who sees US$249 and emails you is a recoverable one.

**And it must alert.** A silently broken count refuses the founding offer to every visitor while the page looks perfectly normal — the same defect in the opposite direction, and the more likely one to run for a week unnoticed.

**Every price carries the US$ prefix.** Bare `$69` to an Australian reader is a promise the card statement breaks.

**Free scan stays visible on this page.** Someone reading pricing who is not ready should be able to run the scan from here rather than leaving.

**No comparison table against named competitors.** The method page's authority comes from not doing that.

---

## 6. The report

**Word of Model mark** on the cover and running header. Identity, once, small.

**AI engine logos** beside each captured answer, as evidence of which model produced it. Small, inline, factual.

Constraint on that: nominative use only. The logos identify which services were sampled. They must never form a row across the top of a page, at equal size, in a way that reads as partners or endorsements — that is the "as featured in" pattern, and it is the same lie in a more respectable typeface.

**One chart: Recommendation Share over time.** A single line, the client against the consideration set. The argument made visible.

**The rule that governs everything else: add anything that is evidence, refuse anything that is decoration.** Engine logos are evidence. The trend line is evidence. A gauge, a donut, a progress ring, or "AI Visibility Score: 73/100" is the visual language of every competitor in this category and the report is better without it. The dot-matrix worry is real, and the cure is typographic craft — proper hierarchy, real margins, the mono labels — not chart furniture.

---

## 7. Order of work

1. **Diagnose the landing over-count.** One query, before any code changes. It reframes everything else.
2. **Brand tokens + the one mark**, applied site-wide. Nothing else can be built consistently until this lands.
3. **Homepage rework**, with the 390px screenshot as the acceptance test.
4. **Pricing page**, after the Stripe objects exist in test mode.
5. **Sample report page.**
6. **Report visual pass.**

Stripe stays a separate deploy for the reason given in that plan: a pricing bug takes money incorrectly and does not roll back cleanly.

Re-verify after every deploy that the free scan still completes with no card and that `landed` still records with `utm_content` intact.
