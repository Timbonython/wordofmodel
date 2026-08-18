# Word of Model — Onboarding & Billing Build Spec v1
**1 August 2026 · Build target: Claude Code**

---

## The one decision that shapes everything

**They approve their five questions before they pay.**

The obvious build is pay-then-configure. Don't. Three reasons:

1. **The wizard is the sell.** By the time someone has read five questions written for their business and rewritten one of them, they are invested. Asking for a card at that point converts far better than asking for it cold.
2. **The approval gate is the credibility mechanism.** It's the thing no competitor does. Putting it behind the paywall hides your differentiator from everyone who hasn't bought yet.
3. **You never take money you can't deliver on.** If the generator can't produce five decent questions for a business, you find out before there's a subscription attached to it.

The obvious objection is that people take the questions and run them themselves. Some will. They were never going to buy. The free scan already gives away more than this.

---

## The flow

```
Free scan result
      ↓
1. Confirm the business          (prefilled from the scan)
2. Confirm the competitors        (we propose 4, they edit)
3. Approve the five questions     (we propose 5, they edit)
4. Pay                            (Stripe Checkout)
5. Confirmed                      (report date stated)
```

Anyone arriving without a scan starts at step 1 with an empty domain field and runs the detection then. Never make the scan compulsory, but always offer it.

---

## Step 1 — Confirm the business

Prefill everything from the free scan record if there is one.

**Fields:** brand name · what you sell (one line) · who buys it (one line) · primary market (country) · website

**Copy:**
> ### First, let's make sure we've got you right
> We read your website. Correct anything we got wrong - this is what the questions get built from.

*Builder: an editable form, not a confirmation screen. Every field open by default. People correct things they can see are wrong and skip past things they'd have to click to reveal.*

---

## Step 2 — Confirm the competitors

Propose four. One LLM call, web search enabled, JSON only.

```
Find the four companies most likely to be recommended INSTEAD of [brand]
to a buyer of [what_they_sell] in [country].

Prefer companies that actually appear in AI answers and review sites for
this category. Do not include [brand]. Do not include companies that only
serve a different market or a different size of customer.

Return ONLY: {"competitors": ["", "", "", ""], "reasoning": "one sentence"}
```

**Copy:**
> ### Who are we measuring you against?
> These are the four we'd expect to show up in your category. Swap any of them out - you know your market better than we do.

Allow 3 to 6, default 4. Free text with an add/remove list, not a locked set.

**Why this screen earns its place:** it routinely surfaces a competitor the customer didn't know they had. That's the second small shock after the free scan, and it happens before the card.

---

## Step 3 — Approve the five questions

The heart of the product. Generate against a fixed structure rather than freehand, so every subscriber's report is comparable month to month and client to client.

### The five slots

This is the IP. Every audit run so far has used this shape, and it works because each slot fails differently.

| Slot | What it asks | What it exposes |
|---|---|---|
| **1. The category question** | Who's best at [category] in [market] | Whether you exist in the default answer |
| **2. The situation question** | A buyer describing their actual circumstance and asking what to do | Whether you exist at the point of need. Usually the worst score, and the most important |
| **3. The alternatives question** | What are the alternatives to [biggest competitor] | Whether you're in the consideration set of people already shopping |
| **4. The how-do-people question** | How do [buyers] usually handle [problem] | Whether you own the category explanation, or someone else does |
| **5. The branded question** | Is [brand] any good, and what do people say | What gets said when your name is the prompt. Nearly always 100%, and that's the point - it's the control |

Slot 5 is the control condition, and the gap between slot 5 and slots 1 to 4 is the headline finding in every report. Never drop it and never count it in the unbranded score.

### Generation prompt

```
Write five questions a real buyer would ask an AI assistant while choosing
a supplier of [what_they_sell] in [country]. Follow this structure exactly:

1. CATEGORY: who is best at [category_term] in [country]
2. SITUATION: written in first person by a buyer describing their actual
   circumstance, then asking what they should do or who they should use
3. ALTERNATIVES: what are the alternatives to [largest_competitor]
4. HOW-DO-PEOPLE: how do [buyer] usually handle [the problem being solved]
5. BRANDED: is [brand] any good, and what do people say about it

Rules:
- Only question 5 may mention [brand].
- Write the way a busy buyer types, not the way a marketer writes.
- Name the country or region in questions 1 to 4.
- One sentence each. No preamble.

Return ONLY: {"questions": [{"slot": 1, "text": ""}, ...]}
```

**Copy:**
> ### These are the five questions we'll ask every month
> Read them like a customer would. If one of them sounds like something nobody would ever type, change it - the whole thing is worthless if you don't believe the questions.

Every question editable in place. A "rewrite this one" button that regenerates a single slot while keeping the others. Show the slot label next to each so the customer can see the structure is deliberate.

