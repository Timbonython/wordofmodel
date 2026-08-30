-- Reviews. Run in Supabase -> SQL Editor, after 0022_scope_locations.sql.
--
-- FIRST PARTY, AND STORED BEFORE ANY THIRD PARTY IS OFFERED. A reviewer writes once, here, and
-- the row is saved before the page ever mentions Google or Trustpilot. The external hand-off is
-- downstream and optional; somebody who abandons it has still left a testimonial. Nothing in
-- this build depends on a third party having accepted anything.
--
-- WHAT IS DELIBERATELY NOT COLLECTED. No surname, no job title, no company, no company URL, no
-- LinkedIn, no photograph. Decided 30 Aug 2026, and not only for brevity: the subject matter is
-- unflattering to the reviewer. "I found out I was invisible on ChatGPT" is not a sentence a
-- business wants its name attached to, and full attribution would suppress the honest reviews
-- and select for the bland ones. First name, category and town will get more of them and
-- franker ones.
--
-- The cost is accepted with open eyes: unverifiable authorship is weak social proof to a
-- sceptical reader and a weak signal to a search engine. See the schema note in lib/reviews.ts
-- for why this build does not chase Google rich results anyway.
--
-- `category` and `location` are the PRODUCT'S OWN VOCABULARY - they are what a scope is made of
-- (scopes.category_term and scopes.locality) - so a subscriber's can be prefilled from theirs.

create table if not exists public.reviews (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  rating        smallint not null,
  review_text   text     not null,

  -- First name as typed. Not unique, not verified, and not pretending to be.
  first_name    text     not null,
  -- Their town and what they sell, in their words. Both optional: a country level subscriber
  -- has no town, and somebody may not want to name their category either.
  location      text,
  category      text,

  /*
   * CONSENT IS A CONSTRAINT, NOT A COLUMN TO READ LATER.
   *
   * A review that may not be published is not a review, it is personal data with no purpose,
   * and the honest thing is to refuse to store it at all. The form requires the box; this
   * makes a row without it impossible even from a script, which is the version of the rule
   * that holds when somebody writes a second caller in six months.
   */
  consent_to_publish boolean not null default false,

  status        text not null default 'pending',
  featured      boolean not null default false,
  display_order integer,
  published_at  timestamptz,

  -- 'invited' when it came from a report email, 'unsolicited' when somebody found /review.
  -- Worth separating: they are different populations and will not read the same.
  source        text not null default 'unsolicited',

  /*
   * WHICH PLATFORMS THEY CLICKED THROUGH TO. Never "posted".
   *
   * No platform tells us whether a review was actually left, so a column called
   * external_posted would be a confident wrong number of exactly the kind this build keeps
   * finding. Shape: {"google": "2026-08-30T...", "trustpilot": "..."}.
   */
  external_clicks jsonb not null default '{}'::jsonb,

  -- Ours, never rendered. Why it was rejected, or what was fixed.
  admin_note    text,

  constraint reviews_rating_check  check (rating between 1 and 5),
  constraint reviews_status_check  check (status in ('pending', 'approved', 'rejected')),
  constraint reviews_consent_check check (consent_to_publish),
  constraint reviews_text_check    check (char_length(btrim(review_text)) between 10 and 2000),
  constraint reviews_name_check    check (char_length(btrim(first_name)) between 1 and 60),
  -- An approved review must carry the date it went live, and a pending one must not pretend to.
  constraint reviews_published_check check (
    (status = 'approved' and published_at is not null)
    or (status <> 'approved' and published_at is null)
  )
);

-- The public read: approved only, featured first, then display_order, then newest.
create index if not exists reviews_public_idx
  on public.reviews (status, featured desc, display_order nulls last, published_at desc)
  where status = 'approved';

-- The moderation queue.
create index if not exists reviews_pending_idx
  on public.reviews (created_at desc) where status = 'pending';

/*
 * RLS ON, NO POLICIES AT ALL. The same shape as capture_jobs.
 *
 * The brief asked for anonymous inserts. Doing that through PostgREST means shipping a
 * publishable key to the browser and trusting client-side validation, and NOTHING in this build
 * talks to Supabase from a browser - that is a decision from Session 1 and it is worth more
 * than the convenience. Submission goes through POST /api/review on the secret key, which is
 * where the rate limit, the honeypot and the consent check already have to live anyway.
 *
 * The consequence that matters: an unapproved review cannot leak, because there is no key in
 * existence outside the server that can read this table at all.
 */
alter table public.reviews enable row level security;
revoke all on table public.reviews from anon;
revoke all on table public.reviews from authenticated;

comment on table public.reviews is
  'First-party reviews. Written on /review, stored before any third-party platform is offered, '
  'and published only by an explicit moderation step. RLS on with no policies: every read and '
  'write is the server on the secret key.';

-- ------------------------------------------------------- the funnel learns four new events
--
-- A closed set, widened deliberately. external_review_clicked records the CLICK, which is all
-- anybody can know: see external_clicks above.
alter table public.funnel_events drop constraint if exists funnel_events_event_check;

alter table public.funnel_events add constraint funnel_events_event_check check (event in (
  'landed', 'scan_started', 'scan_completed', 'wizard_started', 'checkout_started',
  'subscription_active',
  'review_form_view', 'review_form_started', 'review_submitted', 'external_review_clicked'
));

-- ------------------------------------------------------------------ where a click went
--
-- WHICH PLATFORM, on external_review_clicked. Deliberately a new column rather than reusing
-- utm_content: that one is ad attribution, it is what separates hook A from hook C in every
-- report we run, and writing a platform name into it would corrupt the one measurement this
-- table was rebuilt to make trustworthy.
--
-- Nullable and generic. Every event that existed before this migration has no detail and that
-- is correct - they never had one.
alter table public.funnel_events add column if not exists detail text;

comment on column public.funnel_events.detail is
  'Free-text qualifier for events that need one. Today: the platform on '
  'external_review_clicked. Never attribution - that is what the utm columns are for.';
