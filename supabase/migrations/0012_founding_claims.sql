-- Word of Model — the founding seat, claimed before the card rather than counted after it.
-- Run this in Supabase → SQL Editor, after 0011_ops_alerts.sql.
--
-- THE PROBLEM THIS SOLVES. foundingState() counted CONFIRMED subscriptions, which are written
-- by the Stripe webhook after payment. Two people checking out at the same moment for the last
-- place both read nineteen taken, both got a founding price id, both paid, and both held a
-- founding rate. That was a decided trade while nothing was linked to checkout: it cost one
-- discount once and it failed in the generous direction. Selling self serve changes the odds
-- and the stakes, so the seat is now claimed at session creation, atomically.
--
-- COUNTED OVER DISTINCT ACCOUNTS, matching the rule the counter has held since 20 Aug: twenty
-- businesses, not twenty subscriptions. A second claim by an account that already holds a seat
-- does not consume another one, which falls out of counting distinct account_id rather than
-- needing a special case.
--
-- WHY A LOCK AND NOT A CLEVER INSERT. "insert ... where (select count(*)) < 20" is not safe
-- under read committed: two transactions both evaluate the subquery against the snapshot they
-- started with, both see nineteen, and both insert. A transaction scoped advisory lock makes
-- the read and the write one indivisible step, costs a few microseconds at this volume, and is
-- obvious to the next person. Seat integrity is worth more than elegance here.
--
-- THE SEAT COUNT IS A PARAMETER, not a literal, so FOUNDING_SEATS in lib/stripe.ts stays the
-- only definition of twenty. It also makes the concurrency test cheap: run the function with
-- one seat and fire five callers at it.

create table if not exists public.founding_claims (
  id                   uuid primary key default gen_random_uuid(),
  account_id           uuid not null references public.accounts (id) on delete cascade,

  -- Null until Stripe returns the session. The claim has to exist BEFORE the session, because
  -- the price id is decided by the claim and the session is created with that price on it.
  checkout_session_id  text unique,

  claimed_at           timestamptz not null default now(),
  -- Matches the Checkout session's own expiry. A claim that outlived its session would hold a
  -- place nobody can pay for, which is the failure mode of every reservation system.
  expires_at           timestamptz not null,

  outcome              text not null default 'pending',
  converted_at         timestamptz,
  released_at          timestamptz,

  constraint founding_claims_outcome_check
    check (outcome in ('pending', 'converted', 'expired', 'released'))
);

-- The only query that matters is "live claims right now".
create index if not exists founding_claims_live_idx
  on public.founding_claims (outcome, expires_at desc);
create index if not exists founding_claims_account_idx
  on public.founding_claims (account_id);

/**
 * Claim a founding place, or report that there is none left.
 *
 * Returns the claim id when the caller may be charged the founding rate, and null when they
 * may not. An account that already holds a place, confirmed or claimed, always gets one back:
 * the rate is promised to a business, and a second market does not consume a second seat.
 */
create or replace function public.claim_founding_seat(
  p_account uuid,
  p_expires timestamptz,
  p_seats   integer
) returns uuid
language plpgsql
as $$
declare
  v_already boolean;
  v_taken   integer;
  v_claim   uuid;
begin
  -- One claimer at a time, for the length of this transaction only.
  perform pg_advisory_xact_lock(hashtext('wordofmodel.founding_seats'));

  select exists (
    select 1 from public.subscriptions
     where account_id = p_account
       and price_key = 'founding_monthly'
       and status <> 'incomplete_expired'
    union all
    select 1 from public.founding_claims
     where account_id = p_account
       and outcome = 'pending'
       and expires_at > now()
  ) into v_already;

  select count(*) into v_taken from (
    select account_id from public.subscriptions
      where price_key = 'founding_monthly' and status <> 'incomplete_expired'
    union
    select account_id from public.founding_claims
      where outcome = 'pending' and expires_at > now()
  ) as holders;

  if not v_already and v_taken >= p_seats then
    return null;
  end if;

  insert into public.founding_claims (account_id, expires_at)
  values (p_account, p_expires)
  returning id into v_claim;

  return v_claim;
end;
$$;

-- Ops plumbing, not subscriber data: RLS on, no policy, nothing granted. The server holds the
-- secret key and bypasses RLS; the function is called through it.
alter table public.founding_claims enable row level security;
revoke all on table public.founding_claims from anon;
revoke all on table public.founding_claims from authenticated;
revoke all on function public.claim_founding_seat(uuid, timestamptz, integer) from anon;
revoke all on function public.claim_founding_seat(uuid, timestamptz, integer) from authenticated;

comment on table public.founding_claims is
  'A founding place held from Checkout session creation until the session converts or expires. '
  'Counted alongside confirmed subscriptions when deciding what to charge, and deliberately '
  'NOT counted in the number shown on the site: see lib/billing.ts.';
