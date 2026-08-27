-- The funnel could not tell one ad from another.
--
-- 0014 gave funnel_events a single utm_source column, which answers "did Meta send them" and
-- nothing else. A four ad test asks a different question: hook A against hook C, static
-- against video. That string lives in utm_content, and it was neither stored nor passed.
--
-- scans has carried all five since 0014 and still does. This brings funnel_events level with
-- it, so a step can be attributed to an ad rather than only to a channel.

alter table public.funnel_events add column if not exists utm_medium   text;
alter table public.funnel_events add column if not exists utm_campaign text;
alter table public.funnel_events add column if not exists utm_content  text;
alter table public.funnel_events add column if not exists fbclid       text;

-- The column the ad test reads. Ordered by day because every question asked of it is
-- "this ad, over this period".
create index if not exists funnel_events_content_idx
  on public.funnel_events (utm_content, event, created_at desc);

comment on column public.funnel_events.utm_content is
  'Which creative produced this step. The ad test is unreadable without it: utm_source only '
  'says the traffic came from Meta.';

-- ---------------------------------------------------------------------------------------
-- NOT ADDED: a unique index covering rows with a null scan_id.
--
-- 0014 excludes those deliberately (`where scan_id is not null`) and says so. What that note
-- did not anticipate is that the excluded case would be ALL of the traffic: every wizard_started
-- row written between 25 and 27 Aug 2026 had a null scan_id, and 1030 of them accumulated in
-- 48 hours against 2 scans, because /start was being prefetched by next/link from the home
-- page and force-dynamic made each prefetch a real render and a real insert.
--
-- The fix for that is prefetch={false} at the link and is in the same change as this file.
-- Deduplicating here instead would have hidden the extra renders rather than stopped them,
-- and the server cost is the larger half of that defect.
