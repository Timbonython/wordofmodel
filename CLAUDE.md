# Word of Model — build set

Recovered 10 Aug 2026 from the claude.ai chat "Automating AI visibility audit subscriptions"
(project Tim's Clone). All seven artifacts were built 1 Aug 2026 and existed **only** inside that
conversation until now.

## Settled

- **Name:** Word of Model. Domains registered: .com, .com.au, .io, .ai
- **Entity:** Timothy Pearce, registered sole trader with an ABN. Not GST-registered
  (under the AUD 75k threshold; watch it at ~15 subscribers, since the trigger is *projected* turnover)
- **Price:** USD 249/mo. Founding rate USD 149/mo for the first 20 subscribers, locked 12 months
- **Engines:** five, held deliberately — ChatGPT, Gemini, Perplexity, Google AI Overviews, claude.ai
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
- **Publishable key — not needed for v1.** Only required if the browser calls Supabase directly, which
  this design never does. Create one if you like; nothing will use it yet.

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

**Deliverability rule to hold:** wordofmodel.ai is the *transactional* domain — it delivers the product.
When cold email starts (see the ad copy file), send it from a **separate subdomain or domain** so a spam
complaint on outreach can never poison the address that delivers scan results.

Redirect-only domains (.com, .com.au, .io) send no mail: give each `v=spf1 -all` plus a DMARC record so
they can't be spoofed.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
