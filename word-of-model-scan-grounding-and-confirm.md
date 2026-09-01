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
