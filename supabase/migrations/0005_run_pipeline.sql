-- Word of Model — the monthly run pipeline: periods, provenance, geo, and the queue.
-- Run this in Supabase → SQL Editor, after 0004_confirmation_sent.sql.
--
-- PREREQUISITE. This migration raises and aborts if any scope's market cannot be
-- resolved to an ISO country. See the backfill section. Deal with that first; the
-- migration is deliberately not willing to guess.
--
-- This adds the machinery that turns a paid subscription into evidence. Nothing in
-- 0001-0004 is altered. scans, waitlist and rate_events are untouched.
--
-- Six things here are load bearing:
--
--   1. runs.period_start. 0002's runs.period is the CADENCE, not the period. There
--      was no way to ask "does the August 2026 monthly run for this scope exist?",
--      which is the question idempotent triggering has to ask. Without it the only
--      available answer is a proxy - "is there a run with a recent started_at" - and
--      a proxy is what cost us a subscriber's confirmation email in Session 2.
--   2. captures.raw_response. An engine call costs money and can never be
--      reproduced. A parse can be re-run a hundred times. Storing only the parsed
--      result throws away the expensive half.
--   3. captures.outcome. "Google AI Overviews showed nothing" and "you were not
--      mentioned" are different facts. Flattening them makes Google's trigger rate
--      look like the subscriber's market position, every month, silently.
--   4. captures.geo_sent and vercel_region. The method note claims a location was
--      asked from and held constant. These two columns are what make that checkable
--      rather than asserted.
--   5. runs.surfaces. A run measured over four surfaces is not comparable with one
--      measured over five. Same rule 0002 writes for competitors, one level up.
--   6. claim_capture_job(). The atomic claim cannot be expressed through the
--      supabase-js query builder. Doing it as read-then-write in JavaScript is the
--      exact race this whole session exists to avoid, so it lives here as SQL.

-- ============================================================ scopes.market_country
-- 0002 gave scopes.market as free text and lib/onboarding.ts writes profile.country
-- into it. The wizard field is labelled "Primary market" and validated as 80 chars of
-- anything, so what actually lands there is whatever the human typed. In practice, on
-- the one scope that existed when this was written, it was a product category.
--
-- Every geo parameter in the pipeline derives from this column, so it holds an ISO
-- 3166-1 alpha-2 code and nothing else. market keeps the prose, because the question
-- generation prompts read it and "United States" writes better questions than "US".
--
-- NO DEFAULT, deliberately. A default is how a row acquires a country nobody chose.
-- An insert that forgets this column must fail loudly at the point of the mistake,
-- not surface as a subscriber measured against the wrong market six weeks later.
alter table public.scopes add column if not exists market_country text;

-- Best effort backfill for the values a human plausibly typed. Anything not in here
-- is left null on purpose and caught by the check below.
update public.scopes
   set market_country = case lower(btrim(market))
     when 'united states'            then 'US'
     when 'united states of america' then 'US'
     when 'usa'                      then 'US'
     when 'us'                       then 'US'
     when 'america'                  then 'US'
     when 'australia'                then 'AU'
     when 'au'                       then 'AU'
     when 'united kingdom'           then 'GB'
     when 'uk'                       then 'GB'
     when 'great britain'            then 'GB'
     when 'britain'                  then 'GB'
     when 'england'                  then 'GB'
     when 'new zealand'              then 'NZ'
     when 'nz'                       then 'NZ'
     when 'canada'                   then 'CA'
     when 'ca'                       then 'CA'
     when 'ireland'                  then 'IE'
     when 'singapore'                then 'SG'
     when 'germany'                  then 'DE'
     when 'france'                   then 'FR'
     when 'netherlands'              then 'NL'
     when 'spain'                    then 'ES'
     when 'italy'                    then 'IT'
     when 'india'                    then 'IN'
     when 'south africa'             then 'ZA'
     when 'japan'                    then 'JP'
     when 'united arab emirates'     then 'AE'
     when 'uae'                      then 'AE'
     else null
   end
 where market_country is null;