**Lock on payment.** Questions are fixed after the first payment, and changing them resets the trend line. Say so plainly on this screen:
> Once we start, these stay put. Comparing month to month only works if the question doesn't move.

Allow changes later via support, with a clear warning that history won't be comparable.

---

## Step 4 — Pay

Stripe Checkout, hosted. Don't build a card form.

### Stripe setup

**One product:** `Word of Model — Monthly Report`

**Three prices:**

| Price | Amount | Interval | Use |
|---|---|---|---|
| `standard_monthly` | USD 249 | month | Default |
| `founding_monthly` | USD 149 | month | First 20 subscribers, applied automatically |
| `standard_annual` | USD 2,490 | year | Offered at checkout only |

**Founding-rate logic:** a single counter of active-or-ever subscriptions on `founding_monthly`. Under 20, the wizard uses the founding price. At 20, it silently switches to standard. Show the true remaining count on the pricing block and in the wizard - if it's real, it's persuasive, and if it isn't, someone will screenshot it.

The founding price is locked for twelve months by virtue of being a normal recurring price. Diarise the twelve-month rollover per subscriber; at month 11 send a plain email saying the founding rate is ending and what happens next. Never quietly reprice.

**Settings:**
- No trial. The free scan is the trial.
- Cancellation: at period end. They get the report they paid for. No pro-rata refunds.
- Failed payments: Smart Retries on, four attempts, then pause report generation and email. Don't cancel automatically.
- Customer portal: on. Card updates and cancellation self-serve, so billing never lands on you.
- Billing anchor: signup date. Keep the billing date and the report date on the same day of the month so nobody ever pays for a month with no report in it.

### Tax

Not GST-registered, so no Australian GST is charged. Configure Stripe Tax off deliberately rather than by accident, and keep the setting documented.

**Flag for the accountant before the first overseas sale:** selling digital services to consumers in the EU and UK can create a VAT registration obligation in those places regardless of Australian turnover, and the thresholds are low or nil. B2B sales are usually handled by reverse charge, which is a different answer. Worth ten minutes of advice now rather than a surprise at fifty subscribers.

---

## Step 5 — Confirmed

**Copy:**
> ### You're in. First report lands [date].
> We'll run your five questions across ChatGPT, Gemini, Perplexity, Claude and Google's AI answers, and you'll have the whole thing - numbers, competitors, verbatim answers, and three things to do - in your inbox on [date]. Same date every month after that.
>
> Nothing needed from you in the meantime.

Send the same thing by email immediately. That email is the receipt people go looking for.

---

## Data model

Minimum viable. Postgres or Supabase.

```
scans          id · domain · detected_json · question · result_json
               · email · created_at

subscribers    id · email · brand_name · what_they_sell · buyer
               · country · website · stripe_customer_id
               · stripe_subscription_id · price_id
               · report_day (1-28) · status · created_at

competitors    id · subscriber_id · name · position

questions      id · subscriber_id · slot (1-5) · text
               · locked_at

runs           id · subscriber_id · run_date · status
               · results_json · report_url

captures       id · run_id · question_slot · engine
               · answer_text · named bool · recommended bool
               · position int · brands_named jsonb · domains_cited jsonb
```

`captures` is the important one. Verbatim answer text stored per engine per question, forever. It's the evidence, it's what makes the trend line possible, and in aggregate it becomes the only dataset of its kind you'll own.

**Report day:** cap at 28 so nobody's report date breaks in February.

---

## The monthly run, while it's still hand-run

Onboarding has to produce something you can actually work from.

**Generate a run brief per subscriber:** brand, market, competitors, the five questions verbatim, last month's numbers, and the previous month's report URL. One page, ready to run against.

**Queue view:** every subscriber whose report is due in the next seven days, ordered by date, with a status you can mark off.

**Capture entry:** a plain paste-in form - question, engine, answer text - that writes to `captures` and runs the scoring call automatically. Don't score by hand. Paste, and let the model extract named/recommended/brands/domains, then eyeball it.

That last piece is what keeps twenty minutes at a time viable. The bit that would eat your evening is scoring, not reading.

---

## Build order inside this phase

1. Stripe products, prices, Checkout, webhook handling, customer portal
2. Steps 1 to 3 of the wizard, writing to the data model
3. Confirmation email
4. Run brief + queue view + capture entry (your tooling, but it's what makes the promise deliverable)
5. Report generation from the HTML template

Skip for now: accounts and login (magic link to the report URL is enough), dashboards, team seats, white-label, annual-to-monthly switching.

---

## Handoff

Claude Code builds all of this.

Tiger Claw earns its place the day the first subscriber signs: a Slack message each morning listing reports due in the next seven days, and a ping when a new subscription or a failed payment comes through. Scheduled, cross-app, small - exactly its shape.
