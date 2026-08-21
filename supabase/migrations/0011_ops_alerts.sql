-- Word of Model — did the last alert actually land?
-- Run this in Supabase → SQL Editor, after 0010_hedge_span.sql.
--
-- sendOpsAlert never throws, and that is right: an alert that takes down the handler it is
-- reporting from turns one silent failure into two loud ones. But it also never RECORDED
-- anything, which meant a swallowed exception was indistinguishable from a delivered alert.
--
-- That is not theoretical. hello@wordofmodel.ai, which is ALERT_EMAIL and the reply-to on
-- every subscriber email, bounced 550 5.1.1 three times on 17 Aug 2026 - Cloudflare's own
-- MX rejecting an address with no routing rule behind it. It works now. But every alert
-- watched firing during Session 4 and called verified would have looked exactly the same
-- from inside the code if the address had still been dead: Resend accepts the send, the
-- 550 arrives later, and the console line scrolls past in a serverless log nobody reads.
--
-- So the alert path writes down what it attempted. A row per alert, with the provider's
-- message id when there is one, so "did anybody hear about that" is a query rather than a
-- belief - and so the id can be handed back to Resend later for the delivery event, which
-- is the only thing that actually answers the question. See scripts/alerts-check.mjs.
--
-- ACCEPTED IS NOT DELIVERED, and the status column says which one it means:
--   sent        Resend accepted it. Nothing here proves it arrived.
--   failed      Resend refused it, or the call threw. Nobody was told.
--   no_address  ALERT_EMAIL is not set. The console line was the whole alert.

create table if not exists public.ops_alerts (
  id                  uuid primary key default gen_random_uuid(),
  subject             text not null,
  status              text not null,
  -- Resend's id, for asking it later whether the thing was delivered or bounced.
  provider_message_id text,
  -- Why it failed, when it did. Null on the happy path.
  error               text,
  recipient           text,
  created_at          timestamptz not null default now(),

  constraint ops_alerts_status_check check (status in ('sent', 'failed', 'no_address'))
);

create index if not exists ops_alerts_created_idx on public.ops_alerts (created_at desc);

-- RLS on, no policy at all, nothing granted. This is operational plumbing, not subscriber
-- data: the same treatment capture_jobs gets in 0006. The server reads and writes it on the
-- secret key, which bypasses RLS, and nothing else can touch it.
alter table public.ops_alerts enable row level security;
revoke all on table public.ops_alerts from anon;
revoke all on table public.ops_alerts from authenticated;

comment on table public.ops_alerts is
  'One row per ops alert attempt. status=sent means Resend accepted it, never that it was '
  'delivered; provider_message_id is how you find out which. Exists because a swallowed '
  'alert and a delivered alert used to look identical from inside the code.';