-- Loud, not silent. A scope whose market does not name a country is not a row to
-- stamp 'US' on and move past: every question generated for it, and every geo
-- parameter sent for it, is already measuring somewhere nobody chose.
do $$
declare
  offenders text;
begin
  select string_agg(format('  %s  brand=%L  market=%L', id, brand_name, market), e'\n')
    into offenders
    from public.scopes
   where market_country is null;

  if offenders is not null then
    raise exception using
      errcode = 'check_violation',
      message = 'Cannot set scopes.market_country: these scopes have no resolvable country.',
      detail  = e'\n' || offenders,
      hint    = 'Either delete the scope (test data), or set market_country by hand '
             || 'with: update public.scopes set market_country = ''AU'' where id = ''...''; '
             || 'then re-run this migration. Do not add a default - a country nobody '
             || 'chose is worse than a migration that stops.';
  end if;
end;
$$;

alter table public.scopes alter column market_country set not null;

alter table public.scopes drop constraint if exists scopes_market_country_check;
alter table public.scopes add constraint scopes_market_country_check
  check (market_country ~ '^[A-Z]{2}$');

comment on column public.scopes.market_country is
  'ISO 3166-1 alpha-2. The single source for every geo parameter the pipeline sends. '
  'lib/geo.ts is the only module that reads it. No default: an insert must state it.';

comment on column public.scopes.market is
  'Human readable market, for the question generation prompts. NOT a geo parameter - '
  'use market_country for that.';

-- ====================================================================== runs
-- period_start is the missing half of the primary question. 0002's period says how
-- often; this says which one. Together with the unique index below, starting a run
-- becomes an insert that either wins or conflicts, and nothing anywhere has to read
-- first and then decide.
alter table public.runs add column if not exists period_start date;

-- runs was empty when this was written. If it is not, a period_start has to be
-- chosen deliberately rather than defaulted, for the same reason as market_country.
do $$
begin
  if exists (select 1 from public.runs where period_start is null) then
    raise exception using
      errcode = 'check_violation',
      message = 'Existing runs have no period_start and one cannot be inferred.',
      hint    = 'Set it from started_at where that is meaningful, then re-run.';
  end if;
end;
$$;

alter table public.runs alter column period_start set not null;

-- How many captures this run should produce, fixed at enqueue time from the surfaces
-- actually enabled. NOT a constant 25: until the SERP bake-off commits a provider,
-- google_aio is not in the set and a complete run is 5 questions x 4 surfaces = 20.
-- A hardcoded 25 would mark every run in that period partial and ship nothing.
alter table public.runs add column if not exists captures_expected integer;

do $$
begin
  if exists (select 1 from public.runs where captures_expected is null) then
    raise exception using
      errcode = 'check_violation',
      message = 'Existing runs have no captures_expected and one cannot be inferred.';
  end if;
end;
$$;

alter table public.runs alter column captures_expected set not null;

-- The surface set this run actually used, e.g. ["chatgpt","gemini","grok","perplexity"].
--
-- FOR THE SESSION THAT BUILDS DELTA REPORTING. This is the surface-level twin of the
-- competitors note in 0002, and it fails the same way. A run over four surfaces and a
-- run over five are not comparable: the Share of Model denominator is a different
-- population, so adding google_aio would show up as every subscriber's number moving
-- in the same month. That is a configuration change and it must be reported as its
-- own line, never as market movement. Compare like with like or say what changed.
alter table public.runs add column if not exists surfaces jsonb;

do $$
begin
  if exists (select 1 from public.runs where surfaces is null) then
    raise exception using
      errcode = 'check_violation',
      message = 'Existing runs have no surfaces list and one cannot be inferred.';
  end if;
end;
$$;

alter table public.runs alter column surfaces set not null;

