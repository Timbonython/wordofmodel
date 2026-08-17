# Word of Model — Free Scan Build Spec v1
**1 August 2026 · Build target: Claude Code**

---

## What this is and why it comes first

The free scan is the growth engine, not a feature. Every cold email, ad and post opens with a real, specific, slightly alarming fact about the prospect's own business — and that fact costs you about four cents to produce.

**The job it does:** turn a stranger's domain into a moment where they realise they're invisible, then ask for their email to show them the rest.

It is not a demo of the product. It is the emotional trigger that makes the product make sense.

**Success measure:** scan-to-email-capture rate. Target 40%+. If it's under 20%, the result isn't alarming enough or the gate is asking too early.

---

## The user flow

```
1. Landing        →  one field: "Enter your website"
2. Detecting      →  we read their site, work out what they sell
3. Confirming     →  "You sell [X] to [Y] in [country]. Right?"  [Yes / Edit]
4. Running        →  live progress, ~30-45s, question shown on screen
5. The result     →  free portion, ungated
6. The gate       →  email for the full answer
7. The offer      →  subscribe
```

Steps 2–4 are the show. Do not hide them behind a spinner. Watching the question get written and the engines get queried is what makes the result feel earned rather than generated.

---

## Step 2 — Detect the business

Fetch the domain's homepage plus `/about` if it exists. Strip to text, cap at ~4,000 tokens.

One LLM call, cheap model, JSON only:

```
You are analysing a company website to prepare a buyer-intent search question.

From the text below, return ONLY this JSON, no preamble, no markdown:
{
  "brand_name": "the company's name as customers would say it",
  "what_they_sell": "plain, specific, max 10 words",
  "buyer": "who buys it, max 10 words",
  "country": "primary market, ISO country name",
  "category_term": "the phrase a buyer would search, max 6 words"
}

If the site is too thin to tell, set any unknown field to null.

SITE TEXT:
[...]
```

**Show the result and let them correct it.** Two reasons: accuracy, and the confirmation step is a micro-commitment that lifts completion. It's also the same approval mechanic as the paid onboarding, so the free scan teaches the paid product.

If `brand_name` or `category_term` comes back null, fall back to a manual two-field form rather than guessing. A wrong question destroys the credibility of the result.

---

## Step 3 — Write the question

One LLM call. This is the highest-leverage prompt in the product — the whole result rests on the question being one a real buyer would type.

```
Write ONE question that a real buyer would ask an AI assistant when they are
close to choosing a supplier of [what_they_sell] in [country].

Rules:
- Never mention [brand_name] or any brand name.
- Write it the way a busy buyer types, not the way a marketer writes.
- Make it specific enough that only a handful of companies could answer it.
- Include the country or region.
- One sentence. No preamble.

Return only the question.
```

Store the question. Display it on screen before running. **The user sees the question before the answer** — that's the credibility gate, borrowed from the paid audit.

---

## Step 4 — Run it

Two engines. Two, not five — five is the paid product.

| Engine | API | Why |
|---|---|---|
| ChatGPT | OpenAI Responses API, web search tool enabled | The name every prospect recognises |
| Perplexity | **Agent API** (`POST https://api.perplexity.ai/v1/agent`) | Genuinely first-party, cheap, citation-rich |

Both calls in parallel. Set the user's country in the request where the API supports it.

> **Correction, 10 Aug 2026.** This spec originally said "Sonar API". Perplexity has since folded
> Sonar Chat Completions into the **Agent API**. Use `POST https://api.perplexity.ai/v1/agent`.
> It takes an `input` parameter rather than a `messages` array, and returns a typed `output` array;
> citations come back as a `search_results` object inside `output`, not a flat `citations` array.
>
> **Critical for this product:** the Agent API is model-agnostic and can route to OpenAI, Anthropic,
> Google, xAI and others. You must explicitly pin **Perplexity's own Sonar model**. If it silently
> answers with someone else's model, the "Perplexity answer" is not a Perplexity answer and the whole
> methodology is void. Pin the model, log which model produced every capture, and surface it in the
> report's method note.


