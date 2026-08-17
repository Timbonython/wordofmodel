# Word of Model

One page, one working free scan. Next.js App Router on Vercel, Supabase for storage, Resend for
the result email. No Stripe, no accounts, no dashboard.

Built against three specs, which stay the source of truth:

- `wordofmodel-free-scan-spec.md` - the flow, the prompts, the engines
- `wordofmodel-site-copy.md` - the page copy and the copy rules
- `wordofmodel-report-template.html` - the design system

## Running it

```bash
npm install
cp .env.example .env.local     # fill it in
npm run dev
```

`npm run check` runs the typecheck and the copy rules. Both are quick, run them before deploying.

## The scan, end to end

| Step | Where |
|---|---|
| 1. The field | `components/scan/ScanPanel.tsx` |
| 2. Read the site, detect the business | `POST /api/detect` -> `lib/site.ts`, `lib/detect.ts` |
| 3. Confirm or correct, then write the question | `ScanPanel` confirm card -> `lib/question.ts` |
| 4. Both engines in parallel, then score | `POST /api/scan` -> `lib/openai.ts`, `lib/perplexity.ts`, `lib/score.ts` |
| 5. The free result | `lib/verdict.ts` -> `components/scan/ScanResult.tsx` |
| 6. The email gate | `POST /api/reveal` -> `lib/mail.ts` |
| 7. The offer, and the waitlist | `POST /api/waitlist` |

Steps 2 to 4 stream NDJSON to the client (`lib/stream.ts`) so the visitor watches the site get read,
the question get written and each engine report back. The question is on screen before either engine
is asked. There is no bare spinner anywhere in the flow.

### The gate is enforced on the server

`/api/scan` returns the free verdict only: counts, the top recommendation, which engines ran. The
verbatim answers, the full brand list and the cited domains are assembled in `/api/reveal` after an
address is captured. Sending them early and hiding them in the client would put the whole reveal one
devtools tab away.

## Setup

### 1. Database

Paste `supabase/migrations/0001_init.sql` into Supabase -> SQL Editor and run it. It creates
`scans`, `waitlist` and `rate_events`, and enables row level security on all three **with no
policies at all**. The secret key bypasses RLS so the server still works, and nothing else can read
a prospect email even if a publishable key leaks later.

### 2. Environment

See `.env.example`. Same values locally and in Vercel.

### 3. Deploy

Push to GitHub, import the project in Vercel, add the environment variables, point `wordofmodel.ai`
at it. Add `.com`, `.com.au` and `.io` to the same project and set each to redirect to the `.ai`
apex.

## Things worth knowing

**Both engines were verified live on 17 Aug 2026,** and the parsers are written against what came
back, not against the documentation:

- The OpenAI Responses API does **not** return the `output_text` convenience field on this version.
  `output` is a mixed array of `reasoning`, `web_search_call` and `message` items and has to be
  walked. Citations arrive as `url_citation` annotations tagged `?utm_source=openai`, which is
  stripped.
- The Perplexity Agent API takes `input`, not a messages array, and mirrors the Responses envelope.
  Citations come back as a separate `search_results` item inside `output`, not as annotations.
  **Without an explicit `web_search` tool the call still succeeds and Sonar answers from memory with
  zero sources**, which is not a Perplexity answer at all, so the tool is mandatory.
- The Agent API is model agnostic and its catalogue fronts OpenAI, Anthropic, Google and xAI.
  `lib/env.ts` refuses to run unless the model is `perplexity/sonar`, and the model that actually
  produced each answer is stored on the capture and shown in the method note.

**Cost.** The spec estimates USD 0.03 to 0.06 per scan. Measured, it is several times that, and the
ChatGPT capture is the whole of it.

Perplexity reports its own cost and it came in at USD 0.006 to 0.007 a scan. OpenAI reports only
tokens, and a flagship answer with web search used **98,612 tokens** on a real scan, almost all of it
search results arriving as input. At Perplexity's resale rate for the same model that is roughly USD
0.30 to 0.60; billed direct it will be lower, but it is nowhere near four cents.

The lever is `OPENAI_MODEL_ANSWER`. `gpt-5.4-mini` costs about a seventh of `gpt-5.5` per token and
still runs web search. The argument for the flagship is fidelity: the product claims to report what
ChatGPT actually says, and most people asking ChatGPT are on the newest model. That is a commercial
call, not a technical one, so the default is the flagship and the override is one environment
variable.

Real cost per scan is recoverable after the fact: `captures[].tokens` and `captures[].cost_usd` are
stored per engine, and the `cost_usd` column holds only what an engine actually reported.

**Timing.** 25 to 45 seconds when the APIs are quiet. Under load the ChatGPT call has taken 92 and
120 seconds, so engine timeouts are 240s against a 300s `maxDuration`. Perplexity returns in 25 to 35
seconds and 429s if scans overlap, which surfaces as one engine failing rather than a dead scan.

**Abuse control.** One scan per domain per 24 hours, served from cache and shown as such. Five scans
an hour and twenty a day per IP, counted in `rate_events`. Cache hits are never refused, so a repeat
visitor always gets their own result back. IPs are stored only as a salted hash.

## The question guard

`lib/question.ts` wraps the spec's question prompt. The prompt itself is used **verbatim** and is not
edited.

Sampling it fifteen times across three real domains produced four questions that ask an assistant to
name companies, and eleven addressed to the supplier: "Can you show recent Australian client work",
"Do you offer a US deployment". A vendor-addressed question makes both engines answer "I can't claim
I've handled projects" and name nobody, and the scan then reports that zero companies were named.

The guard draws four candidates in parallel, takes the first that a buyer could actually put to an
assistant, and only rewrites if all four fail. This is worth revisiting: amending the prompt in the
spec would be cheaper than working around it. See the note at the end of the build summary.
