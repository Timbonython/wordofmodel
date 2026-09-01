-- Traffic. The one line the daily report could not print, because nothing measured it.
-- Run in Supabase → SQL Editor, after 0024_alert_detail.sql.
--
-- WHY THIS EXISTS AT ALL. As at 1 Sep 2026 this site had no visitor measurement of any kind.
-- Not Vercel Web Analytics, not Plausible, not GA - the only third-party script in the document
-- was Meta's pixel. So the honest answer to "how many people came" was that nobody knew, and
-- the Vercel runtime log cannot answer it after the fact either: retention is one hour on
-- Hobby and one day on Pro, and a statically served page may produce no log line at all.
--
-- WHY NOT `funnel_events`. That table answers a different question and answers it well. Since
-- 0020 a `landed` row requires a click id, which makes it a count of PAID CLICKS - correct, and
-- deliberately blind to every organic visitor, who arrives with no click id at all. Widening
-- the landing gate to fix that is the 0019 mistake all over again. So traffic gets its own
-- instrument and the two are read side by side, which is what the daily report brief asks for.
--
-- WHY A DAILY SALT. `visitor_hash` is sha256 over a salt that includes the DATE, so the same
-- person on two days produces two unrelated hashes and nothing here is a durable identifier.
-- That is what keeps this first-party and consent-free rather than tracking.
--
-- THE PRIMARY KEY IS THE WHOLE GUARD. (day, visitor_hash) means a visitor cannot be counted
-- twice in a day, enforced by Postgres rather than by the application remembering to check -
-- the same lesson as 0020, where dedup was assumed to exist and did not.

create table if not exists public.visits (
  -- The ADELAIDE day, computed in the application and passed in. Every window in the daily
  -- report is 00:00-23:59:59 ACST, and a UTC date here would put nine and a half hours of each
  -- evening in the wrong bucket - visible as a phantom dip every night with nothing to explain
  -- it. `created_at::date` is deliberately not used for this.
  day            date        not null,
  -- sha256(ip_hash_salt : day : ip : user_agent), truncated. See lib/visits.ts.
  visitor_hash   text        not null,
  first_seen_at  timestamptz not null default now(),
  -- The first page of the visit, not the last. Separates an ad landing from somebody who
  -- arrived on /pricing from search.
  path           text,
  -- STORED, NEVER FILTERED ON, for the third time in this schema. 0019 tried to keep crawlers
  -- out with a list of three user-agent strings and every other crawler on the internet walked
  -- past it. The bot line in the report is computed from this column at READ time, so it can be
  -- recomputed when the list turns out to be wrong - which it will.
  user_agent     text,
  utm_source     text,
  utm_medium     text,
  utm_campaign   text,
  utm_content    text,
  -- fbclid/gclid/ttclid/li_fat_id/msclkid, whichever arrived. The one column here that is
  -- evidence a HUMAN clicked rather than that a URL was fetched. Same reasoning as 0020.
  click_id       text,
  click_id_param text,
  -- THE JOIN KEY, and the one deliberate departure from the design in the daily-report brief.
  --
  -- This is the STATIC-salt hash from lib/ratelimit.ts - the same function, the same salt and
  -- the same truncation that already writes scans.ip_hash. It is here so that a visit can be
  -- joined to the scan it produced without a cookie:
  --
  --   select count(distinct v.visitor_hash) filter (where s.id is not null)
  --   from visits v
  --   left join scans s on s.ip_hash = v.ip_hash and (s.created_at at time zone 'Australia/Adelaide')::date = v.day
  --
  -- Without it this table can say how many people came and nothing about what they did, which
  -- is the complaint that produced it. The cost is honest: unlike visitor_hash this value is
  -- stable across days, so it is a durable pseudonymous identifier. It is not new to the
  -- database - scans and rate_events have carried the identical hash since 0001 - but it is new
  -- to a row written for every visitor rather than every scanner. Drop this column and the
  -- index below if that trade is not wanted; nothing else depends on it.
  ip_hash        text,
  primary key (day, visitor_hash)
);

comment on table public.visits is
  'One row per visitor per Adelaide day. The traffic instrument, separate from funnel_events '
  'because a landed row requires a click id and is therefore a count of paid clicks, not of '
  'people. Read three numbers from this table and never one: unique visitors errs HIGH because '
  'it includes every crawler, and the click-id count errs LOW because privacy browsers strip '
  'click ids. Decide on the click-id line. See lib/visits.ts and scripts/visits.mjs.';

comment on column public.visits.visitor_hash is
  'sha256 over a salt that includes the day, so the same person on two days is two unrelated '
  'hashes and nothing here is a durable identifier. Not comparable across days, on purpose.';

comment on column public.visits.ip_hash is
  'The static-salt hash from lib/ratelimit.ts, matching scans.ip_hash so a visit can be joined '
  'to the scan it produced. Durable across days, unlike visitor_hash. Read the column note in '
  '0025 before treating the two as interchangeable - they are not.';

create index if not exists visits_day_idx on public.visits (day desc);

-- Paid traffic, the line decisions get made on. Partial, because the whole point is that it is
-- a small subset of the table.
create index if not exists visits_click_idx
  on public.visits (day desc, click_id_param)
  where click_id is not null;

-- The join in the ip_hash column note. Without this it is a sequential scan of every visit.
create index if not exists visits_ip_hash_idx
  on public.visits (ip_hash)
  where ip_hash is not null;

/*
 * NO KEY OUTSIDE THE SERVER MAY TOUCH THIS TABLE.
 *
 * Added 1 Sep 2026, before the migration was first run. Every other table in this schema - all
 * eighteen of them, across nine migrations - carries these three lines, and visits was the one
 * exception. Not a decision: an omission.
 *
 * WHAT WAS ACTUALLY AT RISK, stated accurately rather than dramatically. A probe with the
 * publishable key, which ships to every browser, shows reviews and funnel_events returning
 * 42501 - the role has no privilege at all - and scans returning an empty array, protected by
 * RLS rather than by the grant. So this table would probably have inherited no anon grant
 * either and been unreadable in practice. Probably is the problem: that protection lives in
 * project-level default privileges that are not in this repo, cannot be reviewed in a diff,
 * and can be changed in a dashboard by anyone with access. Every other table says what it
 * wants in the migration and does not depend on that.
 *
 * The rows are worth the belt and braces: ip_hash, referrer, utm_content and click_id are a
 * complete picture of where the paid traffic comes from and, joined to scans, who it became.
 */
alter table public.visits enable row level security;
revoke all on table public.visits from anon;
revoke all on table public.visits from authenticated;

comment on table public.visits is
  'First-party page-view counting. One row per visitor per Adelaide day. RLS on with no '
  'policies and no grants: every read and write is the server on the secret key.';