-- Cost, accumulated per capture. cost_ceiling_usd is snapshotted from
-- RUN_COST_CEILING_USD at run creation so that changing the env var later cannot
-- retroactively make a past run look like it should have aborted.
--
-- The ceiling is SOFT and the code must not pretend otherwise: cost is only known
-- once a call returns, so with N concurrent tick chains a run can overshoot by up to
-- N captures before the claim function stops handing out work.
alter table public.runs add column if not exists cost_usd         numeric(10, 5) not null default 0;
alter table public.runs add column if not exists cost_ceiling_usd numeric(10, 5);

-- Why a run ended the way it did, and the claim that stops two overlapping sweeper
-- invocations both emailing about it. Same conditional-claim shape as
-- subscriptions.confirmation_sent_at in 0004, for the same reason.
alter table public.runs add column if not exists failure_reason text;
alter table public.runs add column if not exists alerted_at     timestamptz;

-- baseline  the within-24-hours run fired by the Stripe webhook on first payment
-- scheduled the monthly run fired by the daily cron on report_day
-- manual    fired by hand through /api/run/start behind CRON_SECRET
--
-- baseline is called out because it has no slack: the subscriber was promised a
-- report within 24 hours, so anything other than 'complete' has to alert immediately
-- and hold, rather than wait for somebody to notice.
alter table public.runs add column if not exists trigger_source text not null default 'scheduled';

alter table public.runs drop constraint if exists runs_trigger_source_check;
alter table public.runs add constraint runs_trigger_source_check
  check (trigger_source in ('baseline', 'scheduled', 'manual'));

-- partial  every job reached a terminal state but fewer captures landed than
--          expected. Per the decision in Session 3: it does NOT ship. It alerts and
--          holds. Shipping it would compute this month's Share of Model over a
--          different denominator than last month's, silently, which is the whole
--          class of bug this build keeps finding.
-- aborted  stopped on the cost ceiling. Captures already taken are kept.
alter table public.runs drop constraint if exists runs_status_check;
alter table public.runs add constraint runs_status_check
  check (status in ('pending', 'running', 'complete', 'partial', 'failed', 'aborted'));

-- One run per scope per cadence per period. This is the idempotency gate, and it is
-- also what makes the baseline run and the daily scheduler collision-safe with no
-- special case: a subscriber who checks out on the 5th gets a baseline run keyed
-- (scope, monthly, 2026-08-05), and the scheduler computing report_day = 5 that same
-- day derives the identical key and is refused by this index.
create unique index if not exists runs_scope_period_start_uniq
  on public.runs (scope_id, period, period_start);

create index if not exists runs_open_idx
  on public.runs (status, period_start)
  where status in ('pending', 'running');

-- ================================================================== captures
-- Capture and interpretation are separate steps, and these columns are the seam.

-- The whole envelope, exactly as the provider returned it. An engine call costs money
-- and cannot be reproduced; this is the only copy. Every extraction pass re-reads it.
alter table public.captures add column if not exists raw_response jsonb;

-- The engine's own citation payload, kept apart from domains_cited, which is what the
-- extraction pass concluded. Provider fact and our interpretation of it never share a
-- column.
alter table public.captures add column if not exists citations jsonb not null default '[]'::jsonb;

-- answered   the surface answered and answer_text holds it
-- no_answer  the surface was asked and produced nothing. Real, recorded, and NOT the
--            same as absence from an answer. Google AI Overviews do not fire on every
--            query, so this is the normal case there, not an error. Excluded from the
--            Share of Model denominator and reported explicitly in the method note.
-- refused    the surface declined to answer. Also evidence.
--
-- A surface that was never in this run's set has NO ROW HERE AT ALL. "We did not ask"
-- and "we asked and got nothing" are different facts and must not share a
-- representation.
--
-- Permanent transport failures (401, 400, model mismatch) leave no capture row
-- either. They are not evidence. They live on capture_jobs with their error.
alter table public.captures add column if not exists outcome text;

