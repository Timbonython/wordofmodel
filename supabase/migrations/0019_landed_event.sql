-- The top of the funnel, for the page the ads actually point at.
--
-- Until now the first observable step for paid traffic was scan_started, with nothing above it
-- to divide by. /start recorded wizard_started on landing; / recorded nothing at all, so moving
-- the ads to the page the free scan is actually on would have gone dark at the top on the day
-- attribution started working.
--
-- 0014's check constraint is a closed list, so a new event is rejected at insert until it is
-- named here.

alter table public.funnel_events drop constraint if exists funnel_events_event_check;

alter table public.funnel_events add constraint funnel_events_event_check check (event in (
  'landed', 'scan_started', 'scan_completed', 'wizard_started', 'checkout_started', 'subscription_active'
));

-- ---------------------------------------------------------------------------------------
-- WHAT 'landed' COUNTS, AND WHAT IT DELIBERATELY DOES NOT.
--
-- Only attributed visits: a utm_source, utm_content or fbclid on the URL. An organic or direct
-- visitor to the home page records nothing.
--
-- That is a deliberate trade, made on the evidence of 27 Aug 2026. /start recorded every server
-- render and accumulated 1030 rows against 2 scans, because a crawler and a person are the same
-- thing to a server. The home page is linked and crawled far more than /start, so recording
-- every render there would repeat that defect at a larger scale on the page the ads now land on.
-- A crawler does not append utm_content; an ad click always does.
--
-- The cost is that organic landings are invisible here by design. When the content plan starts
-- producing non-ad traffic, this stops being the right trade - see CLAUDE.md.
