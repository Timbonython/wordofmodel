import 'server-only';
import { checkCompetitors, type ProposedCompetitor } from './competitors';
import { db } from './db';
import { askJsonSearched, askJson, askText } from './openai';
import { iso2 } from './domain';
import { competitorPrompt, questionsPrompt, rewriteSlotPrompt, SLOT_STRUCTURE } from './wizard-prompts';
import { QUESTION_SLOTS, type QuestionSlot, type AccountRow, type ScopeRow } from './accounts';

/**
 * The onboarding wizard: generation, and the writes into the scope model from
 * 0002.
 *
 * The load bearing rule of this whole session lives here. The questions are
 * written and approved BEFORE the card, and approveOnboarding() runs before any
 * Checkout Session exists. The obvious build is pay then configure. It is wrong
 * three times over: the wizard is the sell, the approval gate is the
 * differentiator and hiding it behind the paywall hides it from everyone who has
 * not bought, and you never take money for questions the generator could not
 * write. Do not invert it.
 */

export interface WizardProfile {
  brand_name: string;
  what_they_sell: string;
  buyer: string;
  /**
   * The market as prose, for the question generation prompts: "in United States" writes
   * a better question than "in US". DERIVED from market_country, never typed - see
   * parseProfile in lib/wizard-input.ts.
   */
  country: string;
  /**
   * ISO 3166-1 alpha-2, chosen from a closed list. Every geo parameter the pipeline sends
   * derives from this and nothing else, so it is the field that has to be right.
   */
  market_country: string;
  category_term: string;
  website: string;
}

export interface ProposedQuestion {
  slot: QuestionSlot;
  text: string;
}

// ------------------------------------------------------------- competitors

const COMPETITOR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['competitors', 'reasoning'],
  properties: {
    competitors: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'domain'],
        properties: { name: { type: 'string' }, domain: { type: 'string' } },
      },
    },
    reasoning: { type: 'string' },
  },
} as const;

/** What the wizard sends back: a name, and the domain that makes it checkable. */
export interface CompetitorInput {
  name: string;
  domain: string | null;
}

export const MIN_COMPETITORS = 3;
export const MAX_COMPETITORS = 6;

/**
 * Four proposed, 3 to 6 allowed. Free text with add and remove, not a locked
 * set: this screen routinely surfaces a competitor the customer did not know
 * they had, and it can only do that if they can argue with it.
 */
export async function proposeCompetitors(
  profile: WizardProfile,
): Promise<{ competitors: ProposedCompetitor[]; reasoning: string }> {
  const { competitors, reasoning } = await askJsonSearched<{
    competitors: Array<{ name: string; domain: string }>;
    reasoning: string;
  }>(
    competitorPrompt({
      brand_name: profile.brand_name,
      what_they_sell: profile.what_they_sell || profile.category_term,
      country: profile.country,
    }),
    'competitors',
    COMPETITOR_SCHEMA,
    iso2(profile.country),
  );

  // Three layers, in order of cost. Dedupe and drop the subscriber's own brand; then the
  // deterministic category test, which needs no network call; then ask the web whether the
  // domains resolve. Nothing is dropped for a concern - the subscriber is shown and decides.
  const cleaned = cleanCompetitors(competitors, profile.brand_name);
  const checked = await checkCompetitors(cleaned, {
    category_term: profile.category_term,
    what_they_sell: profile.what_they_sell,
  });
  return { competitors: checked, reasoning };
}

/**
 * The model is told not to return the brand and sometimes does anyway. A
 * customer reading themselves in their own competitor list stops trusting the
 * screen, and the alternatives question would then be built against them.
 */
export function cleanCompetitors(
  proposed: Array<{ name?: string; domain?: string | null }>,
  brandName: string,
): Array<{ name: string; domain: string | null }> {
  const brand = brandName.trim().toLowerCase();
  const seen = new Set<string>();
  const out: Array<{ name: string; domain: string | null }> = [];
  for (const raw of proposed) {
    const name = (raw?.name ?? '').trim().replace(/\s+/g, ' ');
    if (!name || name.length > 80) continue;
    const key = name.toLowerCase();
    if (key === brand || seen.has(key)) continue;
    seen.add(key);
    out.push({ name, domain: (raw?.domain ?? '').trim() || null });
    if (out.length >= MAX_COMPETITORS) break;
  }
  return out;
}

// --------------------------------------------------------------- questions

const QUESTIONS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['questions'],
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['slot', 'text'],
        properties: { slot: { type: 'integer' }, text: { type: 'string' } },
      },
    },
  },
} as const;

/**
 * The spec's prompt numbers the slots 1 to 5 and the schema names them. This is
 * the join, and it is the order the slots are in in the prompt. Slot 5 is the
 * control: nearly always 100%, never counted in the unbranded score, and the gap
 * between it and the other four is the headline finding in every report.
 */
