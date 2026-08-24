-- 0016  Which subscriptions came in on a cohort code.
--
-- The USD 49 local cohort is three months on a Stripe coupon over the standard price, so
-- price_key stays 'standard_monthly' and foundingDisplay() - which counts distinct accounts
-- on 'founding_monthly' - cannot see it. That is deliberate: the public counter is a count
-- of people who paid 149, and a giveaway must never make it read like traction.
--
-- But it leaves nothing on the row saying how somebody got here, and month four is exactly
-- when that matters: the coupon runs out, the invoice steps from 49 to 249, and the support
-- email asking why has to be answerable from the database rather than from Stripe's
-- dashboard. It is also the join for "did the cohort renew", which is the entire point of
-- running one.
--
-- Written on insert only, from the Checkout Session metadata, like scan_id. Whichever of the
-- two racing events lands first carries it, which is why createCheckout puts the same
-- metadata on the session AND on the subscription.

alter table public.subscriptions
  add column if not exists discount_code text;

comment on column public.subscriptions.discount_code is
  'Cohort promotion code applied at checkout, uppercase, e.g. LOCAL49-7F2K. Null for everybody else. Not a price: the price is price_key plus whatever Stripe charged.';

create index if not exists subscriptions_discount_code_idx
  on public.subscriptions (discount_code)
  where discount_code is not null;
