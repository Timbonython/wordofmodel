-- Word of Model — accounts, scopes, runs, captures, and the capture queue.
-- Run this in Supabase → SQL Editor, after 0001_init.sql.
--
-- This migration adds the subscriber side of the product. It does not touch
-- scans, waitlist or rate_events: the free scan keeps working exactly as it does.
--
-- The shape is  account -> scope -> questions / competitors -> runs -> captures.
-- A scope is one category, one market, one buyer. A solo subscriber is an account
-- with exactly one scope; an agency is one account with several.
--
-- Two things here are load bearing and should not be relaxed without a reason:
--
--   1. The provenance columns on captures. The monthly run is five API/SERP
--      surfaces, the quarterly adds two read by a human in a browser, and both
--      land in this table. The method note has to be able to say which was which.
--   2. RLS. Every table below is written only by the Next.js server on the secret
--      key, which bypasses RLS. Subscribers get read-only policies scoped to their
--      own account, granted to `authenticated` alone. Nothing is granted to `anon`.

create extension if not exists pgcrypto;

-- ------------------------------------------------------------- accounts
-- The billing entity, and the thing a login attaches to.
--
-- id is deliberately NOT auth.users.id. Every scope, run and capture hangs off
-- this id, so tying it to an auth row would make team seats, or an account
-- outliving a login, an FK migration across the whole schema. auth_user_id is
-- the join instead, and it is nullable: deleting an auth user unlinks the login
-- and leaves the account, its subscription and its evidence intact.
create table if not exists public.accounts (
  id                  uuid primary key default gen_random_uuid(),
  auth_user_id        uuid unique references auth.users (id) on delete set null,
  email               text not null unique,
  stripe_customer_id  text unique,
  created_at          timestamptz not null default now()
);

-- --------------------------------------------------------------- scopes
-- One category, one market, one buyer. The unit everything is measured against.
create table if not exists public.scopes (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts (id) on delete cascade,
  category    text not null,
  market      text not null,
  buyer       text not null,
  created_at  timestamptz not null default now()
);

create index if not exists scopes_account_idx on public.scopes (account_id);

-- ------------------------------------------------------------ questions
-- The five slots from the onboarding spec, by name rather than by number. Each
-- slot fails differently, and `branded` is the control: it is nearly always 100%,
-- it never counts toward the unbranded score, and the gap between it and the
-- other four is the headline finding in every report.
--
-- Report ordering lives in the application, not here.
create table if not exists public.questions (
  id           uuid primary key default gen_random_uuid(),
  scope_id     uuid not null references public.scopes (id) on delete cascade,
  slot         text not null,
  text         text not null,
  approved_at  timestamptz,
  constraint questions_slot_check check (
    slot in ('category', 'situation', 'alternatives', 'how_do_people', 'branded')
  ),
  constraint questions_scope_slot_uniq unique (scope_id, slot)
);

create index if not exists questions_scope_idx on public.questions (scope_id);

-- ---------------------------------------------------------- competitors
-- Membership is a timeline, not a list. added_at/removed_at/source exist so a
-- change to the competitor set can never be read as a change in the market.
--
-- FOR THE SESSION THAT BUILDS DELTA REPORTING: a competitor with
-- source = 'subscriber_added' and added_at inside the reporting period did not
-- overtake anyone. It was configured in. The delta must compare like with like,
-- which means either restricting the comparison to competitors present for the
-- whole span (added_at <= previous run, removed_at is null or after this run),
-- or reporting a configuration change as its own line, separately from movement.
-- Same for a removal. Getting this wrong invents a market event out of an edit.
create table if not exists public.competitors (
  id          uuid primary key default gen_random_uuid(),
  scope_id    uuid not null references public.scopes (id) on delete cascade,
  name        text not null,
  domain      text,
  source      text not null default 'proposed',
  added_at    timestamptz not null default now(),
  removed_at  timestamptz,
  constraint competitors_source_check check (source in ('proposed', 'subscriber_added'))
);

create index if not exists competitors_scope_idx on public.competitors (scope_id);

-- Unique among the live set only, so a competitor removed in month two can be
-- added back in month five without colliding with its own history.
create unique index if not exists competitors_scope_name_uniq
  on public.competitors (scope_id, lower(name))
  where removed_at is null;

-- ----------------------------------------------------------------- runs
-- period is the cadence, not a date range:
--   monthly      five API/SERP surfaces
--   quarterly    those five plus Claude and Copilot, hand read in a browser
--   calibration  the API-versus-browser run that documents the delta between the
--                two capture methods for the methodology page. Not a subscriber
--                deliverable, and must never be counted in a trend line.
create table if not exists public.runs (
  id            uuid primary key default gen_random_uuid(),
  scope_id      uuid not null references public.scopes (id) on delete cascade,
  period        text not null,
  status        text not null default 'pending',
  started_at    timestamptz,
  completed_at  timestamptz,
  constraint runs_period_check check (period in ('monthly', 'quarterly', 'calibration')),
  constraint runs_status_check check (status in ('pending', 'running', 'complete', 'failed'))
);