const SLOT_BY_NUMBER: Record<number, QuestionSlot> = {
  1: 'category',
  2: 'situation',
  3: 'alternatives',
  4: 'how_do_people',
  5: 'branded',
};

export async function proposeQuestions(
  profile: WizardProfile,
  competitors: CompetitorInput[],
): Promise<ProposedQuestion[]> {
  const largest = competitors[0]?.name;
  if (!largest) throw new Error('Confirm the competitors before writing the questions.');

  const { questions } = await askJson<{ questions: Array<{ slot: number; text: string }> }>(
    questionsPrompt({
      what_they_sell: profile.what_they_sell || profile.category_term,
      country: profile.country,
      category_term: profile.category_term,
      buyer: profile.buyer,
      brand_name: profile.brand_name,
      largest_competitor: largest,
    }),
    'questions',
    QUESTIONS_SCHEMA,
  );

  const bySlot = new Map<QuestionSlot, string>();
  for (const q of questions) {
    const slot = SLOT_BY_NUMBER[q.slot];
    const text = tidyQuestion(q.text);
    if (slot && text && !bySlot.has(slot)) bySlot.set(slot, text);
  }

  const missing = QUESTION_SLOTS.filter((s) => !bySlot.get(s));
  if (missing.length) {
    throw new Error(`The question writer skipped ${missing.join(', ')}. Try again.`);
  }

  return QUESTION_SLOTS.map((slot) => ({ slot, text: bySlot.get(slot) as string }));
}

/** Regenerates one slot and leaves the other four alone. */
export async function rewriteQuestion(input: {
  slot: QuestionSlot;
  current: string;
  others: ProposedQuestion[];
  profile: WizardProfile;
  competitors: CompetitorInput[];
}): Promise<string> {
  const vars: Record<string, string> = {
    category_term: input.profile.category_term,
    country: input.profile.country,
    buyer: input.profile.buyer,
    brand_name: input.profile.brand_name,
    largest_competitor: input.competitors[0]?.name ?? input.profile.category_term,
  };

  const text = await askText(
    rewriteSlotPrompt({
      slot: input.slot,
      instruction: SLOT_STRUCTURE[input.slot](vars),
      current: input.current,
      others: input.others.map((q) => q.text),
      what_they_sell: input.profile.what_they_sell || input.profile.category_term,
      country: input.profile.country,
      brand_name: input.profile.brand_name,
    }),
  );

  const tidied = tidyQuestion(text);
  if (!tidied) throw new Error('Could not rewrite that one. Try again in a moment.');
  return tidied;
}

export function tidyQuestion(raw: string): string {
  return (raw ?? '')
    .trim()
    .replace(/^question:\s*/i, '')
    .replace(/^\d[\.\)]\s*/, '')
    .replace(/^(CATEGORY|SITUATION|ALTERNATIVES|HOW-DO-PEOPLE|BRANDED):\s*/i, '')
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .replace(/\s+/g, ' ')
    // The generator reliably ends a question "?." Keep the first mark and drop
    // the rest. These five are read aloud by the customer on the approval screen
    // and the whole screen asks them to believe a person would type this.
    .replace(/([.?!])[.?!\s]+$/, '$1')
    .trim()
    .slice(0, 320);
}

// ------------------------------------------------------------------ writes

export interface ApprovedOnboarding {
  account: AccountRow;
  scope: ScopeRow;
}

/**
 * Everything the wizard collected, written in one go at the moment of approval,
 * before payment.
 *
 * An account and a scope with no subscription against it is a lead, not a
 * subscriber. Nothing reads a scope without checking subscriptions, so this is
 * safe to leave standing when somebody abandons at the card.
 */
export async function approveOnboarding(input: {
  email: string;
  profile: WizardProfile;
  competitors: CompetitorInput[];
  questions: ProposedQuestion[];
}): Promise<ApprovedOnboarding> {
  const email = input.email.trim().toLowerCase();

  // Upsert rather than insert: someone who abandoned at the card and came back
  // an hour later is the same account, and accounts.email is unique.
  const { data: accountData, error: accountError } = await db()
    .from('accounts')
    .upsert({ email }, { onConflict: 'email' })
    .select('*')
    .single();
  if (accountError || !accountData) {
    throw new Error(`Could not open an account: ${accountError?.message}`);
  }
  const account = accountData as AccountRow;

  const scope = await upsertScope(account.id, input.profile);
  await writeCompetitors(scope.id, input.competitors);
  await writeQuestions(scope.id, input.questions);

  return { account, scope };
}

