# The free scan — grounding the profile, and the confirm step
**1 September 2026.** Implementation brief. Written for Claude Code.

Pairs with `word-of-model-site-brand-and-structure.md` §4 (the homepage's single-mindedness and the
fold rule) and `word-of-model-purchase-path.md` §2 (the four-step wizard). Governed by
`word-of-model-engineering-principles.md` §1, §2 and §5.

**This brief describes required behaviour, not current behaviour.** `build-status` is not in this
project, so nothing here should be read as a claim about what the scan pipeline does today. Read the
pipeline first, then implement.

---

## 0. The defect, observed

One run, `generalhavelock.com.au`, 1 September 2026. The scan completed and produced this as the
question a buyer would ask:

> Which Australian pub food and drinks supplier can reliably cover 20+ venues across metro
> Melbourne and regional Victoria with 7-day delivery, consistent menu pricing, and same-day support
> for short orders?

The General Havelock is a single pub at 162 Hutt Street, Adelaide. **Two errors, not one.**

1. **The side of the transaction is inverted.** The question models the client as a wholesaler
   selling *to* venues. It is a venue, chosen *by* people deciding where to eat and drink.
2. **The geography is invented.** Melbourne and regional Victoria, for an Adelaide business.

### The address was on the page

Fetched independently, 1 September: `162 Hutt Street, Adelaide, SA 5000` appears in the homepage
text, "Adelaide" appears repeatedly, and the business describes itself as a public house established
1873. There is no `LocalBusiness` JSON-LD, but the address is in plain prose on the page the
checklist says it read.

So this is not an inference from thin data. It is a base-rate leak — the model reaching for the
largest Australian market because nothing forced it not to. That matters for the fix: a mechanism
that guesses when unconstrained will keep guessing on every other field it is not policed on.

### Window on the above

One observed run, one site, one day. It is not a rate. Treat it as a demonstrated failure mode
worth closing, not as a measured frequency — §4 of the principles.

---

## 1. Why a location clarifier before the scan is the wrong fix

Tim's first instinct was a location question in the workflow ahead of the free test. It fixes the
smaller of the two errors and buys the larger one nothing: with a location field, the same run
produces *"Which Adelaide pub food and drinks supplier…"*, which is still wrong, still names the
client as something it is not, and is still the deterrent it was — now with a form field in front
of it.

It also costs the thing the homepage was rebuilt to protect. `site-brand-and-structure` §4 makes the
homepage single-minded on the scan: one field, one button, and the input above the fold at four
phone heights. A pre-scan clarifier taxes every visitor with work in order to fix a failure that
happens to some of them, at exactly the moment they have been given no reason to do work.

**The correct fix is in two parts: ground the inference so it cannot invent, and confirm it at the
point where confirming is cheap.**

---

## 2. The invariant

Per §1 of the principles — prefer impossibility over detectability.

**Question generation consumes a typed business profile. Every field on it is extracted, or
user-confirmed, or null. There is no fourth state, and a null renders as absence, not as a
default.**

```ts
type Provenance = 'extracted' | 'confirmed'   // no 'inferred', deliberately

type BusinessProfile = {
  sells:    { value: string; from: Provenance } | null
  buyer:    { value: string; from: Provenance } | null
  location: { value: string; from: Provenance } | null
}
```

Consequences that must hold by construction, not by review:

- A question containing a city that is neither in the extracted facts nor entered by the visitor is
  **unrepresentable**, because the generator is never handed one.
- `location: null` renders a question with **no geography at all** — not a national default, not a
  capital city. A question about the whole country is a defensible answer; a question about the
  wrong city is not.
- §5 of the principles applies directly: absence renders as its opposite. A missing location
  currently looks exactly like a found one. Make the two different at every layer — in the profile,
  in the confirm card, and in the question.

Do not add an `inferred` provenance later as a convenience. It is the defect with a name.

**Decided 1 September: `location` is singular for this build.** One location, one string. Multiple
sites are not modelled and no plural shape is added in advance — see §8.

---

## 3. Extract before writing

Order of operations, strictly:

1. Fetch the site.
2. **Extract facts into the profile.** Address, suburb, state, postcode, phone area code, contact
   page, footer, ABN, `LocalBusiness`/JSON-LD where present. Quote them from the page — do not
   normalise, expand, or enrich. "Adelaide, SA" is the fact; "South Australia's capital, population
   1.4m" is not.
3. Only then write the question, with the profile passed as **constraints**, not as context.

The distinction in step 3 is the whole thing. Facts supplied as background get overridden by a
strong prior; facts supplied as constraints do not, and when they are absent the constraint is
absent too, which is what makes the null case behave.

