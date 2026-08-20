# vercel.json, and why each line is there

## `regions: ["iad1"]`

**Pinned, and it must never change.**

Two of the five surfaces accept no location parameter at all. The xAI web search tool
takes `allowed_domains`, `excluded_domains` and two image flags, and nothing else; Gemini
grounding documents no location control on either the current or the legacy API. For those
two, **the network origin is the location** - it is the only geography they have.

The product sells a month-over-month delta. If the origin drifts between runs, Gemini and
Grok answer as if the buyer moved, and the number changes for a reason that has nothing to
do with the market. That is the same class of error as Google's AI Overview trigger rate,
and the same class as changing the competitor set or the surface set mid-trend.

Consistency beats latency and beats availability here. `captures.vercel_region` records
the origin on every row so the method note's claim - "held constant every month" - is
checkable rather than asserted, and so a future second region tells the truth about which
captures came from where instead of leaving somebody to guess.

`iad1` is Vercel's default for new projects, so this is very likely already where it runs.
Pinning makes it explicit and stops a dashboard change moving it silently.

**Known trade:** a single region means an `iad1` outage stalls the pipeline, and automatic
Node.js failover is Enterprise-only. The sweeper makes that a delay rather than a loss -
jobs resume when the region returns, and a monthly report has hours of slack.

## `crons`

| path | schedule | why |
|---|---|---|
| `/api/cron/sweep` | `*/5 * * * *` | Reverts stale claims, restarts dropped chains, and is the ONLY thing that settles a run. Five minutes is well inside the 24 hour promise and comfortably past the slowest measured capture. |
| `/api/cron/schedule` | `0 6 * * *` | Opens the month's run for every subscriber whose `report_day` is today, and opens a baseline run for any live subscription that has never had one. 06:00 UTC is mid-afternoon in Australia, so a failure lands while Tim is awake. |

**Both need Vercel Pro.** Hobby caps cron at one run per day and would break the sweeper
outright.

Vercel Cron sends `Authorization: Bearer $CRON_SECRET`, which is what `authorised()` in
`lib/cron.ts` checks. **`CRON_SECRET` must be set in Vercel** or every cron invocation
returns 401 and nothing runs - silently, because a 401 is a successful HTTP response as
far as the scheduler is concerned.

## maxDuration

Set per route in the route files rather than here, because it belongs next to the reason:

- `/api/run/tick` — **300s**. One capture per invocation, bounded by the 240s engine
  timeout. ChatGPT measured 83s average and 120s peak across real scans, so the headroom
  is real rather than theoretical.
- `/api/cron/sweep`, `/api/cron/schedule`, `/api/run/start` — **60s**. Database work and
  fire-and-forget kicks only. None of them make an engine call.