/**
 * One scope per account for a solo subscriber. Reusing it on a second pass
 * through the wizard is what keeps a person who came back from ending up with
 * two scopes and a report against the wrong one.
 *
 * A scope that already has runs is not touched. Once a report has been produced
 * the questions are locked, and rewriting the scope underneath a trend line
 * would silently break the comparison the whole product rests on.
 */
async function upsertScope(accountId: string, profile: WizardProfile): Promise<ScopeRow> {
  const fields = {
    account_id: accountId,
    category: profile.category_term,
    market: profile.country,
    market_country: profile.market_country,
    buyer: profile.buyer,
    brand_name: profile.brand_name,
    what_they_sell: profile.what_they_sell,
    website: profile.website,
  };

  const { data: existing, error: findError } = await db()
    .from('scopes')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: true })
    .limit(1);
  if (findError) throw new Error(`Scope lookup failed: ${findError.message}`);

  const current = (existing?.[0] as ScopeRow | undefined) ?? null;
  if (current) {
    const { count, error: runError } = await db()
      .from('runs')
      .select('id', { count: 'exact', head: true })
      .eq('scope_id', current.id);
    if (runError) throw new Error(`Scope lookup failed: ${runError.message}`);
    if (count && count > 0) return current;

    const { data, error } = await db()
      .from('scopes')
      .update(fields)
      .eq('id', current.id)
      .select('*')
      .single();
    if (error || !data) throw new Error(`Could not save the profile: ${error?.message}`);
    return data as ScopeRow;
  }

  const { data, error } = await db().from('scopes').insert(fields).select('*').single();
  if (error || !data) throw new Error(`Could not save the profile: ${error?.message}`);
  return data as ScopeRow;
}

/**
 * Competitor membership is a timeline, not a list. A competitor the subscriber
 * drops later is marked removed rather than deleted, so delta reporting can tell
 * a configuration change from a market change. During onboarding there is no
 * history yet, so the live set is simply replaced.
 */
async function writeCompetitors(scopeId: string, input: CompetitorInput[]): Promise<void> {
  const now = new Date().toISOString();
  const wanted = input
    .map((c) => ({ name: c.name.trim(), domain: c.domain?.trim() || null }))
    .filter((c) => c.name);

  const { data: current, error } = await db()
    .from('competitors')
    .select('id, name')
    .eq('scope_id', scopeId)
    .is('removed_at', null);
  if (error) throw new Error(`Could not read the competitors: ${error.message}`);

  const live = (current ?? []) as Array<{ id: string; name: string }>;
  const wantedKeys = new Set(wanted.map((c) => c.name.toLowerCase()));
  const liveKeys = new Set(live.map((c) => c.name.toLowerCase()));

  const goneIds = live.filter((c) => !wantedKeys.has(c.name.toLowerCase())).map((c) => c.id);
  if (goneIds.length) {
    const { error: removeError } = await db()
      .from('competitors')
      .update({ removed_at: now })
      .in('id', goneIds);
    if (removeError) throw new Error(`Could not save the competitors: ${removeError.message}`);
  }

  const added = wanted.filter((c) => !liveKeys.has(c.name.toLowerCase()));
  if (added.length) {
    const { error: addError } = await db()
      .from('competitors')
      // domain has existed unused since 0002. It is what makes a competitor checkable
      // against the real web rather than a string somebody typed.
      .insert(
        added.map((c) => ({ scope_id: scopeId, name: c.name, domain: c.domain, source: 'proposed' })),
      );
    if (addError) throw new Error(`Could not save the competitors: ${addError.message}`);
  }
}

/**
 * approved_at is set here, at the moment they approve, which is before the card.
 * That timestamp is the record that the approval gate was honoured, and it is
 * the thing to point at if a subscriber ever asks who chose their questions.
 *
 * Upsert on (scope_id, slot), the unique key from 0002. Changing a question
 * after captures exist means a new row rather than an edit, but no captures can
 * exist yet: a scope with runs is returned untouched by upsertScope above.
 */
async function writeQuestions(scopeId: string, questions: ProposedQuestion[]): Promise<void> {
  const approvedAt = new Date().toISOString();
  const { error } = await db()
    .from('questions')
    .upsert(
      questions.map((q) => ({
        scope_id: scopeId,
        slot: q.slot,
        text: q.text,
        approved_at: approvedAt,
      })),
      { onConflict: 'scope_id,slot' },
    );
  if (error) throw new Error(`Could not save the questions: ${error.message}`);
}

export async function getScope(scopeId: string): Promise<ScopeRow | null> {
  const { data, error } = await db().from('scopes').select('*').eq('id', scopeId).limit(1);
  if (error) throw new Error(`Scope lookup failed: ${error.message}`);
  return (data?.[0] as ScopeRow | undefined) ?? null;
}