If several locations are found, take the primary one — the profile holds one. Record in the run
that others were seen, so the plural question in §8 can be answered from data later.

---

## 4. The buyer side

The inversion is the more expensive error and needs its own field, because location grounding does
nothing for it. `buyer` is not a phrasing detail; it decides which direction the question runs and
therefore which market gets sampled.

The generated question must name **who is choosing** and **what they are choosing between**, and the
client must be the thing being chosen. For the Havelock:

> Where should I go for a pub meal and a beer in the east end of Adelaide?

not a question about pub suppliers. If `buyer` is null, do not write a question — this is the one
field the run cannot proceed without, and the confirm card is where it gets filled.

---

## 5. The confirm card

Placement: the seam the checklist already has, between *Writing the question a buyer would ask* and
*Asking the engines*. Nothing is asked of the visitor until the machine has demonstrated it read
their site, which is where the credibility is and where a correction reads as control rather than
as a form.

```
WE READ YOUR SITE AS

  You are          a pub
  Your buyers are  people choosing where to eat and drink
  You serve        Adelaide, SA

  [ Looks right — ask the engines ]   [ Fix this ]
```

Requirements:

- All three fields editable in place. Pre-filled from the profile. One button to proceed.
- Editing a field sets its provenance to `confirmed`.
- **An empty field looks empty and says so** — "we couldn't find this" — never a plausible-looking
  guess in the same typography as a found fact. §5 again.
- The card is on the run path, not a modal, and it does not move the homepage input. Re-measure the
  fold at 390 × 844 / 734 / 664 / 628 after the change and attach the screenshots; adding this
  cannot be allowed to push the input down.
- Timing copy: the homepage promises about three minutes. Measure a run with the card in it. If
  confirming pushes a real run past three, change the number on the site and in Meta rather than
  letting the promise run ahead of the product.

**One component, shared with `/start` step one — "The business".** The paid wizard collects the same
three facts. Two hand-written renderings of one truth is how the pricing pages drifted
(`purchase-path` §0); build it once and have both consume it.

---

## 6. Verification — observed, not reasoned

- [ ] Re-run `generalhavelock.com.au`. The question names **Adelaide or no city**, and positions the
      pub as the thing being chosen, not as a supplier.
- [ ] Run five more across states — a Perth clinic, a Hobart trades business, a Darwin service
      business, a regional NSW business, a genuinely national e-commerce site. **Zero questions
      mention Melbourne or Sydney unless that string is on the site.** The national one produces a
      question with no city in it.
- [ ] Run one site with no address anywhere. The confirm card shows the location field visibly
      empty, and the question generated after skipping it contains no geography.
- [ ] Grep: no call path reaches question generation with a location string that did not come from
      the profile.
- [ ] Fold re-measured at all four heights, screenshots attached. Scan input still above the fold.
- [ ] The confirm card and `/start` step one are the same component.
- [ ] A full run timed end to end, with the card, against the "about three minutes" claim.

## 7. Watch the guard fail

Per §2 — a guard is not shipped until you have watched it fail. Two deliberate breaks before this
is called done:

1. Hand the generator a profile with `location: null` and confirm it emits no geography, rather than
   quietly reaching for a default.
2. Hand it a profile whose location is `Adelaide, SA` while the site text says Melbourne somewhere
   incidental, and confirm the constraint wins.

---

## 8. What this brief does not settle

- Whether the same inversion appears in the **paid** report's question set, or only in the free
  scan. Worth checking before this ships, because the fix belongs upstream of both if so.
- Whether `location` should become plural later. The pricing ladder bills additional locations at
  US$30/month, so location is already a first-class billing entity. Singular is the decision for
  this build; the plural shape is a schema decision to be made when there is a multi-site customer
  and run data showing how often several locations are found.

---

## 9. The question itself, made editable (1 September 2026, later the same day)

§5 put three facts on the card and left the question they produce out of sight. A second live run
showed why that is not enough. A keynote speaker and business mentor in Adelaide produced:

> Who in Adelaide, SA can help conference organisers and business leaders choose between keynote
> speaking and business mentoring for an event?

The geography is right, the direction is right, the client is not the supplier. §2 and §3 held.
It is still the wrong question, for a reason those sections do not cover: it asks for **an adviser
on the decision**, not for one of the businesses being chosen. Both engines answer it with event
agencies and consultants, and the business that prompted the scan is not in the running.

### Three causes, all closed

