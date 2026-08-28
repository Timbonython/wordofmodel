-- The two-tier ladder: eight prices where there were two.
-- Run in Supabase → SQL Editor, after 0020_landed_click_id.sql.
--
-- WHAT CHANGED AND WHY IT IS SAFE TO DO AT ALL. 0003 constrained price_key to
-- ('founding_monthly', 'standard_monthly'). §1 of the pricing plan replaces that with a
-- two-tier ladder - Monitoring at US$69 and Monitoring + Review at US$249, each monthly or
-- annual, plus a capped founding price and a per-location add-on.
--
-- NOBODY IS PAYING. Confirmed 28 Aug 2026: zero rows in subscriptions. This is the only moment
-- this restructure is free - no grandfathering, no proration, no legacy price ids to keep
-- alive, and no backfill below because there is nothing to backfill. It will not be true again.
--
-- THE NAMES ARE THE STRIPE LOOKUP KEYS, deliberately identical. price_key is what the
-- application reasons about and lookup_key is what Stripe stores; two names for one concept is
-- how this project has been bitten repeatedly, so they are the same string.
--
--   standard_monthly  ->  premium_monthly
--   founding_monthly  ->  premium_founding_monthly
--
-- and six that did not exist: main_monthly, main_annual, premium_annual,
-- premium_founding_annual, location_monthly, location_annual.

-- ------------------------------------------------------------------ the constraint
alter table public.subscriptions drop constraint if exists subscriptions_price_key_check;

alter table public.subscriptions add constraint subscriptions_price_key_check check (
  price_key in (
    'main_monthly', 'main_annual',
    'premium_monthly', 'premium_annual',
    'premium_founding_monthly', 'premium_founding_annual',
    'location_monthly', 'location_annual'
  )
);

-- ---------------------------------------------------------------- the founding index
--
-- 0003's partial index was `where price_key = 'founding_monthly'`. The founding cohort now has
-- a monthly AND an annual price, and the counter has to see both or the cap leaks: twenty
-- monthly founders plus twenty annual ones is forty permanent discounts.
drop index if exists subscriptions_founding_idx;

create index if not exists subscriptions_founding_idx
  on public.subscriptions (created_at)
  where price_key in ('premium_founding_monthly', 'premium_founding_annual');

comment on column public.subscriptions.price_key is
  'The Stripe lookup_key of the price this subscription is on. Deliberately the same string '
  'Stripe stores, so the application and the payment processor cannot disagree about what a '
  'plan is called. Price IDS differ between test and live mode; lookup keys do not.';

-- ------------------------------------------------------- the seat counter, and the cap
--
-- THIS IS THE ONE THAT WOULD HAVE COST REAL MONEY. 0012's claim_founding_seat counts holders
-- with `price_key = 'founding_monthly'`, a value that no longer exists after this migration.
-- Left alone the function would find zero holders on every call, forever, and hand out an
-- unlimited number of permanent 40% discounts while the page looked completely normal.
--
-- That is precisely the failure §3 of the pricing plan describes: a missing value rendering
-- identically to its opposite. The constraint above and this function have to move together.
--
-- Both the "already holds one" check and the count now name BOTH founding prices. A cohort
-- with a monthly and an annual price is one cohort of twenty, not twenty of each.
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
       and price_key in ('premium_founding_monthly', 'premium_founding_annual')
       and status <> 'incomplete_expired'
    union all
    select 1 from public.founding_claims
     where account_id = p_account
       and outcome = 'pending'
       and expires_at > now()
  ) into v_already;

  select count(*) into v_taken from (
    select account_id from public.subscriptions
      where price_key in ('premium_founding_monthly', 'premium_founding_annual')
        and status <> 'incomplete_expired'
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

revoke all on function public.claim_founding_seat(uuid, timestamptz, integer) from anon;
revoke all on function public.claim_founding_seat(uuid, timestamptz, integer) from authenticated;
