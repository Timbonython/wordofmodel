-- Word of Model — initial schema
-- Run this in Supabase → SQL Editor.
--
-- Every table here is reached only from the Next.js server using the secret key,
-- which bypasses RLS. RLS is enabled with NO policies on purpose: the scans table
-- holds prospect email addresses, and with zero policies nothing but the secret
-- key can read a single row, even if a publishable key is exposed later.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- scans
create table if not exists public.scans (
  id            uuid primary key default gen_random_uuid(),
  domain        text        not null,

  -- step 2, as confirmed by the visitor in step 3
  brand_name      text,
  what_they_sell  text,
  buyer           text,
  country         text,
  category_term   text,
  profile_edited  boolean not null default false,

  -- step 3
  question      text,

  -- step 4: one entry per engine, each with the answer, the model that produced
  -- it, its citations and its score
  captures      jsonb,

  -- step 5, the free verdict as shown
  result        jsonb,

  status        text        not null default 'running'
                check (status in ('running', 'complete', 'failed')),
  error         text,

  -- step 6
  email         text,
  revealed_at   timestamptz,
  emailed_at    timestamptz,

  -- provenance and abuse control. ip_hash is sha256(ip + salt), never the address
  ip_hash       text,
  user_agent    text,
  cost_usd      numeric(10, 5),

  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);

-- serves the 24 hour cache
create index if not exists scans_domain_created_idx
  on public.scans (domain, created_at desc);

-- serves the per IP rate limit
create index if not exists scans_ip_created_idx
  on public.scans (ip_hash, created_at desc);

-- prospect list, newest first
create index if not exists scans_email_idx
  on public.scans (email) where email is not null;

-- ------------------------------------------------------------- waitlist
-- Stands in for the onboarding wizard until Stripe exists.
create table if not exists public.waitlist (
  id          uuid primary key default gen_random_uuid(),
  email       text        not null,
  domain      text,
  source      text        not null default 'pricing',
  scan_id     uuid references public.scans (id) on delete set null,
  ip_hash     text,
  created_at  timestamptz not null default now()
);

-- Addresses are lowercased in the application before insert, so a plain unique
-- index is enough and upsert can target it by column name.
create unique index if not exists waitlist_email_uniq
  on public.waitlist (email);

-- ---------------------------------------------------------- rate_events
-- Every attempt, including the ones that fail or get refused, so a loop cannot
-- burn API credit by never reaching a completed scan.
create table if not exists public.rate_events (
  id          bigserial primary key,
  ip_hash     text        not null,
  kind        text        not null,
  created_at  timestamptz not null default now()
);

create index if not exists rate_events_ip_created_idx
  on public.rate_events (ip_hash, created_at desc);

-- ------------------------------------------------------------------ RLS
alter table public.scans       enable row level security;
alter table public.waitlist    enable row level security;
alter table public.rate_events enable row level security;

-- Deliberately no policies. Do not add one without deciding what may read
-- prospect email addresses.

-- ------------------------------------------------------- housekeeping
-- rate_events is disposable. Trim it when convenient:
--   delete from public.rate_events where created_at < now() - interval '7 days';
