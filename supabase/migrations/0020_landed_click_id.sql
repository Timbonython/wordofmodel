-- `landed` means a click arrived. Enforced here rather than in a list of names bots go by.
-- Run in Supabase → SQL Editor, after 0019_landed_event.sql.
--
-- WHAT WENT WRONG, so the next person does not rebuild it. 0019 gated the landing event on
-- `utm_source or utm_content or fbclid` and rested on this premise, stated at 0019:27 and
-- CLAUDE.md:722: "a crawler does not append utm_content; an ad click always does."
--
-- The second half is true. The first half is false, and the whole gate rested on it. UTM
-- parameters are baked into the ad URL and are inherited by anything that fetches it, crawlers
-- included. Only a click id is minted at click time.
--
-- So the gate admitted every automated fetch of an ad URL as an attributed human visit. On
-- 28 Aug 2026 it recorded 69 landings against 25 reported link clicks: 28 rows carried a real
-- fbclid, 41 carried none at all. The 41 were fetches. The signature is unmistakable - 29 rows
-- in 88 seconds on 27 Aug, zero click ids, gaps of 0.0s and 0.1s, walking across two ad URLs -
-- and `outburst-video` took 22 landings that day with no observed click behind any of them.
--
-- ANY VENDOR'S CLICK ID, NOT META'S. Hard-coding fbclid makes the next paid channel invisible
-- and nobody will remember why. The five below are the click-time parameters of the platforms
-- this business could plausibly buy: Meta, Google, TikTok, LinkedIn, Microsoft.
--
-- THE COST, ACCEPTED ON PURPOSE. Privacy browsers strip click ids, so those clicks vanish from
-- this table. Undercounting is the safe direction: a number that errs low is one you can trust
-- when it rises. The old rule erred high, which is the direction that cannot be trusted at all.

-- ------------------------------------------------------------------ the click, and the agent
--
-- click_id_param records WHICH parameter it came from, so a channel can be separated from the
-- ad tagging later without re-deriving it from a utm_source a stranger controls.
alter table public.funnel_events add column if not exists click_id       text;
alter table public.funnel_events add column if not exists click_id_param text;

-- STORED, NEVER FILTERED ON. A blocklist of user-agent strings is exactly what just failed:
-- 0019's exclusion knew three Meta names, shipped correctly, worked, and was walked straight
-- past by every other crawler on the internet. This column exists so the next version of this
-- question is answerable from the data. The reason the 129 rows written before this migration
-- cannot be restated is that nobody stored it.
alter table public.funnel_events add column if not exists user_agent text;

comment on column public.funnel_events.click_id is
  'The click-time identifier that produced this visit: fbclid, gclid, ttclid, li_fat_id or '
  'msclkid. Required for a landed row. Null on later steps, which inherit attribution from '
  'the scan instead.';

comment on column public.funnel_events.user_agent is
  'Recorded for diagnosis, never used to decide whether a row is written. See 0020 header.';

-- --------------------------------------------------------------- one click writes one row
--
-- The database enforces it, not the application. funnel_events_once_per_scan is
-- `where scan_id is not null` and scan_id is null on every landed row - a landing happens
-- before a scan exists - so that index never applied here and there was no dedup at any level.
-- Observed 28 Aug 2026: three identical requests carrying one fbclid wrote three rows.
create unique index if not exists funnel_events_landed_once_per_click
  on public.funnel_events (click_id)
  where event = 'landed' and click_id is not null;

create index if not exists funnel_events_click_param_idx
  on public.funnel_events (click_id_param, created_at desc);

-- ------------------------------------------------------------------------ the cutover line
--
-- HISTORY IS NOT RESTATED. The 129 rows written between 2026-08-27T12:05Z and this migration
-- were counted under the old rule and cannot be corrected: the user-agent was never stored, so
-- there is no way to separate crawler from human beyond the fbclid proxy. They stay.
--
-- A series that spans this date shows a step DOWN that is a definition change, not a drop in
-- traffic. Anything that reads the landed series must say so - see lib/funnel.ts and
-- scripts/funnel.mjs, which both print the cutover.
comment on table public.funnel_events is
  'Our own record of the funnel, server side. Meta reports what it wants to be paid for; this '
  'is what happened. When the two disagree, this is the one to believe and the difference is '
  'worth saying out loud rather than picking the flattering number. '
  'LANDED CHANGED MEANING ON 2026-08-28: before that date it counted attributed renders '
  'including crawler fetches of ad URLs; from that date it counts clicks, one row per click id. '
  'Do not compare across the boundary.';
