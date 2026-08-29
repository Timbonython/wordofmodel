-- Additional locations: the thing the price list has been selling since 28 Aug 2026.
-- Run in Supabase → SQL Editor, after 0021_price_ladder.sql.
--
-- WHAT WAS ACTUALLY WRONG. /pricing has offered "US$30 a month for each additional location,
-- on either plan" and a live stepper computing US$189 for five clinics. Nothing implemented it:
-- `scopes` carries four locality columns describing ONE place, the wizard collects one, the
-- checkout builds one line item, and no run has ever known about a second town. The Stripe
-- product description even promised the mechanism - "The same five questions, asked from each
-- town" - and nothing did that.
--
-- That is worse than a price with no purchase path. It would have taken US$30 a month for
-- output that does not exist, and the subscriber would not have found out until they read a
-- report covering one town.
--
-- ONE RUN PER LOCATION, NOT ONE RUN COVERING MANY. The capture key is
-- (run_id, question_id, engine, capture_method, sample) and the whole pipeline - the job
-- queue, extraction, scoring, the delta - is built on a run meaning "one scope, one period,
-- 55 captures". Widening that key to carry a location would touch every one of those.
-- Giving each location its own run leaves all of it untouched and correct.
--
-- THE APPROVED QUESTIONS ARE NOT REGENERATED PER LOCATION. The subscriber approves five
-- questions, and the approval gate is the credibility mechanism this product is sold on.
-- Generating a fresh five per town would mean approving five and receiving answers to fifteen
-- they never saw. The same five run in each place, with the location substituted at ask time.

-- ------------------------------------------------------------------ the locations
--
-- The FIRST location stays on scopes.locality, exactly where it is. This table holds the
-- ADDITIONAL ones, which is what the add-on charges for, so a single-location subscriber is
-- unchanged in every respect and the count here is literally the billable quantity.
create table if not exists public.scope_locations (
  id                 uuid primary key default gen_random_uuid(),
  scope_id           uuid not null references public.scopes (id) on delete cascade,
  -- The same four columns scopes carries, for the same reason: what they typed is not what
  -- the SERP provider matched it to, and a locality that resolved to nothing keeps its text.
  locality           text not null,
  locality_canonical text,
  locality_city      text,
  locality_region    text,
  created_at         timestamptz not null default now(),

  -- One row per town per scope. A subscriber who adds Ballarat twice has one Ballarat.
  constraint scope_locations_scope_locality_uniq unique (scope_id, locality)
);

create index if not exists scope_locations_scope_idx on public.scope_locations (scope_id);

alter table public.scope_locations enable row level security;
revoke all on table public.scope_locations from anon;
revoke all on table public.scope_locations from authenticated;

-- Subscribers read their own, through the same function every other policy uses, so team
-- seats later are a change to one function rather than to nine policies.
drop policy if exists scope_locations_own on public.scope_locations;
create policy scope_locations_own on public.scope_locations
  for select to authenticated
  using (scope_id in (select id from public.scopes where account_id = public.current_account_id()));

comment on table public.scope_locations is
  'Additional towns a scope is measured from, beyond scopes.locality. One run per location per '
  'period; the same five approved questions, asked with the location substituted. The row '
  'count is the billable quantity on the additional-location price.';

-- ------------------------------------------------------------- the run knows its location
--
-- NULL MEANS THE SCOPE'S OWN LOCALITY, which is every run that already exists. Nullable rather
-- than backfilled: a run predating this migration was for the scope's one place, and inventing
-- a location row to point it at would be writing history that did not happen.
alter table public.runs
  add column if not exists location_id uuid references public.scope_locations (id) on delete cascade;

comment on column public.runs.location_id is
  'The additional location this run measured, or null for the scope''s own locality. Null on '
  'every run before 0022, which is correct: they measured the one place a scope had.';

-- The uniqueness that made the baseline run and the daily scheduler collision-safe has to
-- widen with it, or the second location''s run for the same period is refused as a duplicate.
--
-- NULLS NOT DISTINCT is the whole point. Postgres treats NULLs as distinct by default, which
-- would let the scope's own run be opened twice - exactly the collision the original index
-- exists to prevent, reintroduced by making the column nullable.
drop index if exists runs_scope_period_start_uniq;

create unique index if not exists runs_scope_period_location_uniq
  on public.runs (scope_id, period, period_start, location_id) nulls not distinct;

create index if not exists runs_location_idx on public.runs (location_id) where location_id is not null;
