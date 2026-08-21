-- Word of Model — the report as a stored, immutable fact.
-- Run this in Supabase → SQL Editor, after 0007_sampling.sql.
--
-- WHY A REPORT IS STORED RATHER THAN RENDERED ON DEMAND.
--
-- The diagnosis at the top of the report - presence, endorsement, and which of the five
-- states the subscriber is in - is produced by thresholds that are CHOSEN, not calculated.
-- There is no natural boundary in either number. At ten subscribers those lines get
-- revisited against a real distribution.
--
-- Rendered on demand, that revision would silently re-label every report ever sent. A
-- subscriber would open last March and find it saying something different from what they
-- read in March, with nothing to explain it. So the figures and the threshold_version that
-- produced them are written down once, and the page is rendered from the record.
--
-- Same discipline as captures.extraction_version, one level up: the interpretation is
-- versioned so a change to it is visible rather than retroactive.

create table if not exists public.reports (
  id                   uuid primary key default gen_random_uuid(),
  -- One report per run. Regenerating overwrites the render, never the history: a second
  -- report for the same run would mean two different answers to the same month.
  run_id               uuid not null unique references public.runs (id) on delete cascade,
  scope_id             uuid not null references public.scopes (id) on delete cascade,

  -- The two versions that decide what the numbers mean.
  threshold_version    integer not null,
  extraction_version   integer not null,

  -- Presence: Share of Model across the four unbranded questions. NULL is not zero - it
  -- means nothing was answered, and the report says so rather than printing 0%.
  presence             numeric(6, 4),
  presence_pairs       integer not null,

  -- Endorsement, always a count with its denominator. Five observations cannot carry a
  -- percentage: one engine changing its mind would swing a percentage twenty points with
  -- nothing real behind it.
  recognised           integer not null,
  endorsed             integer not null,
  asked_directly       integer not null,

  diagnosis            text not null,

  -- The delta, or null in month one. Carries what was compared AND what was suppressed
  -- with the reason, because a missing number that says why is honest and a missing number
  -- that says nothing is a bug the subscriber has to guess at.
  delta                jsonb,

  generated_at         timestamptz not null default now(),
  sent_at              timestamptz,

  constraint reports_diagnosis_check check (
    diagnosis in ('unknown', 'known_not_endorsed', 'endorsed_not_surfacing',
                  'surfacing_not_endorsed', 'established')
  ),
  constraint reports_counts_check check (
    endorsed <= asked_directly and recognised <= asked_directly and presence_pairs >= 0
  )
);

create index if not exists reports_scope_generated_idx
  on public.reports (scope_id, generated_at desc);

-- ------------------------------------------------------------------------- RLS
-- Read only, authenticated only, own account only, through the same function every policy
-- in 0002 uses. The report is the thing they are paying for, so they can read it; every
-- write is the server on the secret key.
alter table public.reports enable row level security;

drop policy if exists reports_select_own on public.reports;
create policy reports_select_own on public.reports
  for select to authenticated
  using (exists (
    select 1 from public.scopes s
     where s.id = reports.scope_id
       and s.account_id = public.current_account_id()
  ));

revoke all on table public.reports from anon;
revoke all on table public.reports from authenticated;
grant select on table public.reports to authenticated;

-- ---------------------------------------------------------------- housekeeping
-- reports.run_id cascades, so deleting a run takes its report with it. That is correct:
-- a report with no evidence behind it is not something to keep. The evidence itself
-- (captures) is what must never be deleted casually, and 0002 already restricts that.
