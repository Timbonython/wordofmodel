# Claude Code prompt — scan grounding and the confirm step

Paste everything below the line into Claude Code, in `~/wordofmodel`.

**Before you paste:** save `word-of-model-scan-grounding-and-confirm.md` into the repo where the
other briefs live, and correct the path on the first line of the prompt if it differs. The prompt
deliberately does not restate the brief — two renderings of one truth diverge.

---

Read `docs/word-of-model-scan-grounding-and-confirm.md`. It is the spec for this task. If that file
is not there, stop and tell me — do not reconstruct it from this prompt or from the repo.

Then read `CLAUDE.md` and `docs/word-of-model-engineering-principles.md`. §1 (prefer impossibility
over detectability), §2 (a guard is not shipped until you have watched it fail) and §5 (absence
renders as its opposite) bind this work.

**One decision the brief leaves open, now settled: `location` is singular for this build.** One
location, one string. Do not model multiple sites, and do not add a plural shape "for later" — that
is a schema decision tied to the US$30/month additional-location billing and it is not being made
here. If a site clearly has several locations, take the primary one and note it in your report.

## Stage 0 — read and report, before you change anything

I do not have live state for this repo in front of me, so nothing in the brief should be treated as
a description of what the code does today. Find and report:

1. Where the free scan pipeline lives, and the exact point where the buyer question is generated.
2. What is passed into that generation step today, and in what form — is the site content handed
   over as context, or are any facts extracted first?
3. Whether the paid report path (`/start` and whatever runs after it) generates its questions
   through the same code, or a second copy of it.
4. Whether `/start` step one already collects business, buyer and location, and in what shape.
5. The current run-progress UI — the checklist with `Asking the engines` — and whether there is a
   natural place to interrupt it and wait for input.

Report those five things and your implementation plan. **If any of them contradicts the brief, stop
and say so rather than implementing around it.** Otherwise carry straight on to stage 1.

## Stage 1 — the invariant

Build the typed profile and the extract-before-write order exactly as the brief specifies. The test
that matters: a city that is neither on the fetched page nor typed by the visitor must be
unrepresentable at the generator, not merely unlikely. If you find yourself writing a check that
looks for wrong cities afterwards, you have built the second-best version — go back.

Nulls render as absence. No national default, no capital city, no "Australia-wide" filler.

## Stage 2 — the confirm card

At the seam between writing the question and asking the engines, per the brief. Built once and
consumed by both the free scan and `/start` step one.

Do not add a location field to the homepage. The homepage stays one field and one button, and the
scan input stays above the fold at 390 × 844 / 734 / 664 / 628 — re-measure all four after the
change and attach the screenshots, per principle 6.

## Stage 3 — prove it

Run the full verification list in the brief. Two things I want to see with my own eyes rather than
reasoned about:

- The two deliberate breaks in §7 of the brief, actually performed, with the output pasted.
- A re-run of `generalhavelock.com.au`. The address `162 Hutt Street, Adelaide, SA 5000` is in the
  homepage text. The question must name Adelaide or no city, and must position the pub as the thing
  being chosen — not as a supplier to venues, which is what it produced on 1 September.

Then the five cross-state runs, with each generated question pasted in full. Do not summarise them
as passing; show me the questions.

## How to work

Small commits, each one independently revertable. Do not touch Stripe, pricing, or anything on the
purchase path — this is the scan pipeline and the run UI only.

If the timed run comes out over three minutes with the confirm card in it, tell me the number.
Do not adjust the site copy yourself; the ads carry the same claim and they change together.
