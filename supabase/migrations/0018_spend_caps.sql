-- Spend controls on the free scan.
--
-- /api/scan is unauthenticated and every call spends real money at OpenAI and Perplexity. It
-- is now being advertised, which means the endpoint's cost is exposed to anybody who can write
-- a loop. Per-IP limits alone do not bound the bill: an IP is free and a script can have
-- thousands of them.
--
-- So: a GLOBAL daily ceiling on scans started, and a limit per email address as well as per IP.
-- Deliberately NOT a CAPTCHA and NOT email verification before the scan runs. Both cost
-- conversion on the one thing the whole funnel depends on, and there is no evidence of abuse
-- yet. These caps cost a legitimate visitor nothing.

-- The address a reveal was requested for, hashed. Same reasoning as ip_hash: limiting only
-- needs to know two requests came from the same place, and this table is not a mailing list.
alter table public.rate_events add column if not exists email_hash text;

create index if not exists rate_events_email_created_idx
  on public.rate_events (email_hash, kind, created_at desc)
  where email_hash is not null;

-- Serves the global daily count, which reads by kind and time with no ip_hash to narrow it.
create index if not exists rate_events_kind_created_idx
  on public.rate_events (kind, created_at desc);

-- The global cap counts scans actually created, because that is the row that cost money.
create index if not exists scans_created_idx
  on public.scans (created_at desc);

comment on column public.rate_events.email_hash is
  'sha256 of a lowercased address, for per-address limiting. Never the address itself.';
