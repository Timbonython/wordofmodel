-- Word of Model — search provenance, and a null that was not a null.
-- Run this in Supabase → SQL Editor, after 0005_run_pipeline.sql.
--
-- Two things, both found by calling the real APIs on 20 Aug 2026 rather than by
-- reading their documentation.

-- ============================================ how much searching actually happened
-- Grok chose to run ELEVEN web searches for one question, which is why a single
-- capture cost USD 0.19 against a build plan that budgeted USD 0.03 per subscriber
-- per month for the whole surface. Nothing in the rate card predicts that; only the
-- call does.
--
-- Stored per capture because it is the cost driver AND a quality signal: an answer
-- built from eleven searches and an answer built from one are not the same evidence,
-- and if a surface quietly stops searching, this column is where it shows up first.
alter table public.captures add column if not exists search_calls integer;

-- ================================================= was the answer actually searched
-- gemini-3.6-flash returns HTTP 200, a fluent answer, and NO groundingMetadata: it
-- ignored the google_search tool and answered from training data. promptTokenCount
-- was 7 against 772 for the same question on gemini-3.5-flash, which is the search
-- results being absent.
--
-- This is the failure the free scan spec already documents for Perplexity - "without
-- an explicit web_search tool the request still succeeds, but Sonar answers from
-- memory with zero sources" - reappearing under a different vendor. A 200 is not
-- proof of a grounded answer.
--
-- We do not throw the capture away, because "Gemini answered this one without
-- searching" is a true and interesting fact about the surface. We record it and the
-- method note says so, exactly as no_answer does for AI Overviews. What we must never
-- do is average a memory answer and a searched answer together and call the result a
-- measurement of what buyers see.
--
-- null means the question does not apply to this surface: google_aio is a SERP
-- scrape, and there is no sense in which it did or did not choose to search.
alter table public.captures add column if not exists grounded boolean;

-- ========================================================= where the cost came from
-- reported  the provider told us. xAI returns usage.cost_in_usd_ticks (1 tick =
--           1e-10 USD, verified to the cent against the published rate card).
--           Perplexity returns usage.cost.total_cost.
-- computed  we multiplied tokens by a price table. OpenAI and Gemini report tokens
--           only, so their cost is our arithmetic and drifts silently the day either
--           one changes price.
--
-- Provenance is recorded, not assumed, and that applies to the money as much as to
-- the model. A cost audit has to know which figures are somebody's invoice and which
-- are our estimate.
alter table public.captures add column if not exists cost_source text;

alter table public.captures drop constraint if exists captures_cost_source_check;
alter table public.captures add constraint captures_cost_source_check
  check (cost_source is null or cost_source in ('reported', 'computed'));

-- ======================================== the null that was not a null
-- 0005 declared claim_capture_job as `returns public.capture_jobs`. When no job is
-- available the function returns SQL NULL, which is correct - and PostgREST renders
-- it over the wire as {"id":null,"run_id":null,...}, which is an object.
--
-- So `if (!job) return;` in the caller sees a truthy value and proceeds to run a
-- capture against a job whose id is null. A skipped step that does not look skipped,
-- in the function written to stop skipped steps. Same shape as the confirmation email
-- gate, found before it could cost anything.
--
-- `returns setof` makes it unambiguous at the protocol level rather than relying on
-- every caller remembering to check .id: no work is an empty array, work is an array
-- of one. A return type cannot be changed in place, so both are dropped and recreated.
drop function if exists public.claim_capture_job(text, text[]);

create function public.claim_capture_job(
  p_worker_id text,
  p_methods   text[]
)
returns setof public.capture_jobs
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
        and (r.cost_ceiling_usd is null or r.cost_usd < r.cost_ceiling_usd)
      order by cj.next_attempt_at, cj.id
        for update of cj skip locked
      limit 1
   )
  returning * into j;

  if j.id is null then
    return;
  end if;

  update public.runs
     set status     = 'running',
         started_at = coalesce(started_at, now())
   where id = j.run_id
     and status = 'pending';

  return next j;
end;
$$;

drop function if exists public.settle_run(uuid);

create function public.settle_run(p_run_id uuid)
returns setof public.runs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r         public.runs;
  open_jobs integer;
  delivered integer;
  expected  integer;
begin
  select * into r from public.runs where id = p_run_id;
  if r.id is null or r.completed_at is not null then
    return;
  end if;

  select count(*) into open_jobs
    from public.capture_jobs
   where run_id = p_run_id
     and status in ('pending', 'running');

  if open_jobs > 0 then
    return;
  end if;

  -- The real question: how many captures does this subscriber actually have? Not
  -- "did every job return 200". A no_answer is a delivered observation - the surface
  -- was asked and showed nothing - so it counts here. Whether it counts in the Share
  -- of Model denominator is a different question, answered in lib/extract.ts.
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

  -- Nothing back means another sweeper settled it between the read above and this
  -- update. It did the work and it holds the alert claim, so this one says nothing.
  if r.id is null then
    return;
  end if;

  return next r;
end;
$$;

revoke all on function public.claim_capture_job(text, text[]) from public, anon, authenticated;
revoke all on function public.settle_run(uuid)                from public, anon, authenticated;
grant execute on function public.claim_capture_job(text, text[]) to service_role;
grant execute on function public.settle_run(uuid)                to service_role;
