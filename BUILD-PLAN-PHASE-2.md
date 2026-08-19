# Word of Model — Phase 2 build plan
**Locked 10 Aug 2026.** Tim is expecting subscribers immediately, so the concierge path is skipped
and the paid flow gets built now. Market priority: **US first, Australia second.**

Phase 1 (done): free scan, one-page site, waitlist, report template, live on wordofmodel.ai.

---

## LOCKED: the engine set

**Monthly, five surfaces, all API or licensed. Frozen.**

| Surface | Route | US MAU share |
|---|---|---|
| ChatGPT | OpenAI Responses API + web search | 51.3% |
| Gemini | Google API | 27.7% |
| Grok | xAI API + Web Search, model pinned | 2.8% |
| Perplexity | Agent API, pinned to `perplexity/sonar` | 2.0% |
| Google AI Overviews | SERP provider (licensed) | Google Search surface, not in MAU tables |

**Quarterly, two more, hand-run and supervised: Claude (10.3% US) and Microsoft Copilot (1.3% US,
17% AU).** Neither can be captured automatically without substituting a different system and calling
it their answer. That substitution is the one thing this product cannot do.

**Why frozen now:** there are zero subscribers, so this is the only moment the set can change for free.
Every change after the first reports ship resets the Share of Model baseline and destroys comparability.

**Not included, decided:** DeepSeek (0.4% US, nil AU). Copilot has no sanctioned API — Microsoft
retired the Bing Search APIs on 11 Aug 2025, and Azure "Grounding with Bing Search" returns *your own
agent's* answer, not Copilot's. Using it would be the same error as calling the Anthropic API "claude.ai".

**The reframe that justifies all of this:** we measure *surfaces*, not models. Copilot runs mostly on
OpenAI models and still answers differently to ChatGPT, because the index and the system prompt differ.
Competitors selling "12 models covered" are measuring the wrong noun.

---

## Scaling the hand-run tier: one operator, one account, supervised

**Rejected: multiple accounts and multiple unattended agents.** Creating accounts to get around rate
limits is a terms violation by design, it risks bans that would leave paying subscribers with no report
mid-cycle, and it is indefensible for a brand sold on methodological honesty. One leak and the bot farm
is the story, not the product.

**The legitimate version:** one operator (Tim), one account per surface, supervised, low volume,
quarterly. The queue-worker automates the mechanics — claim job, drive browser, capture verbatim text
and screenshot, post back — so it is ten minutes of attention instead of two hours. Tim starts it and
is present.

**When quarterly demand exceeds one supervised operator, the answer is price or cap, not more accounts.**
The quarterly deep read is the premium tier. If it sells out, it is underpriced.

**Hard rule:** claude.ai captures never run on a logged-in account of Tim's. The Rod Buchecker audit
leaked the Frame exit and Reframe's target market into two answers. Dedicated clean profile, logged out.

---

## Cost at scale

5 questions x 5 surfaces = 25 captures/subscriber/month. ChatGPT dominates but is only 5 of the 25.
Grok adds ~$0.03/subscriber/month (Web Search $5/1k calls plus tokens). AI Overviews via SERP provider
is cents. All in: roughly **$3-6 per subscriber per month against $149**. About 3% COGS.

---

## Build sequence — discrete Claude Code sessions

Keep them separate. A single long session drifts.

### Session 1 — Data model, provenance, auth
- Scope model: `account` -> `scope` -> `questions` / `competitors` -> `runs` -> `captures`.
  A scope is one category, one market, one buyer. A solo subscriber is an account with one scope.
- **Provenance columns on `captures`: `capture_method` (`api` | `serp` | `browser`), `engine`,
  `model_used`, `operator`, `captured_at`.** This is what makes the monthly and quarterly merge cleanly
  and what feeds the method note honestly.
- Magic-link auth (Supabase Auth). No passwords.
- RLS on every table. Subscribers read only their own rows.

### Session 2 — Wizard and Stripe
Follow `wordofmodel-onboarding-billing-spec.md` exactly.
- Wizard: domain -> detect -> confirm -> propose 5 questions across the fixed slots -> propose
  competitors -> approve or edit.
- **They approve their questions before they pay.** The approval is the sell. Do not invert it.
- Stripe: `founding_monthly` USD 149, `standard_monthly` USD 249. Counter of active-or-ever founding
  subscriptions; under 20 uses founding, at 20 switches silently. Show the true remaining count.
- Webhooks: subscription created / updated / cancelled, payment failed.
- Customer Portal. Cancellation no harder than signup.

### Session 3 — The monthly run pipeline
- 5 questions x the five locked surfaces. Grok included from day one.
- Every engine call records the answering model. `lib/env.ts` already refuses non-Sonar Perplexity
  models; apply the same discipline to Grok.
- SERP provider for AI Overviews. **Before committing, test two providers on five real US buyer
  questions with geo-targeting and compare against a clean logged-out browser.** Do not pick from a
  vendor comparison table.