do $$
begin
  if exists (select 1 from public.captures where outcome is null) then
    raise exception using
      errcode = 'check_violation',
      message = 'Existing captures have no outcome and one cannot be safely inferred.',
      hint    = 'An empty answer_text is ambiguous between answered-with-nothing and '
             || 'never-asked, which is exactly the distinction this column adds.';
  end if;
end;
$$;

alter table public.captures alter column outcome set not null;

alter table public.captures drop constraint if exists captures_outcome_check;
alter table public.captures add constraint captures_outcome_check
  check (outcome in ('answered', 'no_answer', 'refused'));

-- An answered capture has text. The others must not pretend to.
alter table public.captures drop constraint if exists captures_answer_matches_outcome;
alter table public.captures add constraint captures_answer_matches_outcome
  check (
    (outcome = 'answered' and answer_text is not null and length(btrim(answer_text)) > 0)
    or (outcome <> 'answered')
  );

-- Who fetched it, for the surfaces where that is not the same as the engine.
-- google_aio is captured through SerpApi or DataForSEO, and which one is provenance:
-- the bake-off exists because they do not return the same thing.
alter table public.captures add column if not exists provider text;

-- The exact geo parameters sent to this surface for this capture. null means the
-- surface accepts none - Gemini and Grok document no location control at all - and
-- that is a method note, not a failure: "we asked Google as a buyer in your market;
-- Gemini accepts no location, so that answer is location-neutral."
--
-- Stored per capture rather than derived from the scope, because the scope's market
-- can be edited and this has to stay true about what was actually sent.
alter table public.captures add column if not exists geo_sent jsonb;

-- The Vercel region the call went out from. For the two surfaces with no location
-- parameter, the network origin IS the location, so this is the only record of where
-- Gemini and Grok thought we were. vercel.json pins iad1 and it should never change;
-- this column is what makes "held constant every month" checkable instead of
-- asserted, and what tells the truth if a second region is ever added.
alter table public.captures add column if not exists vercel_region text;

do $$
begin
  if exists (select 1 from public.captures where vercel_region is null) then
    raise exception using
      errcode = 'check_violation',
      message = 'Existing captures have no vercel_region and one cannot be inferred.';
  end if;
end;
$$;

alter table public.captures alter column vercel_region set not null;

-- 0002 has a single tokens column. Cost needs the split, because input and output
-- price differently on every provider and a web-search answer is mostly input.
alter table public.captures add column if not exists tokens_in  integer;
alter table public.captures add column if not exists tokens_out integer;
alter table public.captures add column if not exists latency_ms integer;

-- The extraction pass, versioned so a re-parse is comparable and a prompt change is
-- visible in the data rather than inferred from the git log.
--
-- extracted_at is NOT inferable from brands_named being non-empty: an answer that
-- genuinely names nobody produces an empty array, and that is the single most common
-- finding in this product. "Has this been parsed" and "did the parse find anything"
-- are different questions and need different columns.
alter table public.captures add column if not exists extracted_at       timestamptz;
alter table public.captures add column if not exists extraction_version integer;
alter table public.captures add column if not exists extractor_model    text;

-- Serves the extraction pass looking for work.
create index if not exists captures_unextracted_idx
  on public.captures (run_id)
  where extracted_at is null;

-- ============================================================== capture_jobs
-- Backoff, so a rate limited engine is retried later rather than immediately and by
-- everyone at once.
alter table public.capture_jobs add column if not exists next_attempt_at timestamptz not null default now();
alter table public.capture_jobs add column if not exists max_attempts    integer not null default 4;

-- retryable  429, 5xx, timeout, network. Backs off and tries again.
-- permanent  400, 401, 403, a refusal, or a model mismatch. One attempt, then stop.
--            A model mismatch is permanent on purpose: if Perplexity's Agent API
--            answered with somebody else's model, retrying does not make the answer
--            a Perplexity answer.
alter table public.capture_jobs add column if not exists error_kind text;