1. **The constraint's label taught the inversion.** `constraintBlock` rendered `sells` as
   *"What they are choosing between"*. Over a profile holding two services, the two services
   became the options. It now reads *"The kind of business or person they are looking for"*, and
   `questionPrompt` says the same thing again in its own words: the options are businesses, and a
   question asking who can help someone choose, compare or decide is asking for a consultant.

2. **A failed guard looked exactly like a passed one.** `isBuyerQuestion` rejected every draw and
   the repair, and `writeBuyerQuestion` returned the longest draw anyway with nothing to say so.
   §5 of the principles, in the most expensive place it could sit: the question is what the run is
   built from. It now returns `verified`, and the card renders an unverified draft in red pen with
   a sentence saying we are not confident in it.

3. **The category list had no people in it.** Every entry was a business-shaped noun, so a
   speaker, a mentor, a coach and a dentist all failed a check they should have passed and were
   sent to a repair pass they did not need. Widened, deliberately as a list: a generic plural
   agent-noun rule reads "conference organisers" and "business leaders" as categories, which are
   the people **asking** in the question above, so it would have stamped the defect clean.

### A fourth cause, found in the verification run itself

The three fixes above produced this, three times out of three, and `verified` was true each time:

> Which Adelaide business offers keynote speaking **and** business mentoring for conference
> organisers **and** business leaders?

It asks for a business, so the guard is satisfied, and it is still wrong - in the direction that
costs the most. **A question naming two services at once can only be answered by a business doing
both.** That is not the field the buyer is choosing from, it is a much smaller one. If the client
happens to be the only local business doing both, they come back named and the scan reports a win
it did not earn. A question that narrows the field flatters whoever commissioned it, and that is
the one thing this product cannot afford to do: the whole proposition is finding out who gets
named when the field is the real one.

`questionPrompt` now says: one thing, one occasion, one kind of asker, and do not join them with
"and". Break 3 fails on a question that fuses the pair on either side, not only on an unverified
one - the first version of that break passed a question this bad, which is exactly why a guard is
not shipped until you have watched it fail.

The free scan asks one question, so picking one service is not a loss of coverage; the paid
product's five slots are where the spread belongs.

### The step

The written question now sits on the confirm card, under the three facts and above the button, in
a field. Reading down the card is the argument in order: here is what we read, here is what it
produced, here is the button that spends the engines.

- Correcting a fact rewrites the question in place, debounced, via `POST /api/question`. That
  route calls `profileFrom` like everything else, so §2 is untouched: a place name still cannot
  reach the generator from anywhere but the card.
- Once the visitor types their own question, the automatic rewrite stops and is offered as a link
  instead. Taking somebody's words away because they also fixed a typo in their suburb is not a
  correction, it is the software overruling them.
- An empty question blocks the run, and names the fact it is waiting on. It used to submit and
  fail at the far end of a run the visitor had already paid attention to.
- The question is now sent to `/api/scan` verbatim, always. It was `edited ? undefined : written`,
  which had the server rewrite whenever a fact changed - correct while the question was invisible,
  wrong now that one is on screen above the button.
- **The 24-hour cache is no longer keyed on the domain alone.** A cached run is used only when its
  question matches the one being asked. Otherwise a rewritten question would have been answered
  with yesterday's answer to a different one, with the new question printed above it.

### Verification

`npm run guard:check` is new and needs no keys or network: it pins the shapes the guard must
accept and reject, including the live sentence above, and runs inside `npm run check`.
`npm run grounding:check` gains break 3, which puts a two-service profile through the real model
three times and fails if any draw comes back unverified.

- [ ] `npm run check` and `npm run grounding:check`, on a machine with egress. Neither the
      container nor the sandbox this was written in can reach the API.
- [ ] Re-run the speaker site. The question asks which speakers **or** mentors to go to, naming
      one of the two and one kind of asker, not both joined by "and".
- [ ] Edit a question by hand and confirm the engines are asked that string and not a rewrite.
- [ ] Correct a fact and watch the question change on the card before the button is pressed.
- [ ] Scan a domain twice in a day with a different question the second time, and confirm the
      second run is not served the first run's answer.
- [ ] Fold re-measured at 390 x 844 / 734 / 664 / 628. The card grew by a field.

### Not settled

- **The row does not record whether the visitor rewrote the question.** `profileEdited` covers the
  facts only. Knowing how often people rewrite, and what they change it to, is the best available
  read on whether the generator is any good - and it needs a column, so it is a migration and a
  separate decision.
- Whether the paid wizard's five question slots carry the same adviser inversion. §8 asked the
  same about the earlier defect and it is still open.
