-- Word of Model — subscriptions, Stripe event log, and the wizard's profile columns.
-- Run this in Supabase → SQL Editor, after 0002_accounts_scopes.sql.
--
-- This migration adds the billing side. It does not touch scans, waitlist or
-- rate_events, and it does not change any column 0002 created: the free scan and
-- the capture model keep working exactly as they do.
--
-- Three things here are load bearing:
--
--   1. stripe_events is the idempotency key. Stripe retries a failed webhook for
--      three days, and it does not guarantee delivery order. Every handler below
--      is written to be safe to run twice.
--   2. subscriptions.stripe_event_at is the out of order guard. A subscription
--      updated event that arrives after a later one must not roll the row back.
--   3. price_key, not the Stripe price id, is what the application reasons about.
--      The id changes between test and live mode; the key does not.

-- ------------------------------------------------- the wizard's profile fields
-- 0002 gave scopes category, market and buyer, which is what a capture is scored
-- against. The onboarding wizard also collects the brand, what they sell and the
-- website, and all three end up in the report: brand_name is the target every
-- capture is scored for, and without it a run has nothing to look for.
--
-- brand_name is set not null below. That is free at zero subscribers and never
-- again, which is the only reason it is being done now.
alter table public.scopes add column if not exists brand_name      text;
alter table public.scopes add column if not exists what_they_sell  text;
alter table public.scopes add column if not exists website         text;

update public.scopes set brand_name = category where brand_name is null;
alter table public.scopes alter column brand_name set not null;

-- -------------------------------------------------------------- subscriptions
-- One row per Stripe subscription. account_id and scope_id are both here on
-- purpose: the account is who pays, the scope is what gets measured, and an
-- agency account with several scopes will one day have several subscriptions.
--
-- status mirrors Stripe's own vocabulary rather than inventing a local one. When
-- the question is "is this person a subscriber", the answer has to be the same
-- answer Stripe would give, and a translation layer is where those drift apart.
--
-- report_day is capped at 28 so nobody's report date breaks in February. It is
-- taken from the billing anchor, so the billing date and the report date are the
-- same day of the month and nobody ever pays for a month with no report in it.
create table if not exists public.subscriptions (
  id                      uuid primary key default gen_random_uuid(),
  account_id              uuid not null references public.accounts (id) on delete cascade,
  scope_id                uuid not null references public.scopes (id) on delete cascade,
  stripe_subscription_id  text not null unique,
  stripe_customer_id      text not null,
  stripe_price_id         text not null,
  price_key               text not null,
  status                  text not null,
  report_day              smallint not null,
  cancel_at_period_end    boolean not null default false,
  current_period_end      timestamptz,
  -- The created time of the most recent Stripe event applied to this row.
  -- Webhook delivery is not ordered; an event older than this one is dropped.
  stripe_event_at         timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint subscriptions_price_key_check check (
    price_key in ('founding_monthly', 'standard_monthly')
  ),
  constraint subscriptions_status_check check (
    status in ('incomplete', 'incomplete_expired', 'trialing', 'active',
               'past_due', 'canceled', 'unpaid', 'paused')
  ),
  constraint subscriptions_report_day_check check (report_day between 1 and 28)
);

create index if not exists subscriptions_account_idx on public.subscriptions (account_id);
create index if not exists subscriptions_scope_idx   on public.subscriptions (scope_id);

-- Serves the founding counter. Partial, because the count only ever asks about
-- founding rows and they are the minority by design.
create index if not exists subscriptions_founding_idx
  on public.subscriptions (created_at)
  where price_key = 'founding_monthly';

-- ------------------------------------------------------- the founding counter
-- Counted in the application, in lib/billing.ts, against the index above. The
-- rule it counts by is the part worth writing down here:
--
-- Active OR EVER. A founding subscriber who cancels does not return their place:
-- the promise was the first twenty subscribers, not the first twenty still here,
-- and a seat that recycled on churn would make the displayed number a lie. Only
-- incomplete_expired is excluded, because that is a checkout that never became a
-- subscription at all.
--
-- Confirmed subscriptions only, so a checkout in progress does not hold a place.
-- Two people paying simultaneously for the last seat both get the founding
-- price. That is a decided trade: it costs one discount, once, and it is the
-- honest direction to fail in.

-- --------------------------------------------------------------- stripe_events
-- The idempotency key, and the only reason a retried webhook is safe.
--
-- The handler inserts here FIRST. If the insert conflicts, the event has already
-- been processed and the handler returns 200 without touching anything else.
-- Stripe retries for three days, and a duplicated checkout.session.completed
-- would otherwise write a second subscription row and send a second receipt.
--
-- payload is kept because a webhook that failed halfway is almost impossible to
-- diagnose without the body that caused it. It holds customer email and billing
-- detail, which is why this table has RLS and no policy at all.
create table if not exists public.stripe_events (
  id            text primary key,
  type          text not null,
  api_version   text,
  payload       jsonb,
  received_at   timestamptz not null default now(),
  handled_at    timestamptz,
  error         text
);

create index if not exists stripe_events_received_idx on public.stripe_events (received_at desc);

-- ------------------------------------------------------------------------ RLS
alter table public.subscriptions enable row level security;
alter table public.stripe_events enable row level security;

-- Read only, authenticated only, own account only, routed through the same
-- function as every policy in 0002. There is deliberately no insert, update or
-- delete policy: every write is the server on the secret key.
drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own on public.subscriptions
  for select to authenticated
  using (account_id = public.current_account_id());

-- stripe_events gets RLS and NO policy, the same treatment capture_jobs gets in
-- 0002. Raw billing events are operational data, not subscriber data.

-- --------------------------------------------------------------------- grants
revoke all on table public.subscriptions, public.stripe_events from anon;
revoke all on table public.subscriptions, public.stripe_events from authenticated;
grant select on table public.subscriptions to authenticated;

-- ---------------------------------------------------------------- housekeeping
-- subscriptions.scope_id cascades on delete, but scopes cannot be deleted once
-- they have captures (0002 makes captures.question_id restrict). In practice a
-- cancelled subscriber's scope and evidence stay standing, which is what the
-- twelve month founding rollover and any resubscription both depend on.