- Idempotent and resumable. A failed engine retries without re-running the rest.
- Per-capture cost and tokens stored.

### Session 4 — Report, delta, delivery
- Generate from `wordofmodel-report-template.html` with real data.
- **Delta reporting.** What moved since last month: mentions gained or lost, competitors who overtook,
  new domains in the citation set. Without this, month two has nothing to say and they churn.
- Method note prints the surfaces, the models that answered, and which were API, SERP or hand-read.
- Deliver by email and at a per-account URL behind magic-link auth.

### Session 5 — Operations
- Monthly scheduler per subscriber, staggered.
- Failure alerts to Tim. A silent failed run is a churned customer.
- Admin view: subscribers, runs, failures, spend.
- Daily digest of new scans, waitlist signups and subscriptions.

### Session 6 — The quarterly capture worker
- `capture_jobs` table: scope, question, engine, status, `worker_id`, `claimed_at`.
- Local worker on the Mac mini claims jobs atomically, drives Chrome, captures verbatim text plus a
  screenshot to Supabase Storage, posts back, marks done. Stale claims revert to pending.
- Its own Supabase secret key, separately revocable.
- Clean logged-out profile. Supervised runs only.

---

## Non-code work, in parallel

- **Stripe account** on the sole trader ABN. Start now; verification can take a day.
- **Terms of service and privacy policy** before the first charge.
- **GST watch.** 20 founding subscribers is roughly AUD 55k/year. Registration triggers at AUD 75k
  *projected* turnover, so around subscriber 27, sooner at $249. Tell the accountant now.
- **EU/UK VAT** on digital services to consumers can trigger regardless of Australian turnover.
- **Unfair Trading Practices Bill** (applies 1 Jul 2027): renewal notices, upfront term disclosure,
  cancellation no harder than signup. Build in now.
- **Trademark search** on Word of Model, still parked.

---

## Copy already updated (10 Aug 2026)

`wordofmodel-site-copy.md` now carries: the new five in Section 5 step 4, a step 6 for the quarterly,
a quarterly line in Section 4 and Section 8, and two new FAQ entries — why those five, and the
"isn't Copilot just ChatGPT" surface-versus-model explanation. Copy rules verified: no em dashes,
never says "AI visibility".

## What "live" means

A stranger types their domain, gets a scan, gives an email, claims a founding place, approves five
questions, pays $149, and receives a real report a month later without Tim touching anything.
Sessions 1-4 get you there. Session 5 keeps it there. Session 6 adds the quarterly.

---

## Progress

**Session 1 — DONE, 10 Aug 2026.** `supabase/migrations/0002_accounts_scopes.sql` (379 lines), seven new
tables, all four review changes plus the `capture_method='browser'` requires `operator` check. Engine
check carries the locked seven; `calibration` added to `runs.period`. `competitors` has `added_at`,
`removed_at`, `source`, with a partial unique index so a removed competitor can be re-added. Delta
constraint documented in the migration and CLAUDE.md. Magic-link auth entirely server-side
(`lib/auth.ts`, magic-link and callback routes, `proxy.ts` — Next 16 renamed `middleware.ts`).
`scans`, `waitlist`, `rate_events` untouched; free scan verified still streaming from cache.

**Note:** `SUPABASE_PUBLISHABLE_KEY` is now required (server-side only, not `NEXT_PUBLIC_`). Auth
changed that; it genuinely wasn't needed for the scan-only build.

**Session 2 — DONE, 19 Aug 2026.** `supabase/migrations/0003_billing.sql` (subscriptions,
stripe_events, three columns on scopes). Wizard at `/start`: detect, confirm, four competitors, five
questions with per-slot rewrite, approve, pay. Approval is written before the Checkout Session, not
after. Stripe test mode, two prices by lookup key, `npm run stripe:setup` creates product, prices and
portal configuration. Webhooks for checkout completed, subscription created/updated/deleted and
payment failed, idempotent through `stripe_events` and guarded against out-of-order delivery.
Customer Portal at `/account` behind magic link, plan switching off, cancel at period end. True
founding count on the pricing block and in the wizard. Free scan untouched and verified.

Site copy rebuilt from the updated `wordofmodel-site-copy.md`, copied in from the Cowork folder: the
locked five in Section 5 step 4, step 6 for the quarterly, the quarterly line in Sections 4 and 8, and
both new FAQ entries. `npm run copycheck` clean.

`wordofmodel-onboarding-billing-spec.md` amended twice: slot 2 of the generation prompt now
interpolates `[buyer]`, and the step 5 confirmed copy no longer puts Claude in the monthly run.

**Found while testing: Stripe Managed Payments is on by default on new accounts** and forces
`automatic_tax` on. Turned off per the spec's deliberate tax decision. It is also a plausible answer
to the EU/UK VAT question this plan parks, so it is worth ten minutes with the accountant alongside
that one.
