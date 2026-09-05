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
| `wordofmodel-free-scan-spec.md` | Scan flow, prompts, engines, email gate. **Build this first** |
| `wordofmodel-site-copy.md` | Page copy, sections 1–10, plus the copy rules block |
| `wordofmodel-report-template.html` | The design system. IBM Plex, highlighter on competitors, red pen on absence |
| `wordofmodel-onboarding-billing-spec.md` | Stripe, the wizard, the five question slots, founding-rate counter logic |
| `word-of-model-pricing-and-stripe-plan.md` | The ladder, the founding offer, currency, the Stripe object model. §3 is the cap |
| `word-of-model-purchase-path.md` | Homepage and pricing page: one button per tier, the four steps, the founding block |
| `word-of-model-result-state.md` | The post-scan state: block order, the coverage grid, the three result closes |
| `word-of-model-site-brand-and-structure.md` | The mark, brand tokens, navigation, homepage and pricing page. The "§N of the brand brief" the code keeps citing |
| `word-of-model-handover.md` | How the work is split across projects, what moves and what stays, and what is in none of them |
| `word-of-model-competitor-landscape.md` | The market, the table, and the position that survives it |
| `word-of-model-content-plan.md` | The article, the naming question, tile copy and sequence |

`wordofmodel-report-template.html` is a fragment (no `<html>`/`<body>` wrapper) — it starts at
`<meta>` and renders fine as-is.

Three further artifacts were listed here from the first commit until 30 Aug 2026 and have never
existed in this repo: an offer sheet, an ad-copy file and a static one-pager. See the dated
section at the end of this file. `npm run check` now opens every file this table names.

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

Tim owns wordofmodel **.com, .com.au and .ai**. Corrected 28 Aug 2026: this line previously said
.io was owned too, and it is not registered. `https://wordofmodel.io` resolves to nothing, which is
worth knowing before somebody prints it on something.

.com and .com.au both 301 to the .ai apex, verified 28 Aug 2026 - .com is what people type from
memory, and a redirect costs nothing. Vercel handles this natively.

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

**A sentence that states a number the run did not produce** (5 Sep 2026). The free scan attempts
two engines and keeps the ones that answered - `app/api/scan/route.ts:251` fires both,
`:255` filters out failures - so a completed run can hold one capture. Ten rendered sentences
said "two engines", "both answers", "neither engine" as literals. On a one-engine run every one
of them told the visitor, confidently and in writing, something we had not done. The caption
*"One question, two engines"* is the subscription argument in miniature, so it was the worst
sentence on the site to be wrong.

The fix is `FreeResult.engines: EngineId[]` - the identities, not a count - built from the
captures in `lib/verdict.ts` and read through `lib/engine-count.ts`. The list rather than a
number because the coverage grid lights cells by engine, and a count cannot say which. Ten
literals became one module: a new sentence that needs the number now has somewhere to get it
instead of typing "two".

**Two things this taught that the fix itself did not.**

The first version of the helper returned a SUBJECT - "Neither engine" / "The engine that
answered" - to sit in front of *"named a single company."* On a one-engine run that produced
*"The engine that answered named a single company"*, which states the opposite: the negation
lived in the subject and left with it. That is the `countPhrase` defect exactly - a
substitution that reads correctly either side of a boundary it does not respect - and no
typecheck or grep could see it. It was caught by running the one-engine case, not by reading
the diff. **Negative findings return the whole clause; there is no arrangement of them that can
lose the "no".**

And the field is the truth while `engines_run` is derived from it, rather than the two being
written side by side. Two fields holding one fact is the same shape as two renderings of one
catalogue, and it drifts the same way.

**A guard can be more expensive than the risk it prevents** (3 Sep 2026, and it reverses a rule
written on 28 Aug). `foundingOfferOrNull()` failed closed: an unreadable founding count withheld
the offer from every visitor and showed US$249. The reasoning was sound - a failed count is
indistinguishable from a genuine zero, and falling through to "offer it" is how you sell an
unbounded number of permanent 40% discounts without noticing.

Then it was measured. The count failed three times in five days, every time from clock skew
inside Supabase's gateway answering `JWT issued at future` - not ours to cause and not ours to
fix; neither of our keys is a JWT. Each failure switched the offer off for everyone, on a page
that looked completely normal, at the moment they were closest to buying. Demand across that
window was two free scans and zero purchases.

It now fails OPEN: the block renders with the cap and the reason and no remaining count, the
same shape as "none taken yet". Two things still close the offer and both are hard-coded - the
30 September date, and a count that reads cleanly at zero remaining.

Three things this is not. It is not a weakening of the cap: `claim_founding_seat` decides the
charge atomically at the moment of buying and returns the standard rate if it cannot reach the
database, which is where the cap always actually lived. It is not silent: the alert and the
console line still fire, with wording that no longer claims the offer is being withheld. And it
is not a general licence to fail open - the direction was chosen by counting what each failure
had actually cost, which is the part worth repeating, not the answer.

**What it cost to find:** the fix exposed that the wizard had been printing "20 of 20 places
left" since it shipped - the exact "all 20 are open" sentence §3 of both briefs says to delete -
because the homepage and pricing page suppressed the count below the cap and `/start` never did.
One nullable number was carrying two different facts: whether the offer is running, and whether
anyone could read how full it is. Under fail-open it would have stated a figure from a count
that failed. **When a value can be missing, check whether every renderer of it agrees on what
missing means.**

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

**Session 6 change, decided 22 Aug 2026: Claude and Copilot are captured by hand in the FIRST
report for every new subscriber, then quarterly thereafter.**

Three reasons. A subscriber who churns at month two never receives them at all under a
purely quarterly cadence, so the two surfaces that cost the most to produce are the two the
least-committed subscriber never sees. The first report is what decides renewal. And a
one-off manual capture per signup scales with new signups rather than with the subscriber
base, which is the direction that stays affordable.

**The rule does not move: never substitute an API call for claude.ai.** The Anthropic API is
not claude.ai and Azure grounding is not Copilot. A caveated extra data point is worth less
than the position that a surface is only ever recorded from itself, which is the whole
methodology.

**The wrinkle to design around, from delta.ts.** A first report with seven surfaces followed
by a month two with five means `runs.surfaces` differs between them, so `surfaceObjection()`
raises "We did not measure Claude this month" and the OVERALL change is suppressed - every
subscriber's first delta, the one that has to earn month three, arrives with no headline
number. Two ways out, and Session 6 has to pick one deliberately: make the delta
cadence-aware so month to month is computed over the monthly five and the quarterly two are
tracked separately, or keep the hand captures in their own run (`period` is already
`quarterly` or `calibration`) and present them inside the first report without putting them
in the monthly trend. The second keeps the monthly line clean and is closer to what the
schema already expects.

Also settled by the schema: `capture_method = 'browser'` requires an `operator` (0002), so a
hand-read answer always carries a name, and ten hand captures per signup is what this costs
at five questions across two surfaces.

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

## Additional locations, built 29 Aug 2026 (migration 0022)

**The price list sold this for a day and a half and nothing implemented it.** `/pricing` offered
US$30 a month per additional location with a live stepper computing US$189 for five clinics, and
the live Stripe product description promised the mechanism in as many words - *"The same five
questions, asked from each town."* `scopes` carried four locality columns describing ONE place,
the wizard collected one, `createCheckout` built one line item at quantity 1, and no run had ever
known about a second town. That is worse than a price with no purchase path: it would have taken
money for output that does not exist, and the subscriber would not have found out until they read
a report covering one town.

