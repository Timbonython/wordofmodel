-- Word of Model — repeat sampling per surface.
-- Run this in Supabase → SQL Editor, after 0006_capture_provenance.sql.
--
-- WHY. 0002 keys captures and capture_jobs on
-- (run_id, question_id, engine, capture_method), which encodes an assumption nobody
-- stated: that a surface is asked each question exactly once. That held until we
-- measured the surfaces and found they rewrite themselves between calls - word overlap
-- of 0.31 to 0.44 across repeat answers on Perplexity, Gemini and Google AI Overviews
-- alike.
--
-- The answer is to ask the cheap surfaces three times and report the share of samples
-- that named the subscriber, rather than one draw from a wide distribution. Without a
-- sample column the second draw collides with the first on the unique index and is
-- silently refused, which would look exactly like a run that completed.
--
-- WHAT A SAMPLE IS, and it matters for the score: three samples are three readings of
-- ONE observation - "does this surface name you for this question" - not three
-- observations. So the Share of Model denominator counts the surface-question pair once
-- and the numerator takes the share that named you. Two of three counts as two thirds.
-- A surface asked once contributes one or nothing. No surface is weighted more heavily
-- for being sampled more often, and sampling depth can change per surface later without
-- redefining the metric.

alter table public.captures     add column if not exists sample smallint not null default 1;
alter table public.capture_jobs add column if not exists sample smallint not null default 1;

alter table public.captures drop constraint if exists captures_sample_check;
alter table public.captures add constraint captures_sample_check check (sample between 1 and 10);

alter table public.capture_jobs drop constraint if exists capture_jobs_sample_check;
alter table public.capture_jobs add constraint capture_jobs_sample_check check (sample between 1 and 10);

-- The keys, widened. Dropped and recreated rather than added alongside: leaving the old
-- four-column unique in place would still refuse the second sample, and it would do it
-- as a database error inside a worker rather than anywhere visible.
alter table public.captures drop constraint if exists captures_run_question_engine_uniq;
alter table public.captures add constraint captures_run_question_engine_sample_uniq
  unique (run_id, question_id, engine, capture_method, sample);

alter table public.capture_jobs drop constraint if exists capture_jobs_run_question_engine_uniq;
alter table public.capture_jobs add constraint capture_jobs_run_question_engine_sample_uniq
  unique (run_id, question_id, engine, capture_method, sample);

-- How many samples each surface was asked for on this run, e.g.
-- {"chatgpt":1,"gemini":3,"grok":1,"perplexity":3,"google_aio":3}.
--
-- FOR THE SESSION THAT BUILDS DELTA REPORTING. This is the third thing that can change
-- underneath a trend line without the market moving, after the competitor set (0002) and
-- the surface set (0005). Going from one sample to three narrows a surface's error bars,
-- which will move its number on its own. A change here is a configuration change and must
-- be reported as one, never as movement.
--
-- Sampling depth follows COST, not importance: ChatGPT is about USD 0.35 an answer and
-- Grok USD 0.19, against under a cent for Perplexity. The method note says so rather than
-- implying an evenness that does not exist.
alter table public.runs add column if not exists samples jsonb;

do $$
begin
  if exists (select 1 from public.runs where samples is null) then
    raise exception using
      errcode = 'check_violation',
      message = 'Existing runs have no samples map and one cannot be inferred.';
  end if;
end;
$$;

alter table public.runs alter column samples set not null;

comment on column public.captures.sample is
  'Which reading of this surface-question pair, 1-based. Three samples are three readings '
  'of one observation, not three observations: the Share of Model denominator counts the '
  'pair once and the numerator takes the share of samples that named the target.';

-- ============================================================== add_run_cost
-- Accumulate spend onto a run, atomically, and abort it if that breaches the ceiling.
--
-- WHY THIS IS SQL. Four tick chains finish captures at the same time. Read cost_usd, add
-- to it, write it back, and three of the four increments vanish - a lost update, which is
-- the same shape of bug as the confirmation email race and would be far harder to see:
-- the run would simply appear cheaper than it was, and the ceiling would never fire.
-- `set cost_usd = cost_usd + $1` in one statement cannot lose an increment.
--
-- The abort is here for the same reason. Reading the new total in JavaScript and then
-- deciding to abort is two statements with a gap in the middle, and in that gap another
-- chain claims another capture.
--
-- THE CEILING IS SOFT AND THE CODE MUST NOT PRETEND OTHERWISE. Cost is only known after
-- a call returns, so with four chains a run can overshoot by up to four captures before
-- the claim function stops handing out work. USD 8.00 against a measured run cost of
-- USD 3.78 leaves room for that and for retries: this catches a runaway loop, it does not
-- manage COGS. Actual spend is read per capture from captures.cost_usd.
create or replace function public.add_run_cost(
  p_run_id uuid,
  p_usd    numeric
)
returns public.runs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.runs;
begin
  update public.runs
     set cost_usd = cost_usd + coalesce(p_usd, 0)
   where id = p_run_id
  returning * into r;

  if r.id is null then
    return null;
  end if;

  if r.cost_ceiling_usd is not null
     and r.cost_usd >= r.cost_ceiling_usd
     and r.status in ('pending', 'running') then
    update public.runs
       set status = 'aborted',
           failure_reason = format(
             'aborted on cost ceiling: %s spent against a ceiling of %s',
             round(r.cost_usd, 4), r.cost_ceiling_usd)
     where id = p_run_id
       and status in ('pending', 'running')
    returning * into r;
  end if;

  return r;
end;
$$;

revoke all on function public.add_run_cost(uuid, numeric) from public, anon, authenticated;
grant execute on function public.add_run_cost(uuid, numeric) to service_role;
