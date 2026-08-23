-- Word of Model — where a subscriber came from, recorded server side.
-- Run this in Supabase → SQL Editor, after 0013_metric_version.sql.
--
-- THE PROBLEM. The paid test is a few hundred dollars, which is nowhere near enough to reach
-- significance on subscriptions. The only useful outputs are cost per completed scan and scan
-- to wizard rate, and neither is observable today, so the money would buy a feeling about
-- whether the ads "worked".
--
-- Three failure modes have to be distinguishable, because each points somewhere different:
-- few scans per dollar is the ad hook, scans that do not become wizard starts is the result
-- page, wizard starts that do not pay is price or trust. A funnel that cannot separate those
-- is worthless at any budget.
--
-- WHY THE ATTRIBUTION LIVES ON THE ROW AND NOT IN A COOKIE. People scan on a phone and pay on
-- a laptop. A cookie does not survive that, and neither does a cleared browser or an ad
-- blocker. The scan id is the join key: it is in the URL from the scan onwards, it goes into
-- the Checkout session metadata, and the webhook writes it onto the subscription. Months
-- later a paying customer still traces back to the ad that produced them without asking Meta
-- anything.

-- ---------------------------------------------------------------- first touch, on the scan
alter table public.scans add column if not exists utm_source   text;
alter table public.scans add column if not exists utm_medium   text;
alter table public.scans add column if not exists utm_campaign text;
alter table public.scans add column if not exists utm_content  text;
alter table public.scans add column if not exists fbclid       text;

create index if not exists scans_utm_source_idx on public.scans (utm_source, created_at desc);

-- ------------------------------------------------------- the join, all the way to the money
alter table public.subscriptions
  add column if not exists scan_id uuid references public.scans (id) on delete set null;

create index if not exists subscriptions_scan_idx on public.subscriptions (scan_id);

comment on column public.subscriptions.scan_id is
  'The scan this subscriber came from, carried through the wizard and the Stripe session '
  'metadata. on delete set null: losing an old scan must never take a subscription with it.';

-- ------------------------------------------------------------------------ the funnel itself
--
-- One row per step per scan. Five events, and the names are the steps a stranger takes:
--
--   scan_started         a domain was submitted
--   scan_completed       a SUCCESSFUL result rendered. Not a page load, and not an errored or
--                        empty scan: a scan that failed is not a scan that happened, which is
--                        the same rule this build applies to a capture that did not land.
--   wizard_started       /start was reached
--   checkout_started     a Stripe session was created
--   subscription_active  the webhook wrote a live subscription. Server side, because the
--                        browser is redirected out to Stripe and back and is the least
--                        reliable witness to the one event that matters most.
create table if not exists public.funnel_events (
  id          uuid primary key default gen_random_uuid(),
  event       text not null,
  scan_id     uuid references public.scans (id) on delete cascade,
  account_id  uuid references public.accounts (id) on delete set null,
  -- Denormalised from the scan so the table can be grouped by source without a join, and so a
  -- deleted scan does not erase the fact that the ad worked.
  utm_source  text,
  created_at  timestamptz not null default now(),

  constraint funnel_events_event_check check (event in (
    'scan_started', 'scan_completed', 'wizard_started', 'checkout_started', 'subscription_active'
  ))
);

-- ONE OF EACH PER SCAN. A subscriber who reloads /start four times started the wizard once,
-- and a funnel that counts reloads reports a conversion rate that flatters the page. Postgres
-- treats NULLs as distinct, so scans we cannot attribute - somebody opening /start cold - are
-- still each recorded, and the internal table counts them separately.
create unique index if not exists funnel_events_once_per_scan
  on public.funnel_events (event, scan_id)
  where scan_id is not null;

create index if not exists funnel_events_day_idx on public.funnel_events (created_at desc);
create index if not exists funnel_events_source_idx on public.funnel_events (utm_source, event);

-- Operational, not subscriber data: RLS on, no policy, nothing granted. Same treatment as
-- capture_jobs and ops_alerts.
alter table public.funnel_events enable row level security;
revoke all on table public.funnel_events from anon;
revoke all on table public.funnel_events from authenticated;

comment on table public.funnel_events is
  'Our own record of the funnel, server side. Meta reports what it wants to be paid for; this '
  'is what happened. When the two disagree, this is the one to believe and the difference is '
  'worth saying out loud rather than picking the flattering number.';
