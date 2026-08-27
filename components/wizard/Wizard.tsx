'use client';

import { useState } from 'react';
import { SLOT_LABEL, QUESTION_SLOTS, priceLabel, type QuestionSlot } from '@/lib/scope';
import { MARKET_OPTIONS, isSupportedMarket } from '@/lib/geo';
import { categoryConcern, type CompetitorConcern } from '@/lib/competitor-check';
import { iso2 } from '@/lib/domain';
import { metaTrack } from '@/components/MetaPixel';

/**
 * The onboarding wizard.
 *
 * Confirm the business, confirm the competitors, approve the five questions,
 * then pay. That order is deliberate and is the one thing in this flow that must
 * not be inverted: the approval is the sell, and it happens before the card.
 *
 * State lives here rather than on the server between steps. Nothing is written
 * until they approve, so an abandoned wizard leaves no half configured account
 * behind, and the server re-validates the whole payload at the point it does get
 * written.
 */

export interface WizardProfileInput {
  brand_name: string;
  what_they_sell: string;
  buyer: string;
  /** ISO 3166-1 alpha-2, chosen from a closed list. The prose form is derived server side. */
  market_country: string;
  /**
   * Optional, below country level, free text. Empty string means a country scope.
   *
   * Deliberately not a cascading state / county dropdown. That is a data problem with no
   * end and it forces an opinion about every country's administrative subdivisions. This
   * box is checked by the subscriber reading their own town inside the five questions on
   * the next screen but one.
   */
  locality: string;
  category_term: string;
  website: string;
}

/**
 * Default when we cannot read a country off the site, or read one we cannot measure.
 *
 * US because the build plan says US first, Australia second - not because of where Tim
 * sits. It is a starting point in a field the subscriber then confirms, exactly like
 * every other field on this screen.
 */
const DEFAULT_MARKET = 'US';

/** A country name from the detector to a market we can actually build parameters for. */
function resolveMarket(name: string | null): string {
  const code = iso2(name);
  return code && isSupportedMarket(code) ? code : DEFAULT_MARKET;
}

interface Question {
  slot: QuestionSlot;
  text: string;
}

/**
 * A competitor carries its domain, and whatever we think is wrong with it.
 *
 * The domain is not decoration: it is what makes a proposed competitor checkable against
 * the real web instead of a string somebody produced. The first subscriber's set contained
 * "GlobaleSIM" - their own category with the spaces removed - sitting next to Airalo
 * looking like a peer.
 */
interface CompetitorRow {
  name: string;
  domain: string | null;
  concern: CompetitorConcern | null;
}

type Step = 'business' | 'competitors' | 'questions' | 'pay';

const STEP_ORDER: Step[] = ['business', 'competitors', 'questions', 'pay'];

const STEP_LABEL: Record<Step, string> = {
  business: 'The business',
  competitors: 'The competitors',
  questions: 'The questions',
  pay: 'Payment',
};

const EMPTY: WizardProfileInput = {
  brand_name: '',
  what_they_sell: '',
  buyer: '',
  market_country: DEFAULT_MARKET,
  locality: '',
  category_term: '',
  website: '',
};

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(json.error || 'Something went wrong. Try again.');
  return json;
}