create index if not exists runs_scope_started_idx on public.runs (scope_id, started_at desc);

-- ------------------------------------------------------------- captures
-- The evidence. Verbatim answer text per surface per question, kept forever.
--
-- The locked surface set, frozen 10 Aug 2026 because there are zero subscribers
-- and this is the only moment it can change for free. Every later change resets
-- the Share of Model baseline.
--
--   chatgpt     monthly    api      OpenAI Responses API + web search
--   gemini      monthly    api      Google API
--   grok        monthly    api      xAI API + Web Search, model pinned
--   perplexity  monthly    api      Agent API, pinned to perplexity/sonar
--   google_aio  monthly    serp     licensed SERP provider
--   claude      quarterly  browser  hand read, clean logged out profile
--   copilot     quarterly  browser  no sanctioned API exists
--
-- We measure surfaces, not models. A surface is only ever recorded from itself:
-- we never run a different system and file the answer under a surface's name.
-- That is why Claude and Copilot are browser only, and it is the one substitution
-- this product cannot make.
--
-- engine and capture_method are both in the unique key on purpose. A quarterly
-- run captures the same question on the same surface twice, once by API and once
-- by hand, and both rows have to coexist for the calibration to mean anything.
create table if not exists public.captures (
  id                  uuid primary key default gen_random_uuid(),
  run_id              uuid not null references public.runs (id) on delete cascade,
  question_id         uuid not null references public.questions (id) on delete restrict,
  engine              text not null,
  capture_method      text not null,
  model_used          text,
  operator            text,
  answer_text         text,
  brands_named        jsonb not null default '[]'::jsonb,
  target_mentioned    boolean,
  target_recommended  boolean,
  target_position     integer,
  top_recommendation  text,
  domains_cited       jsonb not null default '[]'::jsonb,
  tokens              integer,
  cost_usd            numeric(10, 5),
  captured_at         timestamptz not null default now(),
  constraint captures_engine_check check (
    engine in ('chatgpt', 'gemini', 'grok', 'perplexity', 'google_aio', 'claude', 'copilot')
  ),
  constraint captures_method_check check (capture_method in ('api', 'serp', 'browser')),
  -- A hand read answer with nobody's name against it is not evidence.
  constraint captures_operator_required check (
    capture_method <> 'browser' or operator is not null
  ),
  constraint captures_run_question_engine_uniq
    unique (run_id, question_id, engine, capture_method)
);

create index if not exists captures_run_idx on public.captures (run_id);
create index if not exists captures_question_captured_idx
  on public.captures (question_id, captured_at desc);

-- ---------------------------------------------------------- capture_jobs
-- The work queue. capture_method is here as well as on captures because it is
-- what routes a job: engine does not imply method (AI Overviews can be SERP or
-- browser), and the browser jobs are a human queue, not a worker queue.
--
-- Claim atomically, so two workers cannot take the same job:
--
--   update public.capture_jobs
--      set status = 'running', worker_id = $1, claimed_at = now(),
--          attempts = attempts + 1
--    where id = (
--      select id from public.capture_jobs
--       where status = 'pending' and capture_method = $2
--       order by id
--         for update skip locked
--       limit 1
--    )
--   returning *;
--
-- Stale claims revert: a row left 'running' past the timeout goes back to
-- 'pending' so a worker that died does not strand a subscriber's report.
create table if not exists public.capture_jobs (
  id              uuid primary key default gen_random_uuid(),
  run_id          uuid not null references public.runs (id) on delete cascade,
  question_id     uuid not null references public.questions (id) on delete cascade,
  engine          text not null,
  capture_method  text not null,
  status          text not null default 'pending',
  worker_id       text,
  attempts        integer not null default 0,
  error           text,
  claimed_at      timestamptz,
  completed_at    timestamptz,
  constraint capture_jobs_engine_check check (
    engine in ('chatgpt', 'gemini', 'grok', 'perplexity', 'google_aio', 'claude', 'copilot')
  ),
  constraint capture_jobs_method_check check (capture_method in ('api', 'serp', 'browser')),
  constraint capture_jobs_status_check check (status in ('pending', 'running', 'done', 'failed')),
  constraint capture_jobs_run_question_engine_uniq
    unique (run_id, question_id, engine, capture_method)
);

create index if not exists capture_jobs_run_idx on public.capture_jobs (run_id);