alter table public.capture_jobs drop constraint if exists capture_jobs_error_kind_check;
alter table public.capture_jobs add constraint capture_jobs_error_kind_check
  check (error_kind is null or error_kind in ('retryable', 'permanent'));

-- The old pending index ordered by id, which ignores backoff. Replace it with one the
-- claim query can actually walk in the order it needs.
drop index if exists public.capture_jobs_pending_idx;
create index if not exists capture_jobs_claimable_idx
  on public.capture_jobs (capture_method, next_attempt_at, id)
  where status = 'pending';

-- ========================================================= claim_capture_job
-- The atomic claim. Two workers cannot take the same job, a worker cannot take work
-- on a run that has aborted on cost, and a job in backoff is invisible until its time.
--
-- This is a function rather than application code because the claim has to be one
-- statement. supabase-js cannot express `update ... where id = (select ... for update
-- skip locked)`, and the read-then-write it would force is precisely the race that
-- cost a subscriber their confirmation email in Session 2.
--
-- Flipping the run to running on first claim happens here too, for the same reason:
-- one statement, no read-then-write, no two invocations both deciding they were first.
create or replace function public.claim_capture_job(
  p_worker_id text,
  p_methods   text[]
)
returns public.capture_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  j public.capture_jobs;
begin
  update public.capture_jobs
     set status     = 'running',
         worker_id  = p_worker_id,
         claimed_at = now(),
         attempts   = attempts + 1
   where id = (
     select cj.id
       from public.capture_jobs cj
       join public.runs r on r.id = cj.run_id
      where cj.status = 'pending'
        and cj.capture_method = any (p_methods)
        and cj.next_attempt_at <= now()
        and r.status in ('pending', 'running')
        -- The cost ceiling. Soft by nature: cost is only known after the call, so
        -- concurrent chains can overshoot by up to one capture each.
        and (r.cost_ceiling_usd is null or r.cost_usd < r.cost_ceiling_usd)
      order by cj.next_attempt_at, cj.id
        for update of cj skip locked
      limit 1
   )
  returning * into j;

  if j.id is null then
    return null;
  end if;

  update public.runs
     set status     = 'running',
         started_at = coalesce(started_at, now())
   where id = j.run_id
     and status = 'pending';

  return j;
end;
$$;

