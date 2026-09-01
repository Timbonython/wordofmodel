-- What the alert actually said. Run in Supabase -> SQL Editor, after 0023_reviews.sql.
--
-- WHY. On 30 and 31 Aug 2026 three alerts fired reading "Founding count unavailable - the offer
-- is being withheld from every visitor". The guard worked: the count could not be read, the
-- founding block did not render, and every visitor was correctly shown the standard rate rather
-- than being handed a discount nobody was counting.
--
-- But the REASON existed in exactly two places, and neither survives: an email in one inbox, and
-- a console line in a Vercel runtime log that the CLI does not return and that rotates. The body
-- carries `Reason: ${message}` and ops_alerts stored the subject, the recipient and whether
-- Resend accepted it - so the table could prove an alert was raised and delivered while saying
-- nothing about what was wrong.
--
-- This build has a rule for that shape: RECORD THE OUTCOME OF ANYTHING ALLOWED TO FAIL QUIETLY.
-- ops_alerts was written to that rule for DELIVERY and stopped short of the fault itself, which
-- is how an intermittent failure gets investigated three times from scratch.
--
-- Nullable and additive. Every row before this has no detail, which is correct - none was kept.
alter table public.ops_alerts add column if not exists detail text;

comment on column public.ops_alerts.detail is
  'The alert body, so the reason survives the email. Alerts before 0024 have none: the text '
  'existed only in an inbox and a rotating runtime log.';
