# Word of Model — project handover
**29 August 2026.** Everything needed to stand this up as its own project, and an inventory of what lives where.

---

## 1. Split it, and here is the actual reason

Not size. The current project holds 43KB against a 2MB ceiling, so capacity is irrelevant and will stay irrelevant.

**The reason is shareability.** `Tim's Clone` contains `tim-personal-dna.md`, `tim-personal-dna-expanded.md` and `frame-fy27-fy29-plan-working-notes.md`. Word of Model will eventually involve someone else — a developer, a partner, a first employee, an accountant. The moment that happens, the choice is between handing over Tim's personal profile and Frame's three-year financial plan, or rebuilding the context from scratch. Neither is good.

**Second reason: standing instructions.** `Tim's Clone` is instructed as *"You are Ryker, my No. 1."* — a personal-assistant persona. Word of Model needs different standing rules: the engineering principles, the no-Frame boundary, the secret-handling rules, observed-not-reasoned. Today proved those get rediscovered rather than remembered when they aren't binding from the first message. As project instructions they bind every session automatically.

**Third, weakest: focus.** A Word of Model session doesn't need Frame's plan in context and vice versa. Real but minor.

**The argument against, which is real:** two places to look, and things drift. Today's most repeated lesson is that two renderings of one truth always diverge. The mitigation is a partition, not a duplication — every live document lives in exactly one project. Only the personal DNA gets copied, and it's copied because it barely changes.

> **Duplicate what is stable. Partition what is live.**

---

## 2. What moves, what copies, what stays

### Move to the new project

| Doc | Why |
|---|---|
| `claude/word-of-model-build-status.md` | Live state, metric definition, defect list |
| `claude/word-of-model-ad-hooks.md` | Hook bank A–G, what's live and withheld |
| `claude/word-of-model-growth-and-distribution.md` | Referral rules, the two piles of web content, standing rules |
| `claude/word-of-model-pricing-and-stripe-plan.md` | The ladder, the eight prices, fail-closed rules |
| `claude/word-of-model-site-brand-and-structure.md` | Tokens, mark, nav, homepage, pricing page, report |
| `claude/word-of-model-engineering-principles.md` | The eight rules the four gates produced |
| `claude/ai-visibility-saas-productisation-plan.md` | The origin document — this is where the product came from |

### Copy into the new project (leave the originals)

| Doc | Why |
|---|---|
| `tim-personal-dna.md` | Voice and decision-making. Everything written for Tim's name needs it. |
| `tim-personal-dna-expanded.md` | Same. Both are stable, so duplication risk is low. |

### Leave in Tim's Clone

| Doc | Why |
|---|---|
| `frame-business-dna.md` | Frame, and the boundary drawn on 28 August says Word of Model has no Frame connection |
| `frame-fy27-fy29-plan-working-notes.md` | Frame financials |
| `project-backlog.md` | Cross-cutting |
| `claude/rod-buchecker-ai-visibility-audit-jul2026.md` | **Frame client work.** See below. |
| `claude/winem8-ai-visibility-audit-jul2026.md` | **Frame client work.** See below. |
| `claude/ai-visibility-positioning-and-pitch.md` | Judgement call — if this is Frame's consulting pitch it stays, if it is Word of Model's positioning it moves. Tim knows which. |

**On the two client audits.** They are the only real audit data that exists, and both the sample report and the article would be stronger with them. They are also Frame client engagements, and on 28 August the rule was set that Word of Model carries no Frame connection anywhere. Moving them across the boundary is the same decision as putting a client's name on `/sample` — it needs the client's permission, not a file move. **They stay in Tim's Clone. Word of Model runs its own.**

---

## 3. Everything that is NOT in any project

This is the part worth having written down, because it is currently only in one person's head and one long conversation.

### Live product

- **Site:** wordofmodel.ai, Vercel, region `iad1`
- **Repo:** github.com/Timbonython/wordofmodel, working copy at `~/wordofmodel` on the MacBook Air
- **Stack:** Next.js 16 App Router, Supabase (Postgres), Resend, Stripe, SerpApi
- **CLAUDE.md** in the repo carries the accumulated rules, including the two added 28 Aug: *a fail-closed rule protects the layer it is written about*, and *architecture and copy can disagree, and only one of them reaches the customer*