-- Serves the claim query. Partial, because only pending rows are ever selected
-- for and the done rows are the bulk of the table.
create index if not exists capture_jobs_pending_idx
  on public.capture_jobs (capture_method, id)
  where status = 'pending';

-- Serves the stale claim sweep.
create index if not exists capture_jobs_claimed_idx
  on public.capture_jobs (claimed_at)
  where status = 'running';

-- ------------------------------------------------- the account of the caller
-- Every policy below except the one on accounts routes through this. It is the
-- single place that decides what "your account" means, so adding team seats
-- later is a change to this function rather than to eight policies.
--
-- security definer so it reads accounts with RLS bypassed, which is what stops
-- the accounts policy from recursing into itself. search_path is pinned: a
-- security definer function without one is a privilege escalation waiting for
-- somebody to create a table called accounts in another schema.
create or replace function public.current_account_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id from public.accounts where auth_user_id = auth.uid();
$$;

revoke all on function public.current_account_id() from public, anon;
grant execute on function public.current_account_id() to authenticated;

-- ------------------------------------------------------------------- RLS
alter table public.accounts      enable row level security;
alter table public.scopes        enable row level security;
alter table public.questions     enable row level security;
alter table public.competitors   enable row level security;
alter table public.runs          enable row level security;
alter table public.captures      enable row level security;
alter table public.capture_jobs  enable row level security;

-- Read only, authenticated only, own account only. There are deliberately no
-- insert, update or delete policies anywhere: every write goes through the
-- server on the secret key, which bypasses RLS entirely.
drop policy if exists accounts_select_own on public.accounts;
create policy accounts_select_own on public.accounts
  for select to authenticated
  using (auth_user_id = auth.uid());

drop policy if exists scopes_select_own on public.scopes;
create policy scopes_select_own on public.scopes
  for select to authenticated
  using (account_id = public.current_account_id());

drop policy if exists questions_select_own on public.questions;
create policy questions_select_own on public.questions
  for select to authenticated
  using (exists (
    select 1 from public.scopes s
     where s.id = questions.scope_id
       and s.account_id = public.current_account_id()
  ));

drop policy if exists competitors_select_own on public.competitors;
create policy competitors_select_own on public.competitors
  for select to authenticated
  using (exists (
    select 1 from public.scopes s
     where s.id = competitors.scope_id
       and s.account_id = public.current_account_id()
  ));

drop policy if exists runs_select_own on public.runs;
create policy runs_select_own on public.runs
  for select to authenticated
  using (exists (
    select 1 from public.scopes s
     where s.id = runs.scope_id
       and s.account_id = public.current_account_id()
  ));

drop policy if exists captures_select_own on public.captures;
create policy captures_select_own on public.captures
  for select to authenticated
  using (exists (
    select 1
      from public.runs r
      join public.scopes s on s.id = r.scope_id
     where r.id = captures.run_id
       and s.account_id = public.current_account_id()
  ));

-- capture_jobs gets RLS and NO policy at all. It is the work queue: worker ids,
-- claim times, attempt counts and failures. A subscriber has no reason to read
-- it, and the operational picture of how their report gets made is not theirs.

-- ---------------------------------------------------------------- grants
-- Belt and braces over RLS. Supabase grants table privileges to anon and
-- authenticated by default, and RLS is what actually holds the line, but a
-- policy written wrongly in a later migration should still not be able to hand
-- anyone a write.
revoke all on table
  public.accounts, public.scopes, public.questions, public.competitors,
  public.runs, public.captures, public.capture_jobs
  from anon;

revoke all on table
  public.accounts, public.scopes, public.questions, public.competitors,
  public.runs, public.captures, public.capture_jobs
  from authenticated;

grant select on table
  public.accounts, public.scopes, public.questions, public.competitors,
  public.runs, public.captures
  to authenticated;

-- ------------------------------------------------ account on first login
-- Magic link only, so an auth user exists only after Supabase has verified that
-- somebody could open mail at that address. That is the whole security model,
-- and it is why the conflict case relinks unconditionally: whoever proves the
-- address gets the account, and an account whose auth user was deleted can be
-- claimed again by the same address rather than silently forking into a second
-- account holding none of the history.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.email is null then
    return new;
  end if;

  insert into public.accounts (auth_user_id, email)
  values (new.id, lower(new.email))
  on conflict (email) do update
    set auth_user_id = excluded.auth_user_id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------- housekeeping
-- captures.question_id is ON DELETE RESTRICT, so a question that has been asked
-- cannot be deleted and take its own evidence with it. Changing a subscriber's
-- question means writing a new row, not editing the old one, which is also what
-- keeps the trend line honest.
--
-- The same restrict means deleting a scope that has captures will fail. That is
-- intended. Delete the runs first, deliberately, or do not delete it.