export default function Wizard({
  prefill,
  prefillEmail,
  foundingRemaining,
  scanId,
}: {
  prefill: WizardProfileInput | null;
  prefillEmail: string | null;
  foundingRemaining: number | null;
  /** Carried into the Checkout session so a paying customer traces back to the ad. */
  scanId: string | null;
}) {
  // NO Meta event fires here any more. Reaching the wizard is still recorded, server side, as
  // wizard_started in app/start/page.tsx - the drop-off between a scan and a card is exactly
  // what that step is for, and it is unaffected by this.
  //
  // What moved on 27 Aug 2026 is the Lead, to the reveal in components/scan/ScanResult.tsx.
  // On mount it was ungated: no scan, no email, no state of any kind, just "this component
  // rendered". Every reload and every client-side return re-fired it, nothing carried an
  // eventID so Meta could not deduplicate, and next/link prefetch of a force-dynamic /start
  // meant the page rendered for people who never clicked. A campaign optimising against that
  // is learning from page renders.

  const [step, setStep] = useState<Step>('business');
  const [domain, setDomain] = useState(prefill?.website ?? '');
  const [unsupportedMarket, setUnsupportedMarket] = useState<string | null>(null);
  const [marketGuessed, setMarketGuessed] = useState(false);

  /** Named competitors only, with whatever domain we have for each. */
  const liveCompetitors = () =>
    competitors.filter((c) => c.name.trim()).map((c) => ({ name: c.name.trim(), domain: c.domain }));

  /**
   * Re-check as they type. A competitor the subscriber replaces by hand gets the same
   * category warning a proposed one gets - the check is deterministic and needs no call,
   * so there is no reason to only apply it to our own suggestions.
   */
  const setCompetitorName = (i: number, value: string) =>
    setCompetitors((rows) =>
      rows.map((row, j) =>
        j === i
          ? {
              name: value,
              // Their own text, so our proposed domain no longer describes it.
              domain: value.trim() === row.name.trim() ? row.domain : null,
              concern: value.trim()
                ? categoryConcern(value, profile.category_term, profile.what_they_sell)
                : null,
            }
          : row,
      ),
    );
  const [detected, setDetected] = useState(Boolean(prefill));
  const [profile, setProfile] = useState<WizardProfileInput>(prefill ?? EMPTY);
  /**
   * What the locality box resolved to, checked on blur rather than on every keystroke.
   *
   * Said here rather than only in the report, because the report arrives after the card.
   * Two of the three examples in the field hint do not exist in Google's location list, so
   * the ordinary case is a person typing something reasonable that resolves to nothing, and
   * they should find that out while they can still change it.
   */
  const [localityStatement, setLocalityStatement] = useState<string | null>(null);

  async function checkLocality() {
    const typed = profile.locality.trim();
    if (!typed) {
      setLocalityStatement(null);
      return;
    }
    try {
      const out = await post<{ statement: string | null }>('/api/wizard/locality', {
        locality: typed,
        market_country: profile.market_country,
      });
      setLocalityStatement(out.statement);
    } catch {
      // A failed lookup is not a reason to block the wizard. The static note below still
      // explains what a locality does, approval still works, and resolveLocality runs again
      // server side at approval, which is the read that counts.
      setLocalityStatement(null);
    }
  }
  const [competitors, setCompetitors] = useState<CompetitorRow[]>([]);
  const [reasoning, setReasoning] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [email, setEmail] = useState(prefillEmail ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * A validated cohort code, and the price that comes with it.
   *
   * ONE READ DECIDES THE NUMBER ON THIS SCREEN AND THE NUMBER STRIPE CHARGES. The code is
   * checked server side, the price shown here is the price that check returned, and
   * createCheckout re-validates the same code and builds the session from it. The version
   * of this where Stripe's own page collects the code means the page says 249 and the
   * invoice says 49, which is the failure checkout:check exists to make impossible.
   */
  const [discountInput, setDiscountInput] = useState('');
  const [discount, setDiscount] = useState<{ code: string; priceUsd: number; line: string } | null>(null);
  const [discountError, setDiscountError] = useState<string | null>(null);

  const founding = foundingRemaining !== null && foundingRemaining > 0;
  // Formatted from the same constants Stripe charges, never typed. The two literals that
  // used to be here were the fourth and fifth copies of a number that lives in lib/stripe.ts.
  const listPrice = founding ? priceLabel('founding_monthly') : priceLabel('standard_monthly');
  const price = discount ? `USD ${discount.priceUsd}` : listPrice;

  const applyDiscount = () =>
    run('Checking your code', async () => {
      setDiscountError(null);
      const typed = discountInput.trim();
      if (!typed) {
        setDiscount(null);
        return;
      }
      try {
        const out = await post<{ code: string; priceUsd: number; line: string }>(
          '/api/wizard/discount',
          { code: typed },
        );
        setDiscount(out);
      } catch (err) {
        // Never silently to full price and never silently to a discount. The customer is
        // told which one they are on before the button says what it will charge.
        setDiscount(null);
        setDiscountError(err instanceof Error ? err.message : 'We could not check that code.');
      }
    });

  function set<K extends keyof WizardProfileInput>(key: K, value: WizardProfileInput[K]) {
    setProfile((p) => ({ ...p, [key]: value }));
  }

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(null);
    }
  }

  const detect = () =>
    run('Reading your site', async () => {
      // The detector's shape is NOT WizardProfileInput: it returns `country` as a name
      // read off the site ("Australia"), where the wizard holds an ISO code. Typing it as
      // a Partial<WizardProfileInput> hid that difference and is what let a country name
      // flow into a field that is not one.
      const out = await post<{
        domain: string;
        profile: {
          brand_name?: string | null;
          what_they_sell?: string | null;
          buyer?: string | null;
          country?: string | null;
          category_term?: string | null;
        };
      }>('/api/wizard/detect', { domain });
      setProfile({
        brand_name: out.profile.brand_name ?? '',
        what_they_sell: out.profile.what_they_sell ?? '',
        buyer: out.profile.buyer ?? '',
        market_country: resolveMarket(out.profile.country ?? null),
        // Never guessed from the site. A town read off a footer is a town nobody chose,
        // and it would arrive already interpolated into five questions.
        locality: '',
        category_term: out.profile.category_term ?? '',
        website: out.domain,
      });
      // If we read a country off the site and cannot measure it, SAY SO. Quietly
      // defaulting a Brazilian business to the United States is the same bug the closed
      // list was added to prevent - a market nobody chose, invisible in the result.
      const read = out.profile.country ?? null;
      const code = iso2(read);
      setUnsupportedMarket(read && (!code || !isSupportedMarket(code)) ? read : null);
      // WE DID NOT READ A COUNTRY, so the selector below is showing a default and not a
      // finding. Every other field on this screen is either something we read or visibly
      // blank; the market alone arrives pre-filled and looks exactly as confident as the
      // ones we actually detected. Zapme was walked through on 20 Aug 2026 with the
      // default still selected, and its five questions all named the United States for a
      // business whose market is Australia - a country nobody chose, invisible afterwards
      // except in the questions.
      setMarketGuessed(!read);
      setDetected(true);
    });

  const toCompetitors = () =>
    run('Working out who you are up against', async () => {
      const out = await post<{ competitors: CompetitorRow[]; reasoning: string }>(
        '/api/wizard/competitors',
        { profile },
      );
      setCompetitors(
        out.competitors.length
          ? out.competitors
          : Array.from({ length: 4 }, () => ({ name: '', domain: null, concern: null })),
      );
      setReasoning(out.reasoning || null);
      setStep('competitors');
    });

  const toQuestions = () =>
    run('Writing your five questions', async () => {
      const out = await post<{ questions: Question[] }>('/api/wizard/questions', {
        profile,
        competitors: liveCompetitors(),
      });
      setQuestions(out.questions);
      setStep('questions');
    });

  const rewrite = (slot: QuestionSlot) =>
    run(`Rewriting the ${SLOT_LABEL[slot].toLowerCase()}`, async () => {
      const out = await post<{ slot: QuestionSlot; text: string }>('/api/wizard/rewrite', {
        slot,
        profile,
        competitors: liveCompetitors(),
        questions,
      });
      setQuestions((qs) => qs.map((q) => (q.slot === slot ? { ...q, text: out.text } : q)));
    });

  const pay = () =>
    run('Opening the payment page', async () => {
      metaTrack('InitiateCheckout');
      const out = await post<{ url: string }>('/api/wizard/checkout', {
        email,
        profile,
        competitors: liveCompetitors(),
        questions,
        scanId,
        // The validated code, not the raw box. If it stopped being valid in between, the
        // route says so rather than opening a session at a price nobody was shown.
        discountCode: discount?.code ?? null,
      });
      window.location.href = out.url;
    });

  const stepIndex = STEP_ORDER.indexOf(step);

  return (
    <div className="wizard">
      <ol className="wizard-nav" aria-label="Progress">
        {STEP_ORDER.map((s, i) => (
          <li key={s} className={i === stepIndex ? 'here' : i < stepIndex ? 'done' : ''}>
            <span className="n">{i + 1}</span>
            {STEP_LABEL[s]}
          </li>
        ))}
      </ol>

      {step === 'business' && (
        <section className="wizard-step">
          <h2>First, let&apos;s make sure we&apos;ve got you right</h2>
          <p className="lede">
            We read your website. Correct anything we got wrong. This is what the questions get
            built from.
          </p>

          {!detected && (
            <div className="inline-form" style={{ marginBottom: 28 }}>
              <input
                className="field"
                type="text"
                inputMode="url"
                placeholder="yourcompany.com"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && domain.trim() && !busy) detect();
                }}
                disabled={Boolean(busy)}
              />
              <button className="button" onClick={detect} disabled={!domain.trim() || Boolean(busy)}>
                {busy ? 'Reading' : 'Read my site'}
              </button>
            </div>
          )}

          {detected && (
            <>
              <div className="wizard-fields">
                <Field label="Brand name" value={profile.brand_name} onChange={(v) => set('brand_name', v)} />
                <Field
                  label="What you sell"
                  hint="One line, the way a customer would say it"
                  value={profile.what_they_sell}
                  onChange={(v) => set('what_they_sell', v)}
                />
                <Field label="Who buys it" value={profile.buyer} onChange={(v) => set('buyer', v)} />
                <label className="wizard-field">
                  <span className="k">Where your buyers are</span>
                  <span className="h">
                    The answers genuinely differ by country, and this is what we ask each
                    assistant from
                  </span>
                  <select
                    className="field"
                    value={profile.market_country}
                    onChange={(e) => set('market_country', e.target.value)}
                  >
                    {MARKET_OPTIONS.map((m) => (
                      <option key={m.code} value={m.code}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  {marketGuessed && !unsupportedMarket && (
                    <span className="h note-warn">
                      We couldn&apos;t read a country off your site, so this is a guess.
                      Check it: it decides which market every answer is measured in.
                    </span>
                  )}
                  {unsupportedMarket && (
                    <span className="h note-warn">
                      We read your market as {unsupportedMarket}, which we don&apos;t cover
                      yet. Pick the closest one, or email hello@wordofmodel.ai and
                      we&apos;ll add it before your first report.
                    </span>
                  )}
                </label>
                <label className="wizard-field">
                  <span className="k">Anywhere more specific?</span>
                  <span className="h">
                    Optional. A town or a city works best: Geelong, Coventry, Sacramento
                  </span>
                  <input
                    className="field"
                    value={profile.locality}
                    onChange={(e) => {
                      set('locality', e.target.value);
                      setLocalityStatement(null);
                    }}
                    onBlur={checkLocality}
                  />
                </label>
                {localityStatement && <p className="wizard-note">{localityStatement}</p>}
                {profile.locality.trim() && (
                  <p className="wizard-note">
                    We will put {profile.locality.trim()} into your five questions, so you
                    will see exactly how it reads before anything runs. Three of the five
                    assistants also take a location directly and will be searched from
                    there. Grok and Gemini accept no location at all, so for those two your
                    town reaches the answer through the question and nothing else. Your
                    report says which is which, every month.
                  </p>
                )}
                <Field
                  label="Category"
                  hint="The phrase a buyer would search"
                  value={profile.category_term}
                  onChange={(v) => set('category_term', v)}
                />
                <Field label="Website" value={profile.website} onChange={(v) => set('website', v)} />
              </div>
              <div className="wizard-actions">
                <button
                  className="button"
                  onClick={toCompetitors}
                  disabled={
                    Boolean(busy) ||
                    !profile.brand_name.trim() ||
                    !profile.category_term.trim() ||
                    !profile.market_country
                  }
                >
                  {busy ?? 'Next: who we measure you against'}
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {step === 'competitors' && (
        <section className="wizard-step">
          <h2>Who are we measuring you against?</h2>
          <p className="lede">
            These are the four we&apos;d expect to show up in your category. Swap any of them out.
            You know your market better than we do.
          </p>
          {reasoning && <p className="note">{reasoning}</p>}

          <ul className="competitor-list">
            {competitors.map((row, i) => (
              <li key={i}>
                <input
                  className="field"
                  type="text"
                  value={row.name}
                  placeholder="Company name"
                  onChange={(e) => setCompetitorName(i, e.target.value)}
                />
                <button
                  className="button ghost small"
                  onClick={() => setCompetitors((c) => c.filter((_, j) => j !== i))}
                  disabled={liveCompetitors().length <= 3}
                  aria-label={`Remove ${row.name || 'this competitor'}`}
                >
                  Remove
                </button>
                {row.domain && !row.concern && <span className="competitor-domain">{row.domain}</span>}
                {/*
                  Shown, never acted on. A competitor we quietly removed is one the
                  subscriber never got to disagree about, and they know their market better
                  than we do - which is the whole reason this screen is editable.
                */}
                {row.concern && <span className="competitor-concern">{row.concern.message}</span>}
              </li>
            ))}
          </ul>

          <p className="note">
            The first one is the biggest. It is what the alternatives question gets written against,
            so put them in the order that matters.
          </p>

          <div className="wizard-actions">
            <button
              className="button ghost"
              onClick={() => setCompetitors((c) => [...c, { name: '', domain: null, concern: null }])}
              disabled={competitors.length >= 6}
            >
              Add another
            </button>
            <button
              className="button"
              onClick={toQuestions}
              disabled={Boolean(busy) || liveCompetitors().length < 3}
            >
              {busy ?? 'Next: your five questions'}
            </button>
          </div>
          <button className="link-back" onClick={() => setStep('business')} disabled={Boolean(busy)}>
            Back
          </button>
        </section>
      )}

      {step === 'questions' && (
        <section className="wizard-step">
          <h2>These are the five questions we&apos;ll ask every month</h2>
          <p className="lede">
            Read them like a customer would. If one of them sounds like something nobody would ever
            type, change it. The whole thing is worthless if you don&apos;t believe the questions.
          </p>

          <ul className="question-list">
            {QUESTION_SLOTS.map((slot) => {
              const q = questions.find((x) => x.slot === slot);
              if (!q) return null;
              return (
                <li key={slot}>
                  <div className="slot">{SLOT_LABEL[slot]}</div>
                  <textarea
                    className="field question-field"
                    rows={2}
                    value={q.text}
                    onChange={(e) =>
                      setQuestions((qs) =>
                        qs.map((x) => (x.slot === slot ? { ...x, text: e.target.value } : x)),
                      )
                    }
                  />
                  <button
                    className="button ghost small"
                    onClick={() => rewrite(slot)}
                    disabled={Boolean(busy)}
                  >
                    Rewrite this one
                  </button>
                </li>
              );
            })}
          </ul>

          <p className="punch">
            Once we start, these stay put. Comparing month to month only works if the question
            doesn&apos;t move.
          </p>

          <div className="wizard-actions">
            <button
              className="button"
              onClick={() => {
                setError(null);
                setStep('pay');
              }}
              disabled={Boolean(busy) || questions.some((q) => q.text.trim().length < 15)}
            >
              {busy ?? 'I approve these five'}
            </button>
          </div>
          <button
            className="link-back"
            onClick={() => setStep('competitors')}
            disabled={Boolean(busy)}
          >
            Back
          </button>
        </section>
      )}

      {step === 'pay' && (
        <section className="wizard-step">
          <h2>{price} a month. Cancel any time.</h2>
          <p className="lede">
            Five questions, five AI platforms, twenty five answers captured word for word, every
            month, from fifty five readings. Four times a year we also read Claude and Microsoft
            Copilot by hand.
          </p>

          {founding && !discount && (
            <p className="founding">
              Founding rate: {priceLabel('founding_monthly')} a month, locked for twelve
              months.{' '}
              {foundingRemaining === 1
                ? 'One place left.'
                : `${foundingRemaining} of 20 places left.`}
            </p>
          )}

          {/* Says the whole deal in one line, including what happens at month four. A
              discount that does not print its own end date is a price rise waiting to
              arrive with no warning. */}
          {discount && <p className="founding">{discount.line}</p>}

          <div className="wizard-fields">
            <Field
              label="Where should the report go?"
              hint="This is also the address you sign in with"
              value={email}
              onChange={setEmail}
              type="email"
            />
            <label className="wizard-field">
              <span className="k">Got a code?</span>
              <span className="h">Optional. The price above changes before you pay, not after</span>
              <span className="code-row">
                <input
                  className="field"
                  value={discountInput}
                  onChange={(e) => {
                    setDiscountInput(e.target.value);
                    setDiscount(null);
                    setDiscountError(null);
                  }}
                  autoCapitalize="characters"
                  spellCheck={false}
                />
                <button
                  className="button secondary"
                  onClick={applyDiscount}
                  disabled={Boolean(busy) || !discountInput.trim()}
                  type="button"
                >
                  Apply
                </button>
              </span>
              {discountError && <span className="h note-warn">{discountError}</span>}
            </label>
          </div>

          <div className="wizard-actions">
            <button className="button" onClick={pay} disabled={Boolean(busy) || !email.trim()}>
              {busy ?? `Pay ${price} a month`}
            </button>
          </div>
          <p className="note">
            Card handled by Stripe. Your five questions are saved when you continue, whether or not
            you finish paying.
          </p>
          <button className="link-back" onClick={() => setStep('questions')} disabled={Boolean(busy)}>
            Back to the questions
          </button>
        </section>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="wizard-field">
      <span className="k">{label}</span>
      {hint && <span className="h">{hint}</span>}
      <input className="field" type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