### Stripe

- Live account `acct_1U5h0TCLkfCMEERf`, test account `acct_1U5h0hC3Vj3RIMHV` — **separate accounts**, not modes of one
- Legal name Timothy Pearce, public name Word of Model, statement descriptor `WORD OF MODEL`, support phone +61 439 870 393
- **Support email is unset** and falls back to a personal Gmail — outstanding
- Eight live prices with lookup keys: `main_monthly/annual`, `premium_monthly/annual`, `premium_founding_monthly/annual`, `location_monthly/annual`
- Founding trial coupon: 100% off, 3 months, scoped to the live Monitoring product, 20 one-use expiring codes
- `local_cohort_69_3mo` — was scoped to all products, being re-minted
- The restricted key used for setup **still needs rolling**

### Meta

- Ad account `263470517`, pixel `4203059133087867`
- Campaign `founding-au`, four live ads: `rival-static`, `rival-video`, `outburst-static`, `outburst-video`
- `self-check-static` and `self-check-video` paused
- UTM convention: `utm_source=meta`, `utm_medium=paid`, `utm_campaign=founding-au`, `utm_content=<ad name>`
- A "verification required for financial services ads in Australia" banner sits on the account, unresolved

### Brand assets

Rendered in this session's container from `gen_g.py`, `gen_brand_social.py`, `gen_linkedin.py` — **these scripts do not survive the session** and should be committed to the repo or saved to the Mac if the assets will ever need re-rendering.

- Ad creatives: hooks A, C, G, static and video, four ratios each
- Facebook: cover (3 copy options, ink and paper), profile
- LinkedIn: company logo 400×400, page cover 1128×191 (2 options), personal background 1584×396
- Favicons: currently the retired quote mark on disk, superseded by the generated 2+1 grid in the repo

### Documents on the Mac

`/Users/timothypearce/Claude Cowork/Tim's Clone/Word of Model/` holds the working copies of the briefs. **These will be in the wrong folder after the split** — worth moving to a Word of Model folder at the same time.

### Written today, not yet in any project

- `word-of-model-purchase-path.md` — the PriceCard invariant, homepage and pricing page
- `word-of-model-content-plan.md` — article outline and tile copy, built on the AdNews piece
- `word-of-model-competitor-landscape.md` — expanded table with confidence markers

---

## 4. Proposed instructions for the new project

The current project's instructions are a persona. These are rules, which is what this work needs.

```
This project is Word of Model — Tim's own venture, productising an AI
visibility audit as a monthly subscription at wordofmodel.ai. It is NOT
Frame Creative and carries no connection to Frame anywhere: not in copy,
metadata, Stripe, or the sample report.

How to work here:

Observed, not reasoned. Do not report something as fixed, working or
broken without an observation. A count without a stated window is not a
measurement. Absence and presence must render differently — most defects
in this project have been a missing thing looking identical to its
opposite.

Prefer impossibility over detectability. A guard that makes a defect
unrepresentable beats a check that catches it. A check beats nothing. A
new guard is not shipped until you have watched it fail.

Check where the decision is made, not where the number is shown.

Never handle secrets. Live Stripe keys, API tokens and credentials go
into Vercel marked Sensitive, never into chat, never into .env.local.
Verify a secret by prefix or character count, never by printing it.

Never invent. No fabricated reviews, testimonials, endorsement logos, or
"as featured in" claims. The sample report is a labelled specimen with
invented businesses. No claim goes on the site that the method page would
have to walk back.

Ask about Claude Code before assuming where the build is at.
```

---

## 5. Open as of this moment

- Roll the restricted Stripe key
- Set the Stripe support email to hello@wordofmodel.ai
- `WIZARD_LIVE` — verify by behaviour, not by config
- Purchase path: US$69 buyable from the homepage, PriceCard invariant
- `/writing` page, then the article
- Re-mint `local_cohort_69_3mo`
- Naming decision: share of model vs Recommendation Share, after Tourism Australia adopted the former
- Research Obsessd.ai and the AU audit competitor properly
- Hairline-grid inversion, with screenshots at 1×/2×/3×
- copycheck line numbers; `/scan/<malformed-id>` returning 500
- First completed scan from an ad click — still zero
