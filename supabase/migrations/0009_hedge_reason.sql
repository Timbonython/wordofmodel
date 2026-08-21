-- Word of Model — the reason a surface stopped short, in the surface's own words.
-- Run this in Supabase → SQL Editor, after 0008_reports.sql.
--
-- WHY THIS IS STORED ON THE CAPTURE AND NOT COMPUTED IN THE REPORT.
--
-- The gap between named and recommended is the finding in every report. Until now we
-- reported the gap and said nothing about its cause, which left the report one step short
-- of an action - and the obvious way to close that step is to write recommendations. That
-- would be the product inventing advice on top of evidence it paid for.
--
-- It is not necessary. On the first real run, three of the four surfaces that named Zapme
-- without recommending them said WHY, unprompted, in the answer itself: not enough
-- independent feedback, evidence mixed and still limited, a modest 3.2-star Play Store
-- rating. The engines had already done the diagnostic work. The report's job is to hand it
-- back, not to add to it.
--
-- So the reason is EXTRACTED, in the same temperature-0 pass that decides named versus
-- recommended, and it is stored as a VERBATIM SENTENCE from the answer. A quote that
-- cannot be found in the answer it came from is discarded rather than stored, which is the
-- guard that keeps this extraction rather than generation. See lib/extract.ts.
--
-- hedge_reason is a closed set, and it exists so the report can say what would change the
-- sentence. That half - the remedy - is ours and is fixed copy per reason in lib/actions.ts,
-- never model output. The subscriber can always tell the two apart: one is in quotation
-- marks with a surface's name against it, the other is not.

alter table public.captures add column if not exists hedge_quote text;
alter table public.captures add column if not exists hedge_reason text;

-- A quote long enough to be a paragraph is a summary, and a summary is the thing this
-- column exists to prevent. The extractor asks for one sentence; this is the backstop.
alter table public.captures drop constraint if exists captures_hedge_quote_check;
alter table public.captures add constraint captures_hedge_quote_check
  check (hedge_quote is null or (length(btrim(hedge_quote)) between 20 and 600));

alter table public.captures drop constraint if exists captures_hedge_reason_check;
alter table public.captures add constraint captures_hedge_reason_check
  check (hedge_reason is null or hedge_reason in (
    'evidence_thin',      -- cannot find enough independent feedback about you
    'rating_low',         -- names a specific published score that is unflattering
    'reputation_mixed',   -- reports of mixed or negative customer experience
    'small_or_new',       -- too small, too new, or too low profile to put forward
    'coverage_gap',       -- names something you do not do, or it cannot see that you do
    'price',              -- price or value
    'other'               -- a stated reason that fits none of the above
  ));

-- The two travel together or not at all. A quote with no reason cannot be given a remedy,
-- and a reason with no quote is the report asserting something in its own voice - which is
-- exactly what this column exists to stop.
alter table public.captures drop constraint if exists captures_hedge_pair_check;
alter table public.captures add constraint captures_hedge_pair_check
  check ((hedge_quote is null) = (hedge_reason is null));

comment on column public.captures.hedge_quote is
  'Verbatim sentence from answer_text in which the surface said why it stopped short of '
  'recommending the target. Validated as a substring of the answer at extraction time; '
  'discarded, not stored, when it is not found.';
comment on column public.captures.hedge_reason is
  'Closed-set classification of hedge_quote. Selects the remedy copy in lib/actions.ts. '
  'Never shown to a subscriber as a label - only the quote is shown.';