**One run per location, not one run covering many.** The capture key is
`(run_id, question_id, engine, capture_method, sample)` and the queue, extraction, scoring and the
delta are all built on a run meaning "one scope, one period, 55 captures". Widening that key would
have touched every one of them. A run per town leaves all of it untouched, and `runs.location_id`
(null = the scope's own locality, which is every run before 0022) joins the two.

**The approved questions are NOT regenerated per town.** Approval is the credibility mechanic the
product is sold on; generating a fresh five per town would mean approving five and receiving
answers to fifteen nobody had seen. The same five run in each place with the place substituted.

**And the place is IN THE TEXT, not only in the geo parameter.** `questionsPrompt` instructs "Name
the place in questions 1 to 4, exactly as it is written above", so an approved question reads "who
is best at emergency dentistry in Geelong, Australia". Sending that text with a Ballarat geo
parameter would ask about Geelong from Ballarat and file the answer under Ballarat - a wrong number
that looks completely normal. `localiseQuestion()` in `lib/location-text.ts` does the substitution
and **throws when it cannot find the place**, because there is no safe fallback. The branded slot
is exempt: slot 5 is deliberately not asked to name a place.

**Three things that had to widen with it, and each would have been a silent wrong number:**

- `runs_scope_period_start_uniq` → `(scope_id, period, period_start, location_id) NULLS NOT
  DISTINCT`. Without `NULLS NOT DISTINCT` a nullable column reintroduces the exact double-run
  collision the original index exists to prevent.
- `attachDelta()` matched on scope and period only, so a second town's month two would find the
  FIRST town's month one and print the difference between two markets as movement. The location is
  part of comparability in exactly the way `runs.surfaces`, `runs.samples` and the competitor set
  are.
- `reportSubject()` now names the town. Three towns is three reports in one inbox, and without the
  town they are three identical subject lines: the second reads as a duplicate and the third never
  gets opened.

**The checkout quantity is counted from `scope_locations`, not from the form.** Those are the same
number today and stop being the same number the moment a duplicate is dropped or a stale form is
replayed. Counting the rows that will actually be RUN is what makes over-charging impossible rather
than merely unlikely. Shipped last on purpose: charging for locations before the pipeline honoured
them would have been the original defect with extra steps.

**Known limit, and it is real.** `assertScopeEditable` refuses any scope that has runs, so an
EXISTING subscriber cannot add a town through the wizard - it is a signup-time choice today.
Adding one for a live subscriber is a support action (insert the row, update the Stripe
subscription item quantity); `scopesAwaitingFirstRun()` now asks its question per town rather than
per scope, so the new town gets its baseline run within twenty minutes exactly like a new
subscriber, rather than waiting up to a month for `report_day`. A self-service "add a location"
flow on `/account` is the follow-on.

### Adding a location to a live subscription (29 Aug 2026)

`/account` now adds and removes towns self serve. **Both, deliberately** - a page that can add a
US$30 line and not remove it is not self service, it is a form that only increases the bill.

**Not a second pass through the wizard.** `assertScopeEditable` refuses any scope with runs and
that guard stays: rewriting an approved question once evidence exists against it destroys
comparability. A location touches neither the questions nor the competitors, so it gets its own
path rather than a hole cut in that one.

**The approval mechanic is preserved by a preview.** `previewLocation()` renders the subscriber's
own five approved questions as they will actually be asked about the new town, and the page shows
them before anything is charged. It is also the validation: every refusal the charge can hit - no
locality to substitute against, a question naming no place, a duplicate, the cap - is raised
before any money moves.

**The order of the two writes is a decision about who loses.** Adding writes the row first, then
Stripe, and rolls the row back if Stripe refuses. Removing stops the charge first, then deletes
the row. Both orders err toward OUR cost: a failure between the two steps leaves a town measured
and not billed (about US$3.69), never billed and not measured (US$30 a month for silence, found
out by reading a report that never mentions their town). Same direction the founding counter fails
in when it cannot read its own count.

**Prorated onto the next invoice, not charged immediately.** `always_invoice` can be declined, and
a declined US$30 would tip a subscription into past_due over an add-on while the town is already
running. Deferring puts it on the normal cycle where Smart Retries already handle a bad card. Set
deliberately, like `automatic_tax`.

**Removing a town keeps its runs.** `runs.location_id` is `on delete cascade`, so deleting the row
takes the town's whole history with it. A subscriber who re-adds Ballarat in March should still see
January.

### A location is US$30 on every plan, premium included. Decided 29 Aug 2026

The additional location is its own Stripe product with its own two prices, so it is independent
of the plan and `createCheckout` pairs it with whichever plan was chosen, matching the interval.
"On either plan" on `/pricing` is true.

**The margin is not the same on both, and that was accepted deliberately.** On Monitoring a town
costs about US$3.69 of captures against US$30, roughly 8x. On Monitoring + Review the real cost is
the HUMAN HOUR - the quarterly hand read across Claude and Copilot, ten hand captures per town per
quarter - and US$30 does not buy a second town's worth of that. Tim took the risk knowingly rather
than pricing a premium location differently or excluding towns from the review.

**Revisit when the quarterly hand-capture pipeline is actually built.** It is decided and not
built today (`app/method/page.tsx` says so), so this costs nothing yet. The moment it exists, a
premium subscriber with four extra towns is fifty hand captures a quarter against US$120 a month
of add-on revenue, and that is the arithmetic to look at again.

Related: the founding trial coupon is scoped to the Monitoring PRODUCT, so a subscriber on three
free months still pays US$30 a town from day one. Correct - the trial is on the plan - but it will
be the only line on their first invoice.

### `items.data[0]` was the plan until this feature made it not (29 Aug 2026)

**Stripe does not guarantee subscription item order**, and three places read `items.data[0]` as if
it were the plan: `upsertSubscription` (twice), `priceKeyOf`, and `periodEnd`/`periodStart`. That
was correct while every subscription had exactly one item. The location line made two possible, and
on the wrong ordering `subscriptions.stripe_price_id` would record the US$30 location price as a
US$249 subscriber's plan.

**Introduced by the 29 Aug locations commit and fixed before anybody bought one.** `planItem()` and
`locationItem()` in `lib/stripe.ts` select by lookup_key, with a fall back to the first item so a
dashboard-made subscription carrying no lookup key behaves exactly as before.

### A reconciliation, because the mismatch is silent in both directions

`scope_locations` decides what RUNS. The Stripe subscription item quantity decides what is
CHARGED. Nothing reconciled them, neither side errors when they disagree, and neither number
appears on any page. Too few rows and the subscriber pays US$30 a month for a town that is never
measured - the exact defect this feature exists to remove, reappearing one layer down. Too many and
we measure a town nobody pays for.

`locationBillingMismatches()` runs in the daily cron and by hand as `npm run locations:billing`.
Proven on a real test-mode subscription carrying a location quantity of 2: one row reported "PAYING
FOR A TOWN THEY DO NOT GET", two rows reported clean, three rows reported "running a town nobody
pays for". All Stripe and database objects removed afterwards.

**It returns `examined` for a reason.** A reconciliation over zero subscriptions reports zero
mismatches, which reads identically to a reconciliation over fifty that found none. The script
prints NOTHING TO CHECK rather than "clean" in that case, and a subscription Stripe would not
answer for is counted as UNKNOWN rather than folded into the clean total. Same lesson as the
founding count that would have read healthy while pointed at the wrong ledger.

`npm run locations:check` proves all ten guards, each watched refusing. `copycheck` gained
`price-door: linked`, which asserts a price is inside an anchor and **verifies it** by requiring an
open `href` above the line; proven by deleting the href and watching the marker fail.

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

## A discovered competitor set needs entity resolution, not brandKey (27 Aug 2026)

**Do not design the Consideration Set as if `brandKey` is sufficient.** It folds case and
punctuation and nothing else. It has no concept of identity.

Every aggregation shipped today escapes this, because it iterates the **configured** competitor
list and matches into `captures.brands_named` (`lib/share.ts`, `lib/delta.ts`). A discovered set
inverts the direction: it reads names out of the data, so it is the first consumer that has to
decide whether two strings are one company.

Three different problems, and they do not have one answer:

- **Aliasing.** `Optus` / `Singtel Optus`. Same entity, two naming forms. Always merge.
- **Hierarchy.** `Telstra` / `Telstra Business`. Whether a sub-brand is the same competitor is a
  judgment about the market, not the string. In eSIM they are arguably one rival; in enterprise
  telco they are different buyers.
- **Ambiguity.** `Boost` / `Boost Mobile`. `Boost` alone may be a different company in another
  category, so merging on prefix is least safe exactly where it looks safest.

The third is why a purely automatic resolver is wrong. Any rule aggressive enough to catch
`Singtel Optus` also catches things that are not the same company, and **the failure is silent**:
a wrongly merged pair produces one confident row rather than two visibly odd ones. A split pair
is visible and halves both directional ratios; a bad merge is invisible and invents a rival.

**Two constraints for whoever builds it.**

The subscriber knows their market better than we do, and they already approve competitors and
questions in the wizard. A discovered set **proposed rather than asserted** fits the approval
mechanic that exists, rather than inventing a new one. `competitors.source` is already
`proposed | subscriber_added` (0002) and is the obvious place for a third value.

A human review step **collides with the 24 hour delivery promise**. The first report ships about
twenty minutes after payment, so review cannot be a blocking gate unless something gives: either
the discovered set enters the report labelled as unreviewed, or it waits for month two. That is a
product decision with a copy consequence, not an implementation detail, and it is Tim's.

Related, and the same shape one level up: 0002 already warns that a competitor added or removed
mid-span is a **configuration change and must be reported as its own line, never as movement**. A
resolution decision that merges two names between months is the same kind of change and needs the
same treatment.

## The attribution gate on the home page landing event (27 Aug 2026, corrected 28 Aug 2026)

**The 27 August version of this section was wrong, and the correction is the whole point of
reading it.** It is left standing rather than deleted because the mistake is the lesson.

`/` records a `landed` funnel event, and **only when a click id is on the URL**: `fbclid`,
`gclid`, `ttclid`, `li_fat_id` or `msclkid`. One row per click id, enforced by the unique index
in `0020_landed_click_id.sql`. Everything else records nothing.

### What was wrong

The original gate accepted `utm_source` **or** `utm_content` or `fbclid`, and rested on this
premise, which was stated here and in `0019_landed_event.sql`:

> ~~A crawler does not append `utm_content`; an ad click always does.~~

The second half is true. **The first half is false.** utm parameters are baked into the ad URL
and are inherited by anything that fetches it, crawlers included. Only a click id is minted at
click time. A crawler does not *append* a utm - it *inherits* one, which arrives at the same
place by a different road. So the gate built to exclude crawler noise instead defined crawler
noise as attributed traffic.

Observed 28 August 2026: 69 landings against 25 reported link clicks. 28 rows carried a real
`fbclid`; **41 carried no click id at all**. 29 of those arrived in 88 seconds with gaps of 0.0s
and 0.1s, walking across two ad URLs, and `outburst-video` took 22 landings that day with no
observed click behind any of them.

The `facebookexternalhit` exclusion **did ship** (commit `63e3066`) and **does work** - verified
against production, a request with that user-agent writes no row. It simply knew three strings,
and every other crawler walked past it. A blocklist of names was never going to hold, which is
why the click id is now the gate and the user-agent is only recorded.

### What that costs, accepted deliberately

Privacy browsers strip click ids, so those clicks vanish from this table. **Undercounting is the
safe direction**: a number that errs low can be trusted when it rises. The old rule erred high,
which is the direction that cannot be trusted at all.

### The cutover, and why history is not restated

The 129 rows written between 2026-08-27T12:05Z and the 0020 deploy stay exactly as they are.
They cannot be corrected - **the user-agent was never stored**, so there is no way to separate
crawler from human beyond the `fbclid` proxy. Any series spanning 2026-08-28 shows a step down
that is a **definition change, not a drop in traffic**, and `npm run funnel` prints that line
above the table so nobody has to remember it.

`funnel_events.user_agent` now exists for exactly this reason. It is **recorded and never
filtered on** - filtering on a name list is precisely what failed here. It exists so the next
version of this question is answerable from the data.

### The original reasoning, still standing

**Organic and direct landings are invisible in `funnel_events` by design.** That is a
deliberate trade, not an oversight, and it was made on evidence: `/start` recorded every server
render and accumulated **1030 rows against 2 scans** in 48 hours, because a crawler and a person
are the same thing to a server. The home page is linked and crawled far more than `/start`, so
recording every render there would have repeated that defect at a larger scale on the page the
ads land on - and it did, until 0020.

**REVISIT THIS WHEN THE CONTENT PLAN STARTS PRODUCING NON-AD TRAFFIC.** The moment organic
arrivals matter - the first article, the first ranking page, the first referral worth counting -
this gate stops being the right trade and starts being a blind spot that flatters paid. A funnel
that can only see the traffic it paid for will report that paid is the only thing that works.

What would replace it, when that day comes: count every landing but separate humans from
crawlers properly. **Not a bot-UA list** - that idea is what 0019 tried and what 0020 removed.
A client-side beacon is the remaining candidate, because a real browser executing JS is a much
better proxy for a person than any string it claims to be.
Neither is worth building for ad-only traffic, and both are worth building before judging a
content plan.

Related: `/` carries `export const dynamic = 'force-dynamic'` for this reason. It was already
rendering dynamically, but only because `app/layout.tsx` calls `headers()` for the Meta pixel
country gate - an unrelated line that will be edited when the Business Portfolio lands, silently
taking `searchParams` and this measurement with it.

## A fail-closed rule protects the layer it is written about (28 Aug 2026)

> **Reversed 3 Sep 2026** for the display layer specifically — see "A guard can be more expensive
> than the risk it prevents". The point this section makes about *layers* still stands, and is in
> fact why the reversal was safe: the charge was never protected by the display rule.

**The check belongs where the decision is made, not where the number is shown.**

§3 of the pricing plan says the founding cap must fail closed: if the count query errors or
returns nothing, do not offer the founding price, show US$249. That rule was written about
what the PAGE RENDERS, and the page was made to obey it - `foundingOfferOrNull()` returns null
on failure, the founding block does not render, the premium card shows its standard price, and
an alert goes out. Proven by breaking the query deliberately.

**Every one of those guards passed while the function that decides the CHARGE was broken.**

`claim_founding_seat` (0012) counted holders with `price_key = 'founding_monthly'`. The two-tier
ladder renamed that key to `premium_founding_monthly` and added `premium_founding_annual`. Left
alone, the function would have found **zero holders on every call, forever** - and handed out an
unlimited number of permanent 40% discounts while the page looked completely normal and every
display guard reported healthy.

The display layer and the charging layer are different layers with different failure modes:

| | reads | fails by |
|---|---|---|
| `foundingOfferOrNull` | `subscriptions`, in the app | throwing, loudly, caught and alerted |
| `claim_founding_seat` | `subscriptions`, in Postgres | returning a confident, wrong zero |

A stale string inside a database function does not throw. It answers. **A guard that reports
healthy while the thing it guards is broken is worse than no guard**, because it also stops
anybody looking.

The same shape arrives through configuration rather than through a rename: a founding count
pointed at test-mode data while the site charges live returns zero forever, with no error. When
live-mode objects exist, read back a count with one live subscription present rather than
assuming the environment is right.

Fixed in 0021, which moves the constraint, the partial index and the function together, and
verified by `npm run founding:cap` at both layers.

## A price when permanence is the promise, a coupon when reversion is (29 Aug 2026)

These two decisions look contradictory and are not. Read together they are one rule.

**The founding rate is a PRICE.** §3 of the pricing plan is explicit about why: a coupon
carries a `duration` field, and setting it wrong silently reverts the founding cohort to
US$249 after three months. What that offer promises is **permanence** - "held at that price
for as long as you stay" - and a distinct price cannot expire. Nothing about it can be set
wrong in a way that quietly ends it.

**The founding trial is a COUPON.** `founding_trial_100_3mo`: 100% off, repeating, three
months. What it promises is **reversion** - three months free and then US$69. A coupon's
`duration` is exactly that promise expressed as data. A price could not express it at all;
it would take a second price and something to move the subscriber between them, which is a
scheduled reprice nobody is watching.

**The rule: a PRICE when permanence is the promise, a COUPON when reversion is the promise.**
The `duration` field is a liability for the first and the mechanism for the second.

### What the trial needed beyond the coupon, and why

**`payment_method_collection: 'always'`.** At 100% off the first invoice is US$0 and Stripe's
default (`if_required`) collects no card. Month four then does not step to US$69 - the invoice
fails for want of a payment method and the subscription cancels, which from the outside looks
like the customer left. Verified by completing a US$0 checkout: `subscription
.default_payment_method` came back `visa ****4242`.

**Stripe scopes coupons to PRODUCTS, not prices.** `applies_to[prices]` is refused outright:
"Received unknown parameter". Both Monitoring prices - `main_monthly` and `main_annual` - hang
off one product, so the coupon alone also covers the annual price: three months free against a
US$690 commitment. The product scoping does the structural work that matters most (Stripe
refuses a premium, founding or location session outright, proven), and the PRICE granularity
is enforced in `lib/discount.ts`, where each offer names the one price it may be charged on
and `createCheckout` refuses any other.

**One offer per coupon, in a registry.** `validateDiscount` previously asserted a single
shape - US$180 off, three months - and refused everything else as "not set up correctly on our
side". A second offer would have been rejected however carefully it was built in Stripe. The
registry in `lib/discount.ts` is now what a code is validated against, and an unknown coupon
is still refused rather than honoured at whatever it happens to say.

Reversion proven on a test clock rather than reasoned about: three invoices at US$0, then
US$69.00 from month four, then US$69.00 again.

## Architecture and copy can disagree, and only one of them reaches the customer (28 Aug 2026)

§3 of the pricing plan builds the founding rate as a **separate Stripe price, never a coupon**,
for a specific reason: a coupon carries a `duration` field, and setting it wrong silently
reverts the founding cohort to US$249 after three months. A distinct price cannot expire.

The architecture was right. **The copy said "locked for twelve months" in five places** - the
terms page, the confirmation page, the account page, the confirmation email and the wizard.

So the product could not revert the price, and the words promised that it would. A subscriber
reading a receipt has no access to the price architecture; they have the sentence. The copy was
recreating, as a promise, exactly the failure the architecture exists to make impossible.

Corrected to "held at that price for as long as the subscription stays active". Also removed
"the first 20 subscribers", which implies a first 20 that were taken, and there were none.

**When an architectural decision exists to prevent a specific failure, grep the copy for that
failure being promised.** The price list is checked against Stripe at module load; nothing
checks that a sentence agrees with the schema.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## A mistyped link is not a server error, and a 404 is a page (29 Aug 2026)

**`/scan/<malformed-id>` returned 500.** Postgres does not answer "no such row" for a string that
is not a uuid - it rejects the comparison, PostgREST returns 22P02, and `getScan` throws. Every
caller turns a null into a clean 404 and an exception into a 500, so a truncated link produced
"our site is broken" when the truth was "your link is wrong". `isUuid()` in `lib/db.ts` now asks
the shape question before the query, in `getScan` and in `getRunById`.

**Deliberately a shape check and NOT a try/catch around the query.** Catching would also swallow a
real database failure, which is the guard-that-makes-a-broken-thing-look-healthy shape this build
keeps finding.

**There was no `app/not-found.tsx` at all**, so every unmatched URL got Next's own default: right
in its status code, mute about what to do. Almost everybody who lands there arrived from a link
somebody SENT them - scan results and reports are both built to be forwarded, both end in a uuid,
and a uuid is exactly what an email client truncates. So the page guesses out loud, names the two
link shapes that exist in the wild, and carries the scan CTA, because a stranger who followed a
forwarded link is the warmest traffic this site gets.

## The hairline grids are inverted: the item carries the line (29 Aug 2026)

Five grids drew their dividers with `gap: 1px` over a container painted `--line`, so the gaps
revealed the container. Elegant, and wrong the moment a row is not full: the leftover cells reveal
it too, and `--line` across a whole cell is a grey rectangle. That shipped twice in one session.

Now each item draws its own top and left border and a matching `margin: -1px 0 0 -1px` pulls it
onto the neighbour, so adjacent edges collapse to one hairline and the first row and column
collapse onto the container's border. Net displacement zero. A short row is just a short row.

**BOX-SHADOW WAS TRIED FIRST AND WAS WRONG.** A shadow paints outside the border box, so the next
grid item's background paints straight over it: every internal line vanished except on the last
item of each row and column, where nothing came after to cover it. The stylesheet looked right and
the screenshot was obviously broken. **The picture caught what the code could not**, which is the
argument for the screenshot step being part of the work rather than a formality.

## The nav was dressed as a caption (29 Aug 2026)

`.sitenav-links` was IBM Plex Mono, `var(--soft)`, 11.5px. So is `.issue`, the page caption
sitting directly underneath it in the same bar. Same family, same colour, effectively the same
size, differing only in case and tracking - which at that size in grey is almost no signal. Tim's
report was that the menu "reads like the byline", and it was literally true rather than
impressionistic.

Now `var(--font-cond)` 600, 13px, 0.08em, `var(--ink)`.

**Same family as the wordmark, deliberately NOT the same weight.** The wordmark is condensed 700
at 0.16em. Matching that makes the bar one texture and the wordmark stops being the anchor it
exists to be.

**The colour is the larger half of the change.** The family is what stops it matching `.issue`;
`--soft` to `--ink` is what gives it any confidence. Tried both ways in the browser before
choosing.

**Condensed uppercase was already this design's label register** - `.wizard-field .k`,
`.locations-tag`, `.wizard-add`. A nav is a row of labels, and it was the only one written as
caption text.

**And a menu needs to say where you are.** There was no current-page state at all: standing on
`/pricing`, the word PRICING in the bar looked exactly like the other two. `SiteNav` is now a
client component for the single purpose of reading `usePathname`, which changes no call site -
every prop is a string or a boolean and neither it nor `Wordmark` is server-only. The alternative
was passing the path in from twelve pages, which is twelve places to forget.

Verified: the marker lands on exactly one item per page and never on the green CTA, at 390 and at
desktop. `.sitenav-links a.button-green` (0,2,1) still beats `.sitenav-links a` (0,1,1), which is
the specificity trap that made this bar's CTA unreadable once before. Condensed is narrower than
mono, so at 390 the three labels now fit on one line, and the scan field is above the fold at all
four heights - 667, 780, 844, 932.

## The home page had nothing about sources (29 Aug 2026)

"Three things this is not" came off the home page. It summarised three claims each argued
properly somewhere else: the score out of 100 and the API substitution are both on `/about`, and
"why we don't check every day" is a whole section on `/method` with four cited studies behind it.
A summary of arguments made better on two other pages was holding space on the most valuable
screen on the site.

**What replaced it was a gap, not a preference.** The word "source" did not appear on the home
page once, and where an answer comes from is half the product - section 5 of every report is the
cited domains, per surface. `aiOverviewCoverage()` has been telling subscribers that their
category's trigger rate is itself a finding since Session 4, and the site never said so.

**Every number in the new section is ours and measured**, from the run recorded in
`lib/method.ts`: comparison questions 0/3, `how_do_people` 3/3, and the earlier bake-off on a
different category at 10/10. Nothing there is a number the pipeline did not produce.

**And the nav's green button was the last thing wearing the old face.** After the bar moved to
condensed caps, `.button-green` was still IBM Plex Mono, sentence case, 0.04em - so the one item
we most want clicked looked like it belonged to a different design. It is used nowhere but
`SiteNav`, so it changed at the source rather than by another override. `.sitenav-links
a.button-green` survives for the colour alone, and must: `.sitenav-links a` scores (0,1,1) and
beats `.button-green` at (0,1,0), which is the exact specificity bug that made this button
unreadable once already, in the other direction.

**The descendant-selector baseline only ever shrinks.** It was 53; `.nots li` and
`.nots li:first-child` came off when the block was replaced and the new list gave its rows a
class. The comment no longer states the count - a number written beside a list is a number that
goes stale the first time the list changes, and that one already had.

## The nav bar, aligned and given a strapline (29 Aug 2026)

**One baseline from the wordmark to the button, and the fix was in the lockup rather than in the
row.** A flex container reports the baseline of its FIRST flex item, and `.lockup`'s first item is
the mark - a replaced element with no baseline, so the browser synthesises one from its bottom
edge. The lockup was telling the row its baseline was 6px below the wordmark's actual text
baseline, and no `align-items` on the row could correct that. `.lockup` is now `inline-block`,
whose baseline IS its last line box, and the mark keeps its optical centring with
`vertical-align: middle`. Measured across the wordmark, a menu item and the button: **0px, against
1.9px when the row was centred.** The lockup renders identically - checked at 3x.

**The green button was the only item on a phone that was not shrinking.** `.sitenav-links` drops
to 11px under 640, and `.button-green` sets 13px on the element, which beats inheritance. So the
CTA sat two points larger than the menu it belongs to and cost the row the 16px that pushed it
onto a line of its own. At 11px with a 10px gap the whole bar fits one row at 390 and 414, and the
nav is **88px instead of 124px**. 360 still wraps to two rows, intact, which is what that media
query was written to do.

**`issue` was doing two jobs and the important one was losing.** It renders "Pricing", "About",
"Account" - a word telling you where you are - and the home page was pushing a whole value
proposition through the same slot, getting caption treatment for it: grey, 12px, the quietest type
on the page, directly beneath a bar that had just been made loud. `tagline` is now its own prop
and its own class: ink, 13px, sentence case, mono kept because mono is this site's measurement
voice and the sentence is a list of measurements.

The copy is Tim's four beats with two changes. "Discover" came out: the copy rule's own test is
"if a sentence would survive on any SaaS site in the world, rewrite it", and it would. And "AI
says about you / its recommendations" became "the assistants say about you / they recommend you",
because treating them as one entity is precisely what the method page spends a page arguing
against - **we measure surfaces, not models**, and the strapline should not undo that in the first
sentence anybody reads.

Also fixed here: `/faq` still passed `issue="Questions"`. The footer link was renamed to FAQs on
28 Aug and this one was missed.

## The product had the right word and the marketing drifted off it (29 Aug 2026)

`lib/scope.ts` and the live Stripe product description have both said **"three ranked actions"**
since the price ladder was built. The home page, the FAQ, the about page, the confirmation page
and the confirmation email had all quietly become **"three things to do"** - which says nothing
about what makes them ranked, in what order, or why. The system of record was right and every
customer-facing surface had drifted.

Also gone: the definite article. "The three things" reads as machine-written; "three ranked
actions" does not need it.

`copycheck` now refuses `things to do` and `three things`, proven by putting the old wording back
on `/about` and watching it fail. **Narrow on purpose** - it does not ban the word. "The whole
thing", "not the same thing" and "different things" are ordinary English, and rewriting those
would make the copy stilted. It bans the two phrasings that were standing in for the
deliverable's real name.

**"Actions that will move the needle" was considered and not used.** It is exactly what the
buzzword rule's own hint describes: a sentence that would survive on any SaaS site in the world.
"Ranked, in order, with why that one is first" says the same thing and can be checked against the
report.

## The strapline was being wrapped by a constraint, not by the page (29 Aug 2026)

`.sitenav-tagline` was written with `max-width: 72ch` on 29 Aug. At 13px mono that is 562px
against a container of 892px, and the sentence needs 833px - so it fits on one line at every
desktop width and was being broken in half by a number nobody had checked. My own defect from the
change one commit earlier, and the sort that looks like a design decision.

Removed, plus `margin-top: 11px` (it had none at all, sitting flush against the nav row with 12px
to the rule below) and `padding: 12px 0 14px` on `.sitenav`.

One line reads as a strapline; two read as a paragraph that got stuck. Between 640 and about 900
it does still wrap, and `text-wrap: pretty` keeps a single word off the last line there - checked
at 860, where it breaks after "and three".

**Three alternatives were rendered and rejected.** Balanced two lines broke mid-phrase, at "how /
often", and `text-wrap: balance` cannot fix that in a monospace face. Moving the line below the
rule into the hero orphaned it from the brand it describes.

## /sample was a dead end, and the site nav cannot go on it (30 Aug 2026)

`/sample` is a `route.ts` returning a whole document from `renderReport` - the same function
`/report/[runId]` uses. It is indexable, it is the page most likely to be forwarded, and it had no
link anywhere back into the site.

**AMENDED 30 Aug 2026 - the nav was built after all, and the first fix did not work.** The
wordmark link and the closing block below are still there and still correct, but on their own they
left the page a dead end in practice: the link looked identical to plain text, and the closing
block sat at 5,461px of a 5,801px document, 94% down. A fix nobody can see is not a fix. See the
section below.

**The obvious fix is the one that cannot be done.** Putting the site nav above the report means
loading `globals.css` and `REPORT_CSS` on one document, and **twenty five class names are defined
in both**: `wrap`, `issue`, `wordmark`, `lockup`, `masthead`, `card`, `note`, `lede`, `eyebrow`
among them. That is the cascade collision this build has already paid for twice - the wordmark
going grey under `.wordmark span`, and the nav CTA going unreadable under `.sitenav-links a`. The
sample stays one self-contained document.

**What was done instead, both inside the report's own stylesheet:**

- The masthead wordmark is now a link home. Zero visual change, works on a subscriber's own
  report too, and it is what people click by instinct.
- A closing block at the END of the sample. Somebody who read that far read a whole report and is
  the warmest traffic on the site; somebody who bounced off the top was never going to be
  persuaded by a button. It is also the only position that does not interrupt the document, which
  is the thing being demonstrated.

**The free scan leads, not the price.** A good share of the people on this page have never seen
the home page, and sending a stranger straight at a US$69 subscription skips the free thing that
exists to convince them.

**`publicSample` is a separate flag from `specimen` and must stay separate.** `specimen` means
invented data. This means "a stranger is reading it with no other way in". Setting `SAMPLE_RUN_ID`
publishes a REAL report at `/sample` - not a specimen, and still needing the way out. Collapsing
them would silently drop the block on the day this page first shows a real customer.

## The brand render kit is in the repo, and brandcheck now reads it (30 Aug 2026)

`brand/` is the generator for every Facebook, LinkedIn, ad and favicon asset. Fonts are embedded
as base64 in `scripts/fonts.json`, so it runs offline with Python, Playwright and (for video)
ffmpeg. 49 files, 4.5MB. Without it, changing a headline or adding a size means rebuilding the
whole thing.

### The palette was in four places, not three

The brief for this said `gen_g.py`'s `BASE` block was the third copy. It is spread across **six
scripts** - `gen_g.py`, `gen_ads.py`, `gen_brand_social.py`, `gen_favicon.py` and all three
`gen_video*.py` - and `brand/README.md` prints it a fourth time as documentation. Eleven distinct
values, every one of them a `BRAND` token.

Checking only `gen_g.py` would have been a guard reporting healthy while five other files drifted,
which is this repo's most expensive recurring shape.

**The rule is the strong one: every hex literal anywhere in `brand/scripts` must be a value in
`lib/brand.ts`.** Not a listed subset - any colour that is not a token is either drift or a new
token that belongs in `lib/brand.ts` first. `#fff` is normalised to `#FFFFFF` so the two spellings
cannot diverge silently.

Proven by breaking it three ways: a one-digit change to `--green` in `gen_g.py`'s BASE block
(caught with file and line), a wrong `--ink` in the README table (caught separately), and moving
`brand/scripts` away entirely - which reports *"the render kit is committed; its absence is a
mistake, not a pass"* rather than a clean run over zero files. `npm run check` exits 1 in each
case.

### Two things the kit records that no check can enforce

`brand/README.md` documents two deliberate departures from §2 of the site brief, and both are the
kind of thing a tidy-up reverts.

**Green on one word, not a panel** - still true, `.thesis-lit`.

**Nav tracking below the spec's `.14em`** - and this one had already gone stale. The README said
`.11em`, which was right while the nav was mono. The bar moved to IBM Plex Sans Condensed 600 on
29 Aug and the tracking with it, to `.08em`, because a narrower face needs less tracking to read
as caps. The README and `app/globals.css` now both carry the reasoning and both say plainly that
**nothing enforces a tracking value** - those two paragraphs are the whole defence.

### The retired lockup now raises instead of drawing (30 Aug 2026)

The four live creatives carry the five-in-a-row mark and stay exactly as they are - they are
finished files. The risk was never those; it was the NEXT render quietly reproducing the mark,
which `brandcheck` cannot catch because geometry is not a colour token.

**Documenting it was not enough, so it was made impossible.** `bars()` raises a `RuntimeError`
naming its replacement.

**And it was five places, not one.** The brief named `gen_g.py`. `gen_ads.py` carries its **own
copy** of `bars()` rather than importing it, and `gen_video.py`, `gen_video45.py` and
`gen_video169.py` have no `bars()` at all - the five-cell loop is inlined inside their own
`lockup()`, so the stub goes one level up there. `gen_g_video.py` inherits the failure by
importing `lockup` from `gen_g`. Stubbing only the named file would have closed two paths of six
and left three video scripts silently drawing it - the same defect in a new costume, which is
what the widened palette check had just been corrected for.

`range(5)` no longer appears anywhere in `brand/scripts`.

**Verified against the pristine archive, because the local machine has no playwright and a shim
produces failures of its own.** Running every script through the same fake playwright before and
after shows five changed and four unchanged: `gen_brand_social.py` and `gen_linkedin.py` already
use `grid_mark()`, `gen_favicon.py` is retired for other reasons, and `gen_g.py` still imports
cleanly - its failure comes on the render, proven by calling `gen_g.lockup()` directly. The
`AttributeError: __aenter__` seen on several scripts is the shim and is present in the untouched
archive too.

**They are meant to stay failing.** Fixing them is the next ad's job: swap the call for
`grid_mark()` and delete the stub in that file only.

## A file list that nothing opens is not an inventory (30 Aug 2026)

The Files table above listed seven artifacts. Four were on disk. Three — `wordofmodel-offer-sheet.md`,
`wordofmodel-ad-copy.md`, `wordofmodel-site.html` — were not, and never had been.

Not deleted, not renamed, never in the repo. `git rev-list --all` piped through `git cat-file -e`
finds no tree on any branch containing any of the three paths. No path matching `offer`, `ad-copy`
or `site.html` has ever been added in any commit. The first commit, 0c2d740 (17 Aug 2026), already
contained the table in exactly the form it had on 30 Aug: `git log -S'wordofmodel-offer-sheet.md' --
CLAUDE.md` returns that one commit and no other, so the table was written once, wrong on three of
seven rows, and never touched again. They are also not anywhere else under the connected folder.

The likely cause is in the header of this file: the seven artifacts were built inside a claude.ai
conversation on 1 Aug and "existed **only** inside that conversation" until the 10 Aug recovery.
Four made it into the repo. Three did not, and the table went in describing all seven. That is a
guess about the cause. The absence itself is measured.

What it cost: twelve days in which the commercial spine of the product was listed as a file in the
repo and was not one, and the first thing any session did was read this table.

The rule. **A list of filenames is a claim about the filesystem, and an unchecked claim decays
silently.** The failure mode is specifically quiet — a name that resolves to nothing renders exactly
like a name that resolves to a file, in every reader, until someone types `ls`.

The guard: `scripts/docscheck.mjs`, wired into `npm run check`. It opens every path the table names,
and every backticked `wordofmodel-*.md`/`.html` token in the prose, because the sentence under the
table made the same claim about the same absent file. Two absences are made loud rather than quiet:
a missing `## Files` section fails, and a section that parses to zero rows fails, since an empty
table and a satisfied one would otherwise print the same clean pass. Watched failing on 30 Aug 2026
against the three real absences before the rows came out, and again by deleting a listed file.

Not restored, because there is nothing to restore from. The three rows were removed. If the offer
sheet or the ad copy is recoverable from the 1 Aug conversation, it comes back as a file first and
a row second — in that order, or the check fails, which is the point.

## First-party reviews (30 Aug 2026, migration 0023)

`/review` collects them, `scripts/reviews.sh` moderates them, `/reviews` shows them. Built on the
existing architecture throughout: no new SaaS, no CMS, no new auth.

**What is deliberately NOT collected.** No surname, job title, company, company URL, LinkedIn or
photograph. Not brevity - the subject matter is unflattering to the reviewer. "I found out I was
invisible on ChatGPT" is not a sentence a business wants its name against, and full attribution
would suppress the honest reviews and select for the bland ones. `category` and `location` are the
product's own vocabulary (`scopes.category_term`, `scopes.locality`), so a subscriber's can be
prefilled from their scope later.

**RLS: on, no policies at all**, the same shape as `capture_jobs`. The brief asked for anonymous
PostgREST inserts; that means a publishable key in a browser, and nothing in this build has ever
talked to Supabase from one. Submission goes through `POST /api/review` on the secret key, where
the rate limit, honeypot and consent check have to live anyway. **An unapproved review cannot
leak because no key outside this server can read the table at all**, and separately because
`approvedReviews()` is the only public read and hardcodes the status.

**Consent is a CHECK constraint, not a column to read later.** A review that may not be published
is personal data with no purpose, so the row cannot exist without it - true even from a script
somebody writes in six months.

### The two places the brief was changed

**Review gating.** It said to offer the third-party step "after someone submits a *positive*
review". That is soliciting public reviews only from happy customers, which Google's review
policies prohibit and the FTC's testimonial guidance covers. The rating is not consulted in
`/api/review` and there is no branch to remove later.

**"Posted" versus "clicked".** No platform tells us whether a review was actually left. The
column is `external_clicks`, the event is `external_review_clicked`, and the naming holds all the
way down. A column called `external_posted` would be the confident wrong number this repo keeps
finding.

### Schema, and why the rating is not on the Organization

Google does not allow self-serving reviews for `Organization` or `LocalBusiness` - reviews
collected on your own site about yourself are exactly that, so marking them up there is
**ineligible**, not merely unrewarded. `SoftwareApplication` is a supported type where
first-party reviews do qualify, so the rating lives on the product entity or nowhere.

**And it stays off until `REVIEWS_MIN_FOR_AGGREGATE` (5) approved reviews.** A five out of five
over two people is a number with no error bars, on the site whose method page refuses to print a
score out of 100 because inventing one "would make this easier to sell and impossible to trust".
`/reviews` 404s below the threshold rather than rendering a thin page. One featured quote is
shown from the first approved review, because one testimonial presented as one claims nothing.

The site had **no structured data at all** before this. `Organization` + `WebSite` now render
site-wide and `SoftwareApplication` with the real prices on `/pricing`.

**A review body is user-submitted text going into a `<script>` tag.** `jsonldText()` escapes `<`,
proven by putting `</script><img src=x onerror=...>` in a review body and watching it come out as
`\u003c`.

### `review_form_view` is fired from the browser, not counted on the server

`/start` recorded every render and accumulated 1030 rows against 2 real scans in 48 hours, because
a crawler and a person are the same thing to a server. `/review` will be linked from report emails
and crawled like anything else. A browser executing JavaScript is a far better proxy for a person
than any user-agent string - which is the conclusion 0020 reached expensively - so the two form
events post from the client. It undercounts anybody with scripts off, which is the safe direction.

`funnel_events` gained a `detail` column for the click destination. **Deliberately not
`utm_content`**: that is ad attribution and is what separates hook A from hook C in every report.

`npm run reviews:check` proves all fifteen guards, each watched refusing.

## The sample page has the real nav now, rebuilt rather than shared (30 Aug 2026)

The first attempt gave `/sample` a wordmark that linked home and a CTA at the end. Both shipped,
both were invisible: a link with no affordance is not discoverable, and 94% down a 5,801px page is
not a way out. Tim asked three times before this was actually done.

**The stylesheets still cannot be merged** - twenty five shared class names, unchanged - so the bar
is rebuilt as `.rnav-*` inside `REPORT_CSS`. No collision, and the sample stays one self-contained
document.

**The duplication is guarded.** `brandcheck` now compares `font-weight`, `font-size`,
`text-transform` and `letter-spacing` between `.rnav-links` and `.sitenav-links`, plus the button's
padding. Proven by drifting the tracking to `.11em` - the exact value that had gone stale in
`brand/README.md` a day earlier - and by changing the button padding, and watching each fail.

**Two defects a screenshot caught and the code did not.** The first build put the nav's wordmark
above the report masthead's wordmark: two identical marks stacked. The masthead now drops its
wordmark when the bar is present and keeps only its issue line, which is exactly how the site is
arranged. And the nav linked to `/reviews`, which 404s until five approved reviews exist - a nav
item pointing at a 404 is worse than an absent one. It says "Sample report", marked as the current
page.

**Sample only.** A subscriber reading their own report arrived signed in from an email and does not
need Pricing and a Free scan button over their own numbers.

Two notes for whoever writes CSS in `lib/report-css.ts` next: the whole stylesheet is a TypeScript
template literal, so **a backtick in a comment ends it** - that is how this block failed to compile
first time. And the last declaration in a minified block has no trailing semicolon, which is how
`brandcheck`'s own parser first reported a `letter-spacing` that was plainly there as missing.

## The nav decides its own items now (30 Aug 2026)

The Reviews link appears in the bar the minute there are five approved reviews, and not before -
`/reviews` calls `notFound()` below the threshold, and a nav item pointing at a 404 is worse than
an absent one. That is the rule `sampleLive` was written for.

**The interesting part is that adding it the obvious way would have doubled an existing problem.**
`sampleLive` was passed by hand at **fourteen call sites, every one of them the literal `true`**.
A second conditional item done the same way makes twenty-eight places to forget, and a rule that
depends on being remembered on every new page is not a rule.

So `components/Nav.tsx` is a server component that asks the questions once and renders `SiteNav`
with the answers. Every page now renders `<Nav issue="..." />` and knows nothing. `SiteNav` stays
a client component because it reads `usePathname` to mark the current page; `Nav` is the server
half that can reach the database.

`reviewsLive()` is **cached for sixty seconds** - it is read on every page render now, and the
count moves twice a month. It **fails closed**: if the count cannot be read the link does not
render, because a missing item is a smaller failure than one that 404s.

**The sample page's bar asks the same function**, passed in through `renderReport`'s options
rather than read inside it - that module renders a document and should not be making database
calls. The two bars therefore turn the link on in the same minute rather than drifting apart.

Proven both ways against a real database: at zero approved reviews, zero links across `/`,
`/pricing`, `/method`, `/about` and `/sample`, and `/reviews` 404s. At five, one link on each of
the five surfaces, `/reviews` 200s, and the item carries `aria-current="page"` when you are on it.
Probe rows removed afterwards.

## pixel:check was testing an event the code deliberately stopped firing (30 Aug 2026)

It reported `FAIL Lead ... nothing reached Meta at all` and the failure was the check being wrong.
On 27 Aug, `7a5110a` moved `Lead` off Wizard mount - where it meant "somebody loaded /start",
ungated and re-fired on every reload, so the live campaign was optimising toward page renders -
into the reveal's success branch in `ScanResult.tsx`. The check was never updated, still opened
`/start`, and waited for an event that had correctly been taken away.

**A test describing behaviour the code deliberately stopped having is the same defect as a stale
comment, and it costs more, because somebody acts on it.** Same shape as the `.11em` in
`brand/README.md`.

### Two things I got wrong before getting it right

**I ran it wrong first.** The script's own header says
`META_PIXEL_ID=1000000000000001 npm run start` - a throwaway id against a production build,
because the real pixel trips Meta's automation detection and returns a false negative. I ran it
against `npm run dev` with no id, so both events failed for a reason that had nothing to do with
the code.

**Then I designed the fix around an assumption I had not tested.** I built a paid/skip gate on the
belief that reaching the reveal always costs a scan. It does not: **`/api/detect` returns the
stored RESULT for a domain already scanned in that environment**, the confirmation screen never
appears, and no engine is asked. Written for the confirmation step, the check failed twice against
a cached domain with an error saying the button had not appeared - true, and completely
misleading.

The Lead case now RACES the two outcomes rather than assuming either. Free on a scanned domain;
on an unscanned one it reports itself skipped with the reason and the cost rather than quietly
spending US$0.37. A skip is never folded into the pass line - the summary says how many of how
many actually ran, for the same reason the location reconciliation returns `examined`.

Proven both ways: `holafly.com` (stored) passes PageView and Lead free in one run; `ubigi.com`
(not stored) passes PageView and skips Lead. Probe email cleared from the scan row afterwards.

## ViewContent is the completed free scan (31 Aug 2026)

It fired two lines above `Lead`, in the reveal's success branch, so **both events described one
action - somebody giving an email - under two names**. Meta had two conversions to bid on and no
way to tell them apart, and a campaign optimised for either was optimising for the identical
thing. The comment in `MetaPixel.tsx` still described the arrangement from before 27 Aug, which is
the second time that list has been wrong; it now names the file each event fires from.

Now:

| event | where | what it means |
|---|---|---|
| `ViewContent` | `ScanPanel.tsx` | the free result is on screen |
| `Lead` | `ScanResult.tsx` | an email was given and the gated result returned |
| `InitiateCheckout` | `Wizard.tsx` | just before a Stripe session |
| `PageView` | `MetaPixel.tsx` | load and every soft navigation |
| `Purchase` | nowhere | server-side only, and the CAPI token needs a business portfolio |

**A cached result still counts.** The visitor typed a domain, agreed the profile and saw a result;
whether we paid an engine for it is our business and not a fact about their intent.

**Why it matters commercially.** Since the 28 Aug cutover: 8 scans completed, **0 reveals**. Five
reveals all time. Meta needs roughly fifty conversions per ad set per week to leave the learning
phase, so optimising for `Lead` would have left an ad set in learning permanently. ViewContent at
about nineteen a week is still short of that but is the right order of magnitude and grows with
spend.

`pixel:check` gained a ViewContent case that stops at the result, and the walk to that point is
now ONE function shared with the Lead case - written twice, the two would eventually test
different journeys, which is the exact failure the file exists to catch reproduced inside it.

### Three things that cost time, all mine

**A stale build.** The check failed against a server started before the change. **A dead server.**
`pkill -f "next start"` matched nothing, the old process kept port 3000, and `next start` failed
with EADDRINUSE into a log I was not reading - so the browser got 500s for chunks of a `.next` I
had just deleted, and reported a ChunkLoadError I spent two rounds treating as a page bug. Check
the port is free, not that a pkill returned. **And "already scanned" means within 24 hours**, not
ever: `findCachedScan` uses a rolling day, so a domain that was free yesterday costs US$0.37
today. The skip message said "no stored scan", which sent me looking for a missing row that was
there and merely too old.

## "JWT issued at future", and asking twice before switching the offer off (1 Sep 2026)

Three alerts on 30 and 31 Aug read *Founding count unavailable - the offer is being withheld from
every visitor*. The guard was right and nothing was mis-sold: the count could not be read, the
founding block did not render, and every visitor saw the standard US$249 rather than a discount
nobody was counting.

**The cause was `Founding count failed: JWT issued at future`** - Supabase refusing a token whose
issued-at claim was ahead of the clock validating it.

**It is not our token.** `SUPABASE_SECRET_KEY` and `SUPABASE_PUBLISHABLE_KEY` are both the new
`sb_secret_` / `sb_publishable_` format and neither is a JWT. The token being rejected is minted
inside Supabase, so the skew is between their own components. Transient, self-clearing, and
**writes to the same database succeeded seconds either side** - 7 funnel rows around 08:42, 4
around 15:03 - which is what rules out connectivity.

**The retry did not work, and the alerts proved it.** Both attempts failed with the identical
error 150ms apart, twice, on 1 Sep - visible only because 0024 had started storing the reason. So
the skew outlasts a short retry: it is a window, most likely one gateway node whose clock is
ahead, not a flicker. The retry now runs only on a cold instance, which has nothing cached and
nothing else to try.

**What replaced it: the last count that read cleanly is served for sixty seconds when the live
read fails, while it shows more than three seats of room.**

*(Superseded 3 Sep 2026: the fail-closed rule this paragraph defends was itself reversed. The
cache survives and now decides whether a real number is shown, not whether the offer is. See
"A guard can be more expensive than the risk it prevents".)*

That is not weakening the fail-closed rule, and the reason matters. The rule exists to stop an
unreadable counter handing out unlimited permanent discounts - and it never did that work alone.
`claim_founding_seat` decides the charge atomically in Postgres at the moment of buying, and this
repo's own principle §3 is that the check belongs where the decision is made rather than where the
number is shown. A page showing US$149 hands out nothing by itself. A stale count can only cost
anything if more people buy inside a minute than the margin allows, and near the cap it falls
closed exactly as before, because that is the only region where staleness could overshoot.

What failing closed DOES cost is real and was being paid: every visitor sees US$249 for the
duration, at the one moment they were closest to buying, while the page looks completely normal.

All three branches watched: cold instance with a broken query WITHHELD; warm cache with a broken
query SERVED the 20-remaining count and logged that it had; and with the margin raised above the
cached figure, WITHHELD with *"showed only 20 places left, inside the margin of 25, so it was not
trusted"*.

**Deliberately not a classifier.** Retrying only on "JWT issued at future" would be a list of
strings, and a list of strings is exactly what 0020 removed - it knew three bot names and every
other crawler walked past it. Retrying anything once costs one query; a genuine failure fails
twice and still fails closed. Proven by pointing the query at a table that does not exist:
withheld, alerted, 1999ms across both attempts, and the healthy path still returns on the first
in 183ms.

### The alert could prove it happened and not why

`ops_alerts` recorded the subject, the recipient and whether Resend accepted it. The reason lived
in one inbox and in a `console.error` the Vercel CLI does not return, so the same investigation
started from nothing three times. 0024 adds `detail` and `sendOpsAlert` fills it on all three
paths, including the one where the email itself failed - the case that needs it most.

## The scan invented a city, and inverted the transaction (1 Sep 2026)

Governed by `word-of-model-scan-grounding-and-confirm.md` and `word-of-model-engineering-principles.md`,
both now in the repo root beside the other briefs.

One run, `generalhavelock.com.au`, produced *"Which Australian pub food and drinks supplier can
reliably cover 20+ venues across metro Melbourne and regional Victoria..."* for a single pub at 162
Hutt Street, Adelaide. Two errors, and **both were two lines of code rather than a vague prompt
weakness**:

```js
country: (p?.country?.trim() || 'Australia')   // confirmProfile, app/api/scan/route.ts
"close to choosing a supplier of ${what_they_sell} in ${country}"   // questionPrompt
"- Include the country or region."             // ...and its rules
```

A country the model could not determine became Australia in the same shape as a found fact, and
the prompt then instructed the model to name a place. That is principle §5 exactly, and §5's own
list already contained "a failed count and a genuine zero, identical on the page".

`buyer` was extracted, carried on the profile, and **dropped** before generation. The word
"supplier" was hardcoded, so every business came out selling into trade.

### What makes a wrong city unrepresentable now

`questionPrompt(profile, brandName)` takes a `BusinessProfile` and nothing else - no site text, no
country string. **One line narrows a wide profile to the three facts the generator sees**
(`profileFrom`, lib/profile.ts). So "could a city reach the prompt from anywhere else" has one
answer, and there is deliberately **no downstream check hunting for wrong cities** - principle §1
says that is the second-best version.

**And that one line is now enforced by the type system rather than by a grep.** `BusinessProfile`
carries a brand keyed on a `unique symbol` that `lib/profile.ts` declares and never exports, so no
other file can produce a value of the type. An object literal does not satisfy it. A second
narrowing therefore does not fail a review or a script - **it fails the build, at the call site,
in the editor**. Watched failing:

```
app/api/scan/route.ts(160,32): error TS2345
  Property '[narrowed]' is missing in type '{ sells: null; buyer: null; location: Fact | null; }'
```

The confirm card takes the unbranded `Facts` instead: it renders and edits three fields, it does
not narrow anything, and it must not be able to hand the generator a profile. The only remaining
route past the brand is an explicit `as never`, which is legible in a diff - which is the trade
this buys, and it is the right one.

`Provenance` is `'extracted' | 'confirmed'`. There is no `'inferred'`, and adding one later as a
convenience is the defect with a name.

### Three defects only the real runs found

Reasoning would have missed all three; §6's runs caught them.

- The first Havelock re-run extracted the whole postal address and asked *"...at 162 Hutt Street
  Adelaide SA 5000?"*. Correct on both original counts and still a question nobody would type.
- `whogivesacrap.org` extracted `"Melbourne, VIC"` from a head office and asked *"Which Melbourne,
  VIC stores..."* for a company that ships nationwide. A **true fact used as the wrong geography**.
  Extraction now asks where the CUSTOMERS are and returns null when a business is not chosen by
  where it is.
- `darwindental.com.au` returned the literal string `"None"`. `clean()` rejected 'null' and
  'unknown' but not 'none', so the card would have rendered a found fact reading "None".

### The confirm card

Three facts at the seam between writing the question and asking the engines, so the question is
written in `/api/detect` now. The client hands it back unchanged when nothing was corrected and
drops it the moment a fact is edited - reusing it would make the card decorative.

**One component, consumed by the scan and by `/start` step one.** An empty field carries a dashed
rule, the red-pen colour and its own line saying what could not be found.

Fold re-measured at 390 x 844 / 734 / 664 / 628: input and button bottom at 508px, unchanged. A
full timed run with the card is **45 seconds**, against a promise of about three minutes, so no
copy moved.

### The same inversion was in the paid path

`lib/wizard-prompts.ts` framed the client as "a supplier of X" in both `questionsPrompt` and
`rewriteSlotPrompt`. The slot structure absorbs most of it - "CATEGORY: who is best at X in Y"
runs the right way whatever the framing says - but slots 2 and 4 are written in the buyer's own
voice and a procurement register leaks straight in.

**It is not a ban on the word "supplier".** `westcoastdental.com.au` genuinely sells to dentists,
and a trade question is the right one there. `buyer` is what decides direction, which is why it is
now named in the first line rather than only inside slot 2. Proven by generating both shapes: the
pub's five questions are from people choosing where to eat, the dental supplier's ask about trade
pricing and restocking.

**No existing subscriber is affected.** Approved questions live in `questions` and are read from
there; a prompt change only writes new ones.

The geography half does not apply to the paid path: `place` comes from a closed ISO list plus a
locality the subscriber typed, so that generator cannot invent a city.

## The 24 hour scan cache, and the three ways it misleads you (1 Sep 2026)

`findCachedScan` re-serves any completed scan of the same domain for 24 hours. It is cost control
and a feature - a repeat visitor sees their previous result - and it caught the same person three
times in one day while verifying the grounding work.

**1. A cached run skips everything you are trying to test.** `/api/detect` checks the cache first
and, on a hit, emits `question` and `result` and returns. No site read, no extraction, no confirm
card. So re-running a recently scanned domain does not exercise the pipeline at all: it replays a
row. Re-verifying `generalhavelock.com.au` was impossible until the cached row was deleted, and
the row it kept serving was the DEFECTIVE question from the morning.

Clear the row first, and print it before you do - it is usually the evidence:

```
delete from scans where domain = 'generalhavelock.com.au';
```

**2. A cached response emits no `detected` event, so anything reading the profile reads nothing.**
The verification parser used `prof.get("what_they_sell")` and printed Python's `None` for the
missing keys, which rendered as `sells="None"` - **character for character identical to the real
`"None"` string leak found on `darwindental.com.au` and fixed the same hour**. A production check
minutes after a push appeared to show a null profile that had somehow still written a question,
which is impossible, and it was one step from being reported as a regression in freshly shipped
code. Principle §5 committed by the tooling built to hunt principle §5. The parser now prints
`CACHED - no extraction ran` and labels the question as coming from the cache.

**3. "Already scanned" means within the last 24 hours, not ever.** A domain that is free to test
today costs about US$0.37 tomorrow, because the window is rolling. `pixel:check` said "no stored
scan here" and sent somebody hunting for a missing row that was present and merely too old.

The general shape, and it is §5 again: **a cached path and a fresh path must not produce
identical-looking output.** Wherever one is possible, say which one happened.

## The scan result never learned about the US$69 tier (1 Sep 2026)

The offer block after the email reveal - the single highest-intent moment on the site - carried
**one button, to the expensive plan**. It read *"US$149/mo founding rate, 20 places"* at the top
and *"US$249/mo. Founding rate US$149/mo"* at the bottom, and never mentioned Monitoring at all.

The two-tier ladder shipped on 28 August. This page was written before it and was never revisited,
so the cheapest product - and the one most free-scan visitors would actually buy - was invisible
exactly where someone had just seen evidence they needed it. Not a presentation preference: a page
left behind by a pricing change, which is §8 of the principles in the other direction. Architecture
and copy disagreed, and only the copy reached the customer.

Now two doors of identical width, each carrying its own price:

```
[ Monitoring, US$69 a month ]   [ Monitoring + Review, US$249 a month ]
```

**Each door names its own plan**, so the wizard opens on the tier that was clicked rather than a
default nobody chose - `/start?plan=main&scan=…`. The scan id rides along on both, because the ad
that produced a scan has to stay knowable through the purchase.

`.button.secondary` was reached for first, to make one door quieter. It turned out to be defined
only inside `.code-row`, so it styled nothing here - and a hierarchy is the opposite of what these
two need. Both doors get the same treatment.

## The site had no traffic measurement at all (1 Sep 2026, migration 0025)

Asked how many unique visitors the site had taken, the honest answer was that nobody knew and
nobody could find out. Read from the live document rather than from the dependency list: the only
third-party script on `wordofmodel.ai` was `connect.facebook.net/en_US/fbevents.js`. No Vercel Web
Analytics - that requires `@vercel/analytics` and an `<Analytics />` in the root layout, neither of
which existed. No Plausible, no GA.

**The runtime log could not answer it after the fact either**, which is the part worth writing down
because it is the instinct everybody has first. Vercel keeps runtime logs for **one hour on Hobby
and one day on Pro**; thirty days needs the Observability Plus add-on. The ad week was already gone.
And runtime logs cover function and middleware invocations plus cached static requests, so a
statically served page can produce no line at all - it would have undercounted even inside the
window.

**Why `funnel_events` was the wrong place to fix it.** Since 0020 a `landed` row requires a click
id, which makes it a count of paid clicks. That is the correct definition and it is deliberately
blind to every organic visitor, who arrives with no click id. Widening the landing gate to include
them is the 0019 mistake in reverse, and it would corrupt the one number the ad test is read from.
So traffic got its own instrument.

`visits`, one row per visitor per **Adelaide** day, written from `proxy.ts`:

- **The primary key is the guard.** `(day, visitor_hash)` - a visitor cannot be counted twice in a
  day, enforced by Postgres rather than by the application remembering. 0020 assumed dedup existed
  and it did not.
- **The day is inside the hash.** `sha256(salt : day : ip : user-agent)`, so the same person
  tomorrow is an unrelated value. Nothing here is a durable identifier and no consent banner is
  needed. It also means daily uniques can never be summed into a monthly unique count, and
  `scripts/visits.mjs` says so under the total rather than leaving it to be assumed.
- **`ip_hash` is the join key**, and the one deliberate departure from the brief. It is the
  static-salt hash from `lib/ratelimit.ts`, byte for byte, so a visit can be joined to the scan it
  produced without a cookie. Without it the table says how many people came and nothing about what
  they did, which is the complaint that produced it. The formula is duplicated because
  `lib/ratelimit.ts` is `server-only` and drags the Supabase client behind it;
  `scripts/visits-check.mjs` recomputes it and fails if the copies drift. **A silent divergence
  would make the visit-to-scan rate zero rather than throwing.**
- **Server side, and that is the whole point.** A browser script is the ordinary way to count
  visitors and the one thing that cannot answer this question, because the open worry was whether
  ad traffic executes our JavaScript at all. An instrument that only works when the page's
  JavaScript works cannot tell you the page's JavaScript is not working.
- **It is not on the response path.** The row is handed to `event.waitUntil`, so it is written
  after the response has gone. Awaiting it would put a Supabase round trip on every navigation to
  buy a number nobody reads until 8am.
- **The prefetch is the thing that would have ruined it.** `next/link` prefetches on hover and on
  viewport entry, so one visitor scrolling the home page issues several requests. Counted, that is
  the phantom 4.6x again. `lib/visits.ts` drops prefetch and RSC requests and
  `scripts/visits-check.mjs` holds the headers in place through a Next upgrade.

`lib/touch.ts` was carved out of `lib/funnel.ts` for this: `proxy.ts` needs the URL parsing and must
not pull `server-only` and the whole database client into the bundle that runs ahead of the front
page. `lib/funnel.ts` re-exports it, so no caller changed.

### Meta's landing page views are modelled, and the docs were reasoning from them

Both project documents concluded "100+ landing page views, zero `ViewContent`, therefore visitors
are not engaging with the scan". That inference rested on a premise that stopped being true in
**July 2025**: Meta no longer requires a pixel to report a landing page view. It models them, from
the outbound click and how long before the person returns to the app. **A landing page view is
therefore not evidence that a browser ran our code.**

So the first number to read is not the funnel. It is Events Manager's `PageView` total activity
against Ads Manager's landing page views for the same window. If those agree, it is a landing-page
finding. If `PageView` is a fraction of the other, no change to the page can fix it. Same class of
error as 0019: a measurement believed because of what it was named.

### Microsoft Clarity, and the sentence it would have made false

Added behind `NEXT_PUBLIC_CLARITY_ID`, unset by default, to answer where visitors stop between the
ad and the free result - four unlogged deaths, including the grounding confirmation step and the
"that does not look like a website address" rejection, which fires with no event and no server
request at all.

`app/privacy/page.tsx` said, in so many words, **"No analytics. No Google Analytics, no session
recording, no heatmaps."** One environment variable would have made that false with nothing failing
and nobody touching the file - the exact drift the privacy page's own header says it exists to
prevent. The claim and the disclosure are now two branches of one condition read from
`env.clarityProjectId`, on the same pattern the advertising paragraph already used for `metaMode()`,
and `scripts/visits-check.mjs` fails if either branch is deleted. **There is no state of the
environment in which that page is wrong about it.**

Every field that can hold an email address carries `data-clarity-mask="true"`. Clarity's default
masking is a setting on somebody else's dashboard and can be changed by whoever is logged in; the
guarantee has to be in the page. `analyticsAllowedFor()` was split out of `metaAllowedFor()` so the
region list stays in one place - reusing the latter would have made Clarity depend on whether a Meta
pixel id was set, which is a coupling nobody would guess from the call site.

**It comes back out when the question is answered.** Instrumentation that outlives its question
becomes furniture nobody audits.
