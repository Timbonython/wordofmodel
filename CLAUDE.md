# Word of Model — build set

Recovered 10 Aug 2026 from the claude.ai chat "Automating AI visibility audit subscriptions"
(project Tim's Clone). All seven artifacts were built 1 Aug 2026 and existed **only** inside that
conversation until now.

## Settled

- **Name:** Word of Model. Domains registered: .com, .com.au, .io, .ai
- **Entity:** Timothy Pearce, registered sole trader with an ABN. Not GST-registered
  (under the AUD 75k threshold; watch it at ~15 subscribers, since the trigger is *projected* turnover)
- **Price:** USD 249/mo. Founding rate USD 149/mo for the first 20 subscribers, locked 12 months
- **Surfaces:** seven, locked 10 Aug 2026. See the surface set section below. The old
  "five, including claude.ai" line was wrong and has been corrected
- **The metric pair:** Share of Model = how often you're named. Word of Model = what's actually being said

## Files

| File | What it is |
|---|---|
| `wordofmodel-offer-sheet.md` | Tiers, what lands in the inbox monthly, onboarding flow, free scan. The commercial spine |
| `wordofmodel-free-scan-spec.md` | Scan flow, prompts, engines, email gate. **Build this first** |
| `wordofmodel-site-copy.md` | Page copy, sections 1–10, plus the copy rules block |
| `wordofmodel-report-template.html` | The design system. IBM Plex, highlighter on competitors, red pen on absence |
| `wordofmodel-onboarding-billing-spec.md` | Stripe, the wizard, the five question slots, founding-rate counter logic |
| `wordofmodel-ad-copy.md` | Meta, LinkedIn, Google Search, cold email, organic, retargeting |
| `wordofmodel-site.html` | Static one-pager. Scan field wired to a waitlist, `// TODO` where the POST goes |

Both HTML files are fragments (no `<html>`/`<body>` wrapper) — they start at `<meta>` and render
fine as-is. Drop `wordofmodel-site.html` in as `index.html` and it works.

## Next move

Claude Code on the free scan. **The site and the scan are one build, not two** — the scan is the
hero of the page.

Gather first (~30 min, this is the actual blocker):

- OpenAI API key (Responses API with the web search tool)
- Perplexity Sonar API key
- Supabase project, free tier, for the `scans` table
- Resend account for the result email
- Vercel account and a GitHub repo
- Point wordofmodel.ai at Vercel

Then, in an empty repo with the three specs dropped in the root first:

> Build a one-page marketing site with a working free scan tool. Next.js App Router, deployed to
> Vercel, Supabase for storage, Resend for email. Follow these exactly:
> `wordofmodel-free-scan-spec.md` (scan flow, prompts, engines), `wordofmodel-site-copy.md`
> (page copy and copy rules), `wordofmodel-report-template.html` (design system — take the palette,
> the IBM Plex stack and the markup device and carry them onto the site so the two feel like one
> product). Build order: the scan working end to end first, then wrap the page copy around it.
> Where the wizard will go, put a waitlist email capture instead. No Stripe, no accounts, no dashboard.

## Open

- Trademark search on Word of Model. Parked 1 Aug, worth clearing before ads run
- EU/UK VAT on digital services to consumers can bite regardless of AU turnover. Ten minutes with the accountant before the first overseas sale
- **At ten subscribers, stop selling and automate collection.** The copy promises 25 answers a month per subscriber
- Rod Buchecker is the clean warm first subscriber. Tim is handling him manually as a separate deal
- winem8 is Frame work — leave alone while negotiating out of Frame

---

## Credentials (added 10 Aug 2026)

### Perplexity
Sonar Chat Completions is now the **Agent API** — `POST https://api.perplexity.ai/v1/agent`.
The Search API returns raw links and is the wrong product. See the correction note in the free scan spec.
**Pin Perplexity's own Sonar model** — the Agent API can route to OpenAI/Anthropic/Google/xAI, and an
answer from someone else's model is not a Perplexity answer.

### Supabase
Supabase replaced the legacy `anon` / `service_role` keys with **publishable** (`sb_publishable_...`)
and **secret** (`sb_secret_...`) keys. Legacy keys still work but are deprecated by end of 2026, so
start on the new ones.

This build talks to Supabase **only from the server** (Next.js server actions), so:

- **Secret key — required.** Create one, name it `wordofmodel-vercel`. Server-side only; it returns
  401 if ever used from a browser.
- **Publishable key — required as of the phase 2 data model session.** Magic link auth uses it, on the
  server, in `lib/auth.ts`. It is RLS bound and safe to expose, but nothing in this build talks to
  Supabase from a browser and that is worth keeping, so the variable is `SUPABASE_PUBLISHABLE_KEY`
  and deliberately **not** `NEXT_PUBLIC_`.

Secret keys can be created per-component and revoked individually. Deleting one is irreversible.

**Security note that matters here:** the `scans` table holds prospect email addresses. Enable Row Level
Security on it with **no public policies at all**. The secret key bypasses RLS, so the server still works,
and nothing else can read it even if a publishable key is exposed later.

### Environment variables

`.env.local` locally, and the same set in Vercel → Project → Settings → Environment Variables.
Never commit this file; make sure `.env*` is in `.gitignore`.

```
OPENAI_API_KEY=sk-...
PERPLEXITY_API_KEY=pplx-...
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
RESEND_API_KEY=re_...
```

---

## Canonical domain (decided 10 Aug 2026)

**`wordofmodel.ai` is the canonical domain.** All specs, the site and the report template now use it.

Tim owns wordofmodel .com, .com.au, .io and .ai. Point the other three at .ai with a 301 redirect
rather than leaving them parked — .com is what people type from memory, and a redirect costs nothing.
Vercel handles this natively: add each domain to the project and set it to redirect to the .ai apex.

**Watch for:** a Resend sending domain was briefly set up on `shareofmodel.ai` by mistake. Remove it so
it doesn't sit half-verified, and confirm the Cloudflare zone with the nameserver change is the one for
`wordofmodel.ai`.

**Naming discipline worth holding:** *Share of Model* is the metric — the neutral measure that goes in
the report. *Word of Model* is the brand. Keep them separate; if the brand becomes the metric name, the
number reads as marketing rather than measurement.

---

## Email configuration (10 Aug 2026)

Sending domain `wordofmodel.ai` is **verified in Resend**. DKIM, SPF and DMARC are live in Cloudflare.

- **From:** `results@wordofmodel.ai`, display name **Word of Model**. Not a mailbox — Resend sends as
  any address on the verified domain, so nothing needs creating. Never use `noreply@`; it filters harder
  and reads as a machine.
- **Reply-to:** `hello@wordofmodel.ai`, forwarded to Tim's real inbox via Cloudflare Email Routing.
  People reply to scan results — the emailed report is meant to be forwarded internally, and that is
  exactly when someone hits reply. A bounce there loses a warm lead at the best possible moment.
- Cloudflare Email Routing MX/SPF sit on the **apex**; Resend's sit on **`send`**. No conflict.
- Replying *as* the brand needs Gmail → Settings → Accounts → Send mail as, using Resend's SMTP
  credentials. Not needed until there are subscribers to reply to.

## Rules that came out of defects (21 Aug 2026)

**A guard that is not the last word is not a guard.** `upsertScope()` refused to touch a scope
with runs, and the caller undid it one line later: `writeCompetitors()` and `writeQuestions()`
ran against the returned scope anyway, and the question upsert rewrote a question's text while
keeping its id. The check existed, was correct, was documented, and protected nothing, because
the thing it protected was written by somebody else two lines down. The fix is to refuse the
whole operation at the top rather than to defend one table in the middle. When a guard and the
write it guards are in different functions, the guard is a comment.

Same shape, twice more in the same session: `writeQuestions()` carried a comment asserting no
captures could exist, which was true of the scope row and false of the function underneath it;
and `sendOpsAlert()` swallowed its own failures correctly and recorded nothing, so a working
alert and a dead one were indistinguishable. **State a guarantee only where the code enforces
it, and record the outcome of anything allowed to fail quietly.**

**Delivery lives in the five minute sweep, not the daily batch** (21 Aug 2026). A subscriber
paying at 07:00 UTC should not wait until 06:00 the next morning for a report that finished in
thirteen minutes. The sweep settles the run, fires extraction, and the next pass delivers:
about twenty minutes from payment. `runsAwaitingReport()` refuses any run still being read -
a report built mid-extraction is not incomplete, it is wrong, because unextracted captures are
excluded from the score. The daily pass no longer delivers; it alerts on anything complete and
unsent for six hours, which is the failure the speed would otherwise hide.

---

**Deliverability rule to hold:** wordofmodel.ai is the *transactional* domain — it delivers the product.
When cold email starts (see the ad copy file), send it from a **separate subdomain or domain** so a spam
complaint on outreach can never poison the address that delivers scan results.

**THE ALERT CHANNEL NEVER LIVES ON THE DOMAIN IT MONITORS. Settled 21 Aug 2026, permanent.**

`ALERT_EMAIL` is `therealtimpearce@gmail.com`. Not `hello@wordofmodel.ai`, which is what it was until
that date, and not a Frame address either.

On 17 Aug 2026 `hello@wordofmodel.ai` bounced `550 5.1.1 Address does not exist` three times, rejected
by Cloudflare's own MX (`route3.mx.cloudflare.net`) because Email Routing had no rule behind it yet —
the zone had gone live at 07:47 UTC and the tests ran at 09:19. `info@` bounced the same way. That
address is simultaneously the reply-to on every subscriber email **and** where every operational alert
was going, so one routing fault would have taken out the address a customer replies to and the means of
finding out about it, from a single cause. Every alert this build watched fire during Session 4 would
have looked identical from inside the code if the address had still been dead: Resend accepts, the 550
arrives later, and `sendOpsAlert` swallows failures by design.

It is not a stopgap until the routing is healthy. Moving it back afterwards rebuilds the same single
point of failure. Gmail is chosen over a Frame address on purpose as well: Word of Model is being kept
outside Frame, so its operational mail should not be entangled with Frame's, and Gmail already supplies
what a Frame address would — another provider, another domain, another failure mode.

Enforced in three places: `lib/env.ts` warns whenever `ALERT_EMAIL` shares a domain with `RESEND_FROM`,
`.env.example` carries the reasoning, and this paragraph.

**And accepted is not delivered.** `ops_alerts` (0011) records every alert attempt with Resend's message
id; `npm run alerts` takes each id back to Resend and prints the real delivery event. A row saying `sent`
next to an event saying `bounced` is exactly the pair that was invisible in August.

**Email Routing state, probed 21 Aug 2026.** Cloudflare now answers `250` at RCPT for `hello@`, `info@`
and invented addresses alike, so a catch-all is in place and nothing bounces. **Acceptance is not
forwarding**: a catch-all whose action is *Drop* accepts mail and silently discards it, which for a
reply-to is worse than a bounce, because the customer believes they were heard and nothing tells anyone
otherwise. Confirm in the dashboard that `hello@` has an explicit rule to a **verified** destination and
that the catch-all forwards rather than drops.

Redirect-only domains (.com, .com.au, .io) send no mail: give each `v=spf1 -all` plus a DMARC record so
they can't be spoofed.

---

## The locked surface set (10 Aug 2026)

Canonical source: `BUILD-PLAN-PHASE-2.md` in "Tim's Clone/Word of Model". The earlier
"five engines including claude.ai" line in this file predated the decision and was wrong.

**Monthly — five surfaces, all API or licensed.**

| Surface | Route | Method |
|---|---|---|
| ChatGPT | OpenAI Responses API + web search | `api` |
| Gemini | Google API | `api` |
| Grok | xAI API + Web Search, model pinned | `api` |
| Perplexity | Agent API, pinned to `perplexity/sonar` | `api` |
| Google AI Overviews | licensed SERP provider | `serp` |

Grok is in from day one.

**Quarterly — the five above plus two, hand run and supervised.**

| Surface | Route | Method |
|---|---|---|
| Claude | browser, clean logged out profile | `browser` |
| Microsoft Copilot | browser. No sanctioned API exists | `browser` |

**The rule, and it is the one thing this product cannot break: a surface is only ever recorded
from itself.** We never run a different system and file the answer under a surface's name. Azure
"Grounding with Bing Search" returns your own agent's answer, not Copilot's; the Anthropic API is
not claude.ai. Both substitutions would be the same error, and either one makes the whole
methodology void. That is why Claude and Copilot are browser only and quarterly, not because the
automation was hard.

We measure **surfaces, not models**. Copilot runs largely on OpenAI models and still answers
differently to ChatGPT, because the index and the system prompt differ. Competitors selling
"12 models covered" are measuring the wrong noun.

**Frozen because there are zero subscribers.** This is the only moment the set can change for free.
Every change after the first reports ship resets the Share of Model baseline and destroys
comparability. Not included, decided: DeepSeek.

`claude` captures never run on a logged in account of Tim's. The Rod Buchecker audit leaked the
Frame exit and Reframe's target market into two answers.

---

## Phase 2, session 1: data model, provenance, auth (done)

`supabase/migrations/0002_accounts_scopes.sql`. Paste into Supabase → SQL Editor, after 0001.
It adds only new tables. `scans`, `waitlist` and `rate_events` are untouched and the free scan
runs exactly as before.

**Shape:** `accounts` → `scopes` → `questions` / `competitors` → `runs` → `captures`, plus
`capture_jobs`. A scope is one category, one market, one buyer. A solo subscriber is an account
with exactly one scope.

**Things decided in the schema that are easy to get wrong later:**

- `accounts.id` is **not** `auth.users.id`. `auth_user_id` is a nullable join, so deleting a login
  unlinks it and leaves the account, its subscription and its evidence standing.
- `captures` is keyed `(run_id, question_id, engine, capture_method)`. A quarterly run captures the
  same question on the same surface twice, once by API and once by hand, and the calibration
  depends on both rows existing.
- `capture_method = 'browser'` requires `operator`. A hand read answer with nobody's name against
  it is not evidence.
- `captures.question_id` is `on delete restrict`. A question that has been asked cannot be deleted
  and take its evidence with it. Changing a question means a new row.
- `runs.period` includes `calibration` alongside `monthly` and `quarterly`: the API versus browser
  run that documents the delta for the methodology page. Never count it in a trend line.

**For the session that builds delta reporting.** `competitors` carries `added_at`, `removed_at` and
`source` (`proposed` | `subscriber_added`). If a subscriber adds a competitor in month three, the
delta report must not show it as newly overtaking them. That is a configuration change, not a market
change. Either restrict the comparison to competitors present across the whole span, or report the
configuration change as its own line, separately from movement. Same for a removal.

**Auth.** Supabase magic link, no passwords, entirely server side. `lib/auth.ts`,
`app/api/auth/magic-link/route.ts`, `app/auth/callback/route.ts`, and `proxy.ts` for the session
refresh. An account is created on first successful login by the `on_auth_user_created` trigger,
with `ensureAccount()` as a second belt in the callback.

The callback accepts both `token_hash` + `type` and a PKCE `code`. Prefer the token hash template,
because PKCE only works when the link is opened in the browser that asked for it and people request
on a laptop and read mail on a phone:

```
{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=signup
```

for **Confirm signup**, and the same with `type=magiclink` for **Magic Link**. Both templates,
not one: `shouldCreateUser` is on, so a brand new subscriber gets the signup email and a
returning one gets the magic link, and half the subscribers dead-end if only one is changed.

`{{ .RedirectTo }}` rather than `{{ .SiteURL }}/auth/callback`, and that is the correction.
The route sets `emailRedirectTo` to `/auth/callback?next=%2Faccount`, and `.SiteURL` throws it
away: the link still signs them in, then lands them on the homepage instead of their account.
`.RedirectTo` is that URL with the `next` still on it, which is why the token hash is appended
with `&` rather than `?`. Any future caller of `signInWithOtp` must therefore pass an
`emailRedirectTo` that carries a query string, or the `&` has nothing to attach to.

`type` is passed straight to `verifyOtp` by `app/auth/callback/route.ts` with no whitelist and
`email` as the default, so `signup`, `magiclink` and the generic `email` all verify. The
specific ones are used here because they cannot be wrong for their template.

**RLS.** On every new table. Read only, `to authenticated` only, own account only, routed through
`public.current_account_id()` so team seats later are a change to one function rather than to eight
policies. No insert, update or delete policies anywhere; every write is the server on the secret
key. Nothing is granted to `anon`. `capture_jobs` has RLS and **no policy at all** — it is the work
queue, and worker ids and failure counts are not subscriber data.

**Still to do by hand in the Supabase dashboard:** enable the email provider and magic link, set the
redirect allowlist to include `https://wordofmodel.ai/auth/callback` and the local equivalent, and
set the magic link email template to the token hash URL above.

**Next.js note.** Next 16 deprecated `middleware.ts` and renamed it `proxy.ts`. The session refresh
lives in `proxy.ts` at the repo root, and its matcher deliberately excludes `/api/scan`,
`/api/detect`, `/api/reveal` and `/api/waitlist`.

## Phase 2, session 2: the wizard and Stripe (done)

`supabase/migrations/0003_billing.sql`. Paste into Supabase → SQL Editor, after 0002. It adds
`subscriptions` and `stripe_events`, and three columns to `scopes` (`brand_name` not null,
`what_they_sell`, `website`). Nothing in 0001 or 0002 is altered.

**The flow, and its order.** `/start` → confirm the business → confirm four competitors → approve
five questions → pay → `/start/confirmed`.

**Competitors come before questions, and that is not the order the session brief asked for.** Slot 3
is "what are the alternatives to [largest_competitor]", so the question generator cannot run until
a competitor set exists. The billing spec has it this way for that reason.

**They approve before they pay.** `approveOnboarding()` writes the account, scope, competitors and
questions with `approved_at` set, and only then is a Checkout Session created. An abandoned checkout
leaves an account and a scope with no subscription, which is a lead, not a subscriber: nothing reads
a scope without checking `subscriptions`.

**Things decided here that are easy to get wrong later:**

- `current_period_end` is on the subscription **item** in API version `2026-07-29.dahlia`, not on the
  subscription. Reading it from the subscription returns undefined and silently writes null.
  `periodEnd()` in `lib/stripe.ts` is the only place that should read it.
- The API version is pinned in `lib/stripe.ts`, not left to the SDK default, so a package bump cannot
  change webhook behaviour underneath the handlers.
- `stripe_events` is the idempotency gate. The handler inserts the event id first; a conflict means
  it has been handled and the handler returns 200 without doing anything. A handler that throws
  **deletes** its claim so Stripe's retry is processed rather than skipped.
- Webhook delivery is not ordered. `subscriptions.stripe_event_at` holds the last applied event time
  and an older event is dropped, which is what stops a late `subscription.updated` resurrecting a
  cancellation.
- The confirmation email is sent inside a try/catch. Throwing would release the event, Stripe would
  redeliver, `created` would be false on the retry, and the receipt would be lost for good.
- `assertPrice()` checks currency, amount, interval and the absence of a trial before every Checkout
  Session. A price id is an opaque string and a wrong one is invisible until an invoice goes out.
  Same discipline as `assertSonar`.
- `lib/scope.ts` exists because the wizard renders the slot labels in the browser and `lib/accounts.ts`
  is `server-only`. Constants live there; anything touching the database stays in `accounts.ts`.

**The founding counter.** Active **or ever**: a founding subscriber who cancels does not return their
place. Counted in `foundingState()` over `subscriptions` where `price_key = 'founding_monthly'` and
status is not `incomplete_expired`. Confirmed subscriptions only, so a checkout in progress holds
nothing: two people paying simultaneously for seat 20 both get founding. Decided trade, costs one
discount once, and it is the honest direction to fail in. The number on the pricing block and in the
wizard is that real count. The front page caches it for 60 seconds and falls back to the offer
without a count if Supabase is unreachable.

**Amended 20 Aug 2026: it counts DISTINCT `account_id`, not subscription rows.** The schema has
always allowed an account to hold several scopes with a subscription each, so a row count would let
one agency take four of the twenty seats. "The first 20 subscribers" reads as twenty companies, and
it is the wrong customer to penalise. Consequence: an account already holding a place adds a second
market without consuming another seat, and gets the founding rate on it while seats remain.

**Stripe, test mode.** One product `Word of Model - Monthly Report` (spaced hyphen: it prints on
Checkout and on every invoice). Two prices by lookup key, `founding_monthly` USD 14900 and
`standard_monthly` USD 24900, both monthly, no trial. `npm run stripe:setup` creates them and the
portal configuration idempotently and prints the env vars. Price ids are pinned by id in env, not
looked up by key at runtime. `STRIPE_MODE` plus the key prefix guard each other in `assertTestMode()`.

Portal has `subscription_update` **off**. The founding price is locked for twelve months by being a
normal recurring price, and a portal that can switch plan can move somebody off it without anybody
deciding to. Cancellation is at period end, no proration, one click from `/account`.

Stripe Tax is off deliberately, not by accident. Not GST registered. The EU/UK VAT question is still
open and is for the accountant before the first overseas sale.

**Managed Payments, and why it is off.** Stripe's merchant of record product is **on by default on
new accounts**, and it refuses any Checkout Session with `automatic_tax` off: it handles tax for you,
so the two cannot both be true. The first real session creation failed on exactly this. Sessions now
pass `managed_payments: { enabled: false }` so the tax position stays the one that was decided rather
than the one that was defaulted: Tim is the merchant of record, no Australian GST is charged, and no
Stripe default silently answers the EU/UK VAT question.

**That question is now a real fork, and it is Tim's and the accountant's.** Managed Payments is a
plausible answer to the VAT problem the spec parks: it makes Stripe the merchant of record and puts
EU and UK VAT on them. It also changes the fees and whose name is on the invoice, so it is a
commercial decision, not a configuration one. Deciding to turn it on means deleting that one line and
setting `automatic_tax: { enabled: true }`.

**Slot 2 was amended.** The spec's generation prompt interpolated `[buyer]` into slot 4 but not slot
2, so the situation question came back written for a generic buyer: a profile of "marketing managers
at mid sized businesses" produced "I run a small business in Australia", on both the batch generation
and the single slot rewrite. Slot 2 is the slot the spec calls the most important of the five. The
spec was amended on 19 Aug 2026 rather than the code diverging from it, and both now read `[buyer]`.
`wordofmodel-onboarding-billing-spec.md` carries an amendment note at the top.

**Step 5 copy was amended** in the same spec for the same reason the site copy was: it listed
ChatGPT, Gemini, Perplexity, Claude and Google's AI answers, which is the old five and puts Claude in
the monthly run.

**Verified end to end, 19 Aug 2026, test mode.** Wizard approval writes account, scope, five questions
with `approved_at`, and four competitors before any session exists. Real Checkout Session created on
the founding price. Against genuine Stripe events pulled from `stripe.events.list`: bad signature
rejected 400, real event accepted, row written with `current_period_end` off the item, `report_day`
capped, replay refused by the idempotency gate, an out-of-order event dropped, cancellation applied.
Founding counter holds a seat through cancellation, a standard subscription does not consume one, and
the pricing block renders the true remaining count. Test rows and Stripe customers cleaned up after.

**Still to do by hand:** `stripe listen --forward-to localhost:3000/api/stripe/webhook` for a real
`whsec_` in `STRIPE_WEBHOOK_SECRET` (the end to end run used a locally set secret, so Stripe's own
delivery is the one link not yet exercised); in the dashboard set Smart Retries to four attempts
ending in `past_due` rather than cancel; add the production webhook endpoint before deploying.

## Phase 2, session 3: the monthly run pipeline (built, not yet exercised end to end)

Migrations `0005_run_pipeline.sql`, `0006_capture_provenance.sql`, `0007_sampling.sql`, all
applied. Engine modules for all five surfaces, the runner, the SERP bake-off, and the
wizard's country field. **No real run has executed yet** — there are no scopes.

### The surfaces, verified live 20 Aug 2026

| Surface | Model returned | Cost/answer | Latency | Cost source |
|---|---|---|---|---|
| chatgpt | `gpt-5.5-2026-04-23` | $0.363 | 67s (83s avg, 120s peak) | computed |
| grok | `grok-4.6` | $0.138 | 74s | **reported** |
| gemini | `gemini-3.5-flash` | $0.030 | 27s | computed |
| perplexity | `perplexity/sonar` | $0.006 | 15s | **reported** |
| google_aio | n/a, Google does not disclose | ~$0.03 | 8-34s | n/a |

**A run is 55 captures, not 25**, and costs about **$3.69** against a **$8.00** ceiling.
Wall clock: **~8 min normal, ~30 min with retries, ~71 min pathological**, hard-stopped by
`max_attempts = 4`. Against a 24 hour promise that is 20x to 180x headroom.

### Defects found by building, in order of how much they would have cost

1. **`scopes.market` never held a market.** The wizard field was free text labelled
   "Primary market" and the one scope that existed had `"burner phone numbers"` in it. Its
   five generated questions named four different countries — a Share of Model computed
   across four markets. Fixed by `scopes.market_country` (ISO, closed list, NOT NULL, **no
   default**) plus a country selector. The prose `market` is now derived, so the two cannot
   disagree.
2. **SerpApi returns only a `page_token` for conversational questions.** 22 of 22 buyer
   questions; 4 of 4 head terms came back inline. Without following the token this surface
   would have reported "no AI Overview" on **every real question**, and benchmarking on
   head terms would have hidden it. Costs 2 billable requests per capture, not 1.
3. **`gemini-3.6-flash` returns 200 and silently does not search.** No `groundingMetadata`,
   `promptTokenCount` 7 against 772 when grounded. Same failure the free scan spec
   documents for Sonar. Pinned to `3.5-flash`, and `captures.grounded` is checked on every
   capture regardless — a model's choice is not a contract.
4. **Gemini's citation URLs are all Google's.** Every `groundingChunk.web.uri` is a
   `vertexaisearch.cloud.google.com` redirect. `domainOf()` would have recorded Google as
   the source of 100% of Gemini citations, and "who owns the answer" is section 5 of the
   report. The real domain is in `web.title`.
5. **`claim_capture_job` returned a phantom row.** PostgREST renders a NULL composite as
   `{"id":null,...}` — truthy — so `if (!job) return` would have run a capture against a
   null id. Fixed in 0006 with `returns setof`: no work is `[]`.
6. **Every surface is non-deterministic.** Repeat answers share 0.31–0.44 of their words,
   Google included. But the brands named are far steadier (Perplexity named the same 9
   companies in all 3 runs, varying only on 6 at the tail) and **cited domains are the
   noisiest thing we collect** (Gemini shared 1 domain of 7 between runs). The framing that
   survives, and which is now in `lib/method.ts`: **non-deterministic in prose, largely
   stable in substance.**
7. **`Grok` cost 32x the build plan's estimate** — $0.95/subscriber/month against $0.03,
   because it chose to run 8–11 web searches per question. Not capped: capping tool calls
   produces an answer Grok would not have given. `captures.search_calls` records it instead.
8. **The spec's "Grok — live search enabled" names a retired API.** `search_parameters`
   was withdrawn 12 Jan 2026. The replacement accepts no location at all, which is what
   made Grok location-neutral.
9. **DataForSEO fails 40% of the time** (6 of 15, `Internal SE Server Error`) and its
   defaults serve AI Overviews from cache. Not chosen, and **explicitly not a fallback** —
   a provider failing two in five cannot rescue a run.
10. **Sampling broke the capture unique key**, and `runs.cost_usd` needed an atomic
    increment or four concurrent chains would lose three of every four. Both in 0007.

### Decisions, settled

- **First report within 24 hours**, not 7 days. The webhook opens a baseline run (a cheap
  insert, no engine calls) and the daily scheduler independently opens one for any live
  subscription whose scope has never had a run. **Two routes, neither depending on the
  other** — the Session 2 lesson.
- **A 24-of-25 run does not ship.** It goes `partial`, alerts, and holds.
- **`no_answer` is excluded from the Share of Model denominator** and reported explicitly.
  Google not answering is not Google not mentioning you.
- **Share of Model**: answers naming the brand ÷ answers received, across the four
  unbranded questions, `branded` reported separately as the control. Computed **per surface
  as well as overall**, and for competitors on the identical denominator.
- **The mixing rule.** google_aio is sampled 3x and contributes a FRACTION (0.67), not a
  thresholded yes and not 3 rows. The unit of the denominator is **one surface answering
  one question**, not one draw. Repeated samples average into that unit rather than
  multiplying its weight, which is what lets sampling depth vary per surface without
  redefining the metric.
- **Sampling depth follows cost, not importance**: chatgpt 1x, grok 1x, gemini 3x,
  perplexity 3x, google_aio 3x. The method note says so rather than implying evenness.
- **Extraction is deterministic for mentions and domains, LLM at temperature 0 only for
  recommended-versus-named and position**, with `extraction_version` and `extractor_model`
  on the row.
- **SerpApi committed** on zero silent misses and zero failures to deliver. Its one silent
  failure mode (1 in 15 returning an overview with no references) is now a loud retryable
  error.
- **A suppressed overall delta is not replaced by a like-for-like subtotal** (21 Aug 2026).
  When one surface breaks comparability the overall change is suppressed and named, and that
  is the end of it. Totalling only the comparable surfaces was considered and rejected: the
  report already prints this month's Share of Model over every surface, so a change computed
  over four would put two figures of the same name and different bases on one page. The
  subscriber cannot reconcile them, and that costs more than the lost information. The
  per-surface changes that do hold are still shown.
- **`vercel.json` pins `iad1` and it must never change.** Grok and Gemini accept no
  location parameter, so the network origin IS their geography. See
  `vercel.json.README.md`.

### The third thing that can move a trend line without the market moving

0002 warns about the competitor set. 0005 adds `runs.surfaces`. 0007 adds `runs.samples`.
All three are configuration, and a change in any of them must be reported as its own line,
never as movement. Delta reporting has to read all three.

### Outstanding

- ~~No end to end run yet.~~ Done 20 Aug, Zapme, 54 of 55 captures. The run is `partial`
  because the Grok situation capture was lost, so its report is held rather than sent - which
  is the rule working. Re-running that one capture would make it shippable.
- Production Stripe webhook endpoint still not registered. Until it is, the baseline run
  comes from the daily scheduler or `/api/run/start` by hand. **See `GO-LIVE.md`**, which is
  the ordered runbook for this and the other eight steps.
- ~~Copy changes for "within 24 hours" held until a run delivers end to end.~~ **Shipped**
  in `ab75afa` and validated 21 Aug: a run completed, a report built from its stored
  evidence, and the email delivered. The site, the confirmation email and `/start/confirmed`
  all say 24 hours. The only "seven days" left in the repo is the ops queue view in the
  onboarding spec, which is internal.
- Extraction, Share of Model and the report are Session 4. **The Google AI Overview
  trigger rate goes in the REPORT BODY, not the method note** — `aiOverviewCoverage()` in
  `lib/method.ts`. A low rate is a finding about the subscriber's category: Google
  declining to answer means classic search still carries the weight for their buyers.
  Stated plainly it is intelligence; buried it reads as an excuse.
- **Multiple scopes per account — Session 5.** The schema and the whole run pipeline already
  support it: nothing built in Session 3 needs changing, `scopes.account_id` has no unique
  constraint, `subscriptions` carries both ids, and RLS matches on account. Three application
  blockers: `upsertScope()` reuses the account's FIRST scope, so a second market overwrites the
  first or silently no-ops; `getSubscriptionForAccount()` and `/account` render exactly one
  subscription; and the Customer Portal is not configured for an account with several
  subscriptions, so cancelling one market and keeping the other is a support email. The founding
  counter part of this was fixed 20 Aug 2026.

## Environment, decided 19 Aug 2026

All variables are synced to Vercel across production, preview and development, except
`NEXT_PUBLIC_SITE_URL`, which is **production only on purpose**.

**Base URL resolution** lives in `env.siteUrl` and is what every link back to us is built from: the
magic link redirect, Stripe's Checkout success and cancel URLs, the portal return URL, the account
link in the confirmation email, and `metadataBase` in the layout. Order: `NEXT_PUBLIC_SITE_URL`, then
`VERCEL_PROJECT_PRODUCTION_URL` when `VERCEL_ENV=production` (belt and braces if the first is ever
missing on a production deploy), then `VERCEL_URL`, then `http://localhost:$PORT`.

A static preview value would send every preview deploy's subscriber to production. Deriving from
`VERCEL_URL` means a preview comes back to itself.

**The consequence, and it needs doing before preview auth works:** `VERCEL_URL` is unique per
deployment, so no individual preview URL can be pre-allowlisted in Supabase. Add a wildcard to the
Supabase redirect allowlist, something like `https://*-reframe5.vercel.app/auth/callback`, or magic
links from preview deploys will be refused. Stripe needs no allowlisting, so Checkout redirects work
on preview either way.

## The confirmation email race, 19 Aug 2026

**The first real production checkout produced a subscriber who paid and was never told.** The webhook
returned 200, the subscription row was correct, and nothing anywhere logged a problem. Worth reading
before touching the webhook, because the failure had no symptom.

The send was gated on whether this handler had inserted the row:

```js
const { row, created } = await upsertSubscription(...)
if (created) { try { ...send... } catch { console.error(...) } }
```

Stripe delivers `customer.subscription.created` and `checkout.session.completed` inside the same
second, in no guaranteed order. In production `subscription.created` was claimed 464ms first and did
the insert, so `checkout.session.completed` saw `created = false`, skipped the block entirely, and
never entered the try. There was no log line to find, which is why chasing it through `vercel logs`
turned up nothing: the CLI only returns request logs without `--follow`, and there was no runtime
output to return anyway.

**The gate was wrong in kind.** "Did I insert the row" is not "has this person been told".

Now: `subscriptions.confirmation_sent_at` (migration 0004) and a conditional update that claims the
send atomically. Both deliveries race it, Postgres serialises them, exactly one wins. A failed send
writes the claim back to null so a redelivery retries, and calls `sendOpsAlert`, which logs **and**
emails `ALERT_EMAIL` with the subscription, account, scope and reason. A missing address or missing
scope throws into the same path instead of being a silent `if (email && scope)`.

`sendOpsAlert` never throws. An alert that takes down the handler it reports from turns one silent
failure into two loud ones, and if Resend is what is broken the console line is the last defence.

**Verified against the exact failing order:** `subscription.created` delivered first inserts the row
and sends nothing, `checkout.session.completed` then claims and sends, a redelivery sends nothing
more, and a refused recipient releases the claim, returns 200, keeps the subscription and raises the
alert. Tim's missing receipt from 12:36 was sent by replaying the event through the real path.

**It was not RESEND_FROM.** That value was correct throughout and Resend had no record of a send at
12:36, because none was attempted.

**`WIZARD_LIVE` gates the public wizard CTAs, and only those.** Off, the pricing block and the scan
result show the waitlist they showed before onboarding existed. It exists because Stripe is in test
mode: a visitor sent to a test mode Checkout gets a page carrying Stripe's test banner that will not
take their card, and this product is sold on honesty.

`/start` stays reachable by URL either way, and every wizard route keeps working, so the full flow
including checkout and the webhook can be walked on production while visitors still see the
waitlist. Both wizard pages are already noindex, so an unlinked page will not be found.

Set `true` on preview and development, deliberately **unset on production**. It defaults to false, so
forgetting it can only ever be the safe way round. Flipping it on production is the last step of
going live, after `sk_live_`, the production webhook endpoint and the Supabase allowlist.

**`IP_HASH_SALT` is set, and the fallback is gone.** It used to fall back to `SUPABASE_SECRET_KEY`,
which meant a missing salt was never a plaintext address but the salt and the database credential
were the same string. Rotating that credential, an ordinary thing to do and exactly what you would do
in a hurry after a leak, silently rehashed every visitor: rate limiting stopped recognising anyone,
and every hash already in `scans` and `rate_events` became uncomparable with every new one, with
nothing erroring. Done on 19 Aug 2026 while the tables were nearly empty, so the one-off orphaning
cost nothing. `env.ipHashSalt` is now `required()`: a missing salt takes the scan routes down, which
is recoverable in a minute. Changing the value has the same orphaning effect, so set it once and
leave it.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
