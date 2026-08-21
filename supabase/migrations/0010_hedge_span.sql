-- Word of Model — where the reason sits inside the sentence.
-- Run this in Supabase → SQL Editor, after 0009_hedge_reason.sql.
--
-- WHY A SECOND COLUMN RATHER THAN A SHORTER QUOTE.
--
-- Grok's sentence about Zapme is: "It's not as established as bigger eSIM players like
-- Airalo, but users who like the combo of data plans + persistent virtual numbers often
-- praise its value and convenience." The reason is the first clause. The rest is praise,
-- and under a heading about what is wrong it reads oddly.
--
-- The obvious fix is to store the clause instead of the sentence. That fix is worse than
-- the problem. A quote cut at the comma would have us printing "It's not as established as
-- bigger eSIM players like Airalo" under Grok's name, with the half that softens it removed
-- by us, in a report whose entire claim is that we hand back what the engines said. Every
-- competitor in this category is selectively quoting models; doing it once would make us
-- one of them, and the subscriber could not tell from the page.
--
-- So the whole sentence is printed and the reason clause is MARKED inside it. The eye lands
-- in the right place, the sentence stays complete, and the praise stays visible to anyone
-- reading properly. hedge_span is that clause, validated at extraction time as a substring
-- of hedge_quote and discarded when it is not one.

alter table public.captures add column if not exists hedge_span text;

-- A span is part of a quote or it is nothing. Length is bounded by the quote itself, but a
-- span shorter than a few words is not a clause and marking it would be noise.
alter table public.captures drop constraint if exists captures_hedge_span_check;
alter table public.captures add constraint captures_hedge_span_check
  check (
    hedge_span is null
    or (hedge_quote is not null and length(btrim(hedge_span)) between 8 and 600)
  );

comment on column public.captures.hedge_span is
  'The clause within hedge_quote that carries the reason, for marking inside the printed '
  'sentence. Validated as a substring of hedge_quote at extraction time. Null when the '
  'whole sentence is the reason, which is the common case and needs no mark.';
