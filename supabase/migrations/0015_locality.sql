-- 0015  A scope can be narrower than a country.
--
-- Prompted by local businesses, who were surprised the finest targeting on offer was
-- "country". On three of five surfaces a town is a real search parameter; on the other two
-- it reaches the answer only by being named in the question the subscriber approves. Both
-- are recorded and both are printed in the report, because they are different facts.
--
-- FOUR COLUMNS, NOT ONE, AND THAT IS THE POINT. `locality` is what the subscriber typed and
-- is what goes into their five questions. The other three are what SerpApi's locations
-- database matched it to, resolved once at approval. Storing only the free text would mean
-- guessing a canonical name at capture time, every month, from a string a person typed - and
-- a wrong guess files the capture under a town they never chose while the report says we
-- asked from theirs.
--
-- All four are nullable. A scope with no locality is a country scope and behaves exactly as
-- it did before. A locality that resolved to nothing keeps its text and leaves the other
-- three null, which is a real recorded state: the town is in the questions, Google is asked
-- at country level, and the method note says so.
--
-- Changing any of these on a scope that has runs is a comparability break, and it cannot
-- happen: assertScopeEditable() refuses the whole approval once a scope has been measured,
-- on the existence of runs rather than on a field diff, so a new field is covered the day it
-- is added without anybody remembering to add it to a list.

alter table public.scopes
  add column if not exists locality           text,
  add column if not exists locality_canonical text,
  add column if not exists locality_city      text,
  add column if not exists locality_region    text;

comment on column public.scopes.locality is
  'Free text, as the subscriber typed it. Interpolated into the five questions they approve.';
comment on column public.scopes.locality_canonical is
  'SerpApi canonical_name, e.g. "Geelong,Victoria,Australia". Null when nothing matched, which means Google is asked at country level.';
comment on column public.scopes.locality_city is
  'City part of the canonical name, sent to ChatGPT and Perplexity as user_location.city.';
comment on column public.scopes.locality_region is
  'Region part of the canonical name, sent to ChatGPT and Perplexity as user_location.region.';

-- The resolved fields are meaningless without the text they were resolved from, and a
-- canonical name with no city part never comes back from partsOf(). Both would be a bug
-- upstream rather than something to tolerate quietly.
alter table public.scopes
  drop constraint if exists scopes_locality_resolved_needs_text;
alter table public.scopes
  add constraint scopes_locality_resolved_needs_text
  check (locality_canonical is null or locality is not null);