-- ================================================ release_stale_capture_jobs
-- A worker that died mid-capture leaves a job claimed forever. This is what stops
-- that stranding a subscriber's report: past the timeout the claim reverts and
-- somebody else picks it up.
--
-- A job that has burned its attempts on stale claims fails rather than looping.
-- Returns how many it touched so the sweeper can log a real number.
create or replace function public.release_stale_capture_jobs(
  p_stale_after interval default '10 minutes'
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  update public.capture_jobs cj
     set status          = case when cj.attempts >= cj.max_attempts then 'failed' else 'pending' end,
         error_kind      = case when cj.attempts >= cj.max_attempts then 'retryable' else cj.error_kind end,
         error           = case when cj.attempts >= cj.max_attempts
                                then 'abandoned: claim went stale after ' || cj.attempts || ' attempts'
                                else cj.error end,
         worker_id       = null,
         claimed_at      = null,
         completed_at    = case when cj.attempts >= cj.max_attempts then now() else null end,
         next_attempt_at = now()
   where cj.id in (
     select id
       from public.capture_jobs
      where status = 'running'
        and claimed_at < now() - p_stale_after
        for update skip locked
   );

  get diagnostics n = row_count;
  return n;
end;
$$;

-- =============================================================== settle_run
-- The only place a run is allowed to be declared finished.
--
-- THIS IS THE POINT OF THE WHOLE FILE. No tick invocation settles a run. The tick
-- that happens to finish the twenty-fifth job marks its own job done and nothing
-- else. "I finished the last job" is not "this subscriber has a complete report", in
-- exactly the way "did I insert the row" was not "has this person been told".
--
-- Returns null when the run is not ready, so the caller cannot mistake "not finished"
-- for "finished with nothing". The status write is claimed conditionally on
-- completed_at being null, so two overlapping sweeper invocations cannot both settle
-- and cannot both alert.
create or replace function public.settle_run(p_run_id uuid)
returns public.runs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r          public.runs;
  open_jobs  integer;
  delivered  integer;
  expected   integer;
begin
  select * into r from public.runs where id = p_run_id;
  if r.id is null or r.completed_at is not null then
    return null;
  end if;

  select count(*) into open_jobs
    from public.capture_jobs
   where run_id = p_run_id
     and status in ('pending', 'running');

  if open_jobs > 0 then
    return null;
  end if;

  -- Ask the real question: how many captures does this subscriber actually have?
  -- Not "did every job return 200". A no_answer is a delivered observation - the
  -- surface was asked and showed nothing - so it counts here. Whether it counts in
  -- the Share of Model denominator is a separate question, answered in lib/extract.ts.
  select count(*) into delivered
    from public.captures
   where run_id = p_run_id
     and outcome in ('answered', 'no_answer', 'refused');

  expected := r.captures_expected;

  update public.runs
     set status         = case
                            when status = 'aborted' then 'aborted'
                            when delivered >= expected then 'complete'
                            else 'partial'
                          end,
         completed_at   = now(),
         failure_reason = case
                            when status = 'aborted' then failure_reason
                            when delivered >= expected then null
                            else format('%s of %s captures delivered', delivered, expected)
                          end
   where id = p_run_id
     and completed_at is null
  returning * into r;

  -- No row back means another sweeper settled it between the read above and this
  -- update. It did the work and it holds the alert claim, so this one says nothing.
  -- Returning the stale record read at the top would let two invocations both report
  -- a settlement that happened once.
  if r.id is null then
    return null;
  end if;

  return r;
end;
$$;

-- ============================================================ claim_run_alert
-- Claims the right to alert about a run, once. Same conditional-update shape as
-- claimConfirmationEmail in 0004: a row back means this process won and must send.
-- No row means somebody already has it. A send that then fails writes the claim back
-- to null, so the next sweep retries rather than the alert being lost for good.
create or replace function public.claim_run_alert(p_run_id uuid)
returns uuid
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.runs
     set alerted_at = now()
   where id = p_run_id
     and alerted_at is null
  returning id;
$$;

-- =================================================================== grants
-- Every one of these is called by the Next.js server on the secret key, which is
-- service_role. Nothing else may execute them: capture_jobs deliberately has RLS and
-- no policy at all, and a security definer function is a way around that if it is
-- granted too widely.
revoke all on function public.claim_capture_job(text, text[])          from public, anon, authenticated;
revoke all on function public.release_stale_capture_jobs(interval)     from public, anon, authenticated;
revoke all on function public.settle_run(uuid)                         from public, anon, authenticated;
revoke all on function public.claim_run_alert(uuid)                    from public, anon, authenticated;

grant execute on function public.claim_capture_job(text, text[])       to service_role;
grant execute on function public.release_stale_capture_jobs(interval)  to service_role;
grant execute on function public.settle_run(uuid)                      to service_role;
grant execute on function public.claim_run_alert(uuid)                 to service_role;

-- ============================================================== housekeeping
-- Nothing above grants any new read to authenticated. The columns added to captures
-- and runs are covered by the existing select policies from 0002, which is correct:
-- a subscriber should be able to see the raw answer and the geo parameters we sent,
-- because that is the evidence they are paying for. capture_jobs stays invisible.
--
-- One consequence worth knowing before it surprises somebody: captures.raw_response
-- holds the full provider envelope, and it is readable by the account that owns the
-- run. That is intended - it is their evidence - but it means anything a provider
-- puts in an envelope is subscriber-visible. Nothing in the five providers' payloads
-- carries our credentials, and the engine modules must keep it that way: never write
-- the request into raw_response, only the response.