Run each answer through a scoring call:

```
Here is an AI assistant's answer to a buyer's question. Return ONLY this JSON:
{
  "target_mentioned": true/false,
  "target_recommended": true/false,
  "target_position": integer or null,
  "brands_named": ["in the order they appear"],
  "top_recommendation": "the brand pushed hardest, or null",
  "domains_cited": ["..."]
}

TARGET BRAND: [brand_name]
QUESTION: [question]
ANSWER: [verbatim answer]
```

Note the split between `target_mentioned` and `target_recommended`. That gap is the finding in every audit run so far and it must exist from day one.

---

## Step 5 — The free result

Ungated. Has to be strong enough to sting on its own.

**If they don't appear (the common case):**

> **You didn't come up.**
> We asked ChatGPT and Perplexity the question above.
> **7 companies were named. You weren't one of them.**
> ChatGPT recommended **[top_recommendation]** first.

**If they appear but aren't recommended:**

> **You were mentioned. You weren't recommended.**
> Named in 1 of 2 answers, position 5 of 7.
> **[top_recommendation]** was the recommendation both times.

**If they're recommended first (rare):**

> **Good news — you came up first on [engine].**
> But [other engine] didn't name you at all, and 6 competitors did come up.
> One question, two engines. The full picture takes twenty five.

Never fake a bad result. If someone genuinely wins, say so and sell the coverage gap instead. A scan that always says "you're invisible" gets found out in a week and the honesty is the whole brand.

---

## Step 6 — The gate

Held back behind an email address:

- The **verbatim answers**, word for word, both engines
- The **full list of brands named**, in order
- The **domains the AI cited** — who owns the answer
- The competitor who beat them, named

Single field, email only. No name, no company, no phone. Every extra field costs conversion and you can enrich later from the domain.

Deliver to the screen immediately *and* email it. The emailed version is what gets forwarded internally, which is free distribution.

---

## Step 7 — The offer

On the result page, under the reveal:

> That was one question and two engines.
> **Word of Model** runs five questions your buyers actually ask, across five AI platforms, every month — with the competitors ranked next to you and the three things to fix, in order.
> **USD 249/mo.** Founding rate USD 149/mo, first 20 subscribers, locked for 12 months.
> [Start my first report]

---

## Build notes

**Stack:** Next.js on Vercel is enough. Server actions for the API calls, streamed progress to the client. No database needed at v1 beyond a scans table (domain, email, question, result JSON, timestamp) — Supabase or Postgres.

**Timing:** web-search calls run 10–30s each. Run in parallel, stream progress. Never show a bare spinner for 45 seconds.

**Cost per scan:** roughly USD 0.03–0.06. Two web-search calls dominate.

**Abuse control:** one scan per domain per 24 hours, cached and re-served. Rate limit by IP. Both are cost control and they make the cache a feature — a repeat visitor sees their previous result and the change.

**Store everything.** Every scan is a prospect record and a datapoint. Over a few hundred scans you own something nobody else has: a cross-industry picture of who AI actually recommends. That becomes content, and content is how this gets found.

**Do not build:** accounts, dashboards, Stripe, or the paid product. Not yet. The scan works standalone and feeds a waitlist if it has to.

---

## Sequence after this

1. Free scan (this doc)
2. One-page site and copy, wrapped around the scan
3. Stripe + the onboarding wizard (same approval mechanic as steps 2–3 above)
4. Report template and imagery
5. Ad copy and launch

Report imagery and ad copy stay last. They're the easiest things on the list and the least load-bearing.

---

## Handoff

This is a Claude Code job — it's a build, not a scheduled task. Tiger Claw is the wrong tool here.

Tiger Claw earns its place *after* launch: a daily digest of new scans and captured emails into Slack, so you see prospects the morning they arrive rather than when you next log in.
