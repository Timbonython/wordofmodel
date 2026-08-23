-- Word of Model — the headline number changed definition, and that has to be visible.
-- Run this in Supabase → SQL Editor, after 0012_founding_claims.sql.
--
-- WHAT CHANGED. The headline was Share of Model: how often the brand was NAMED across the four
-- unbranded questions. It is now Recommendation Share: how many surfaces RECOMMEND the brand
-- when asked about it directly, printed as a count out of the surfaces that answered. Presence
-- stays in the report as supporting detail and the gap between the two is stated outright,
-- because that gap is the finding the product exists to deliver.
--
-- WHY A NEW VERSION AND NOT A RENAME. Those are different numbers over different denominators.
-- A trend line that runs across the change would compare a naming rate to a recommendation
-- count and call the difference movement, which is the exact failure delta.ts already guards
-- for competitor sets, surface sets, sampling depth, rewritten questions, lost captures and
-- extraction versions. This is the seventh path and it is the first one that changes what the
-- headline MEANS.
--
-- WHY threshold_version WAS THE WRONG LEVER, and it was in the brief. threshold_version
-- versions the mapping from numbers to a label in diagnosis.ts, and delta.ts has never read
-- it. Bumping it would have declared nothing to the only code that could act on it.
--
-- COST OF DOING IT NOW: nothing. One report has ever been issued and it was a test. Every
-- month of delay makes this more expensive and eventually impossible. The issued report keeps
-- the numbers and the words it was issued with, because asIssued() renders from the record.

alter table public.reports
  add column if not exists metric_version integer not null default 1;

comment on column public.reports.metric_version is
  'Which definition of the headline number produced this report. 1 = Share of Model, the '
  'naming rate across the unbranded questions. 2 = Recommendation Share, the count of surfaces '
  'recommending the brand when asked directly. delta.ts refuses to compare across it.';

-- Everything already stored was produced under the old definition, which is what the default
-- says. The one issued report keeps saying what it said.
