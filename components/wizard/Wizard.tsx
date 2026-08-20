'use client';

import { useState } from 'react';
import { SLOT_LABEL, QUESTION_SLOTS, type QuestionSlot } from '@/lib/scope';
import { MARKET_OPTIONS, isSupportedMarket } from '@/lib/geo';
import { iso2 } from '@/lib/domain';

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
}: {
  prefill: WizardProfileInput | null;
  prefillEmail: string | null;
  foundingRemaining: number | null;
}) {
  const [step, setStep] = useState<Step>('business');
  const [domain, setDomain] = useState(prefill?.website ?? '');
  const [unsupportedMarket, setUnsupportedMarket] = useState<string | null>(null);
  const [marketGuessed, setMarketGuessed] = useState(false);
  const [detected, setDetected] = useState(Boolean(prefill));
  const [profile, setProfile] = useState<WizardProfileInput>(prefill ?? EMPTY);
  const [competitors, setCompetitors] = useState<string[]>([]);
  const [reasoning, setReasoning] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [email, setEmail] = useState(prefillEmail ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const founding = foundingRemaining !== null && foundingRemaining > 0;
  const price = founding ? 'USD 149' : 'USD 249';

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
      const out = await post<{ competitors: string[]; reasoning: string }>(
        '/api/wizard/competitors',
        { profile },
      );
      setCompetitors(out.competitors.length ? out.competitors : ['', '', '', '']);
      setReasoning(out.reasoning || null);
      setStep('competitors');
    });

  const toQuestions = () =>
    run('Writing your five questions', async () => {
      const out = await post<{ questions: Question[] }>('/api/wizard/questions', {
        profile,
        competitors: competitors.filter(Boolean),
      });
      setQuestions(out.questions);
      setStep('questions');
    });

  const rewrite = (slot: QuestionSlot) =>
    run(`Rewriting the ${SLOT_LABEL[slot].toLowerCase()}`, async () => {
      const out = await post<{ slot: QuestionSlot; text: string }>('/api/wizard/rewrite', {
        slot,
        profile,
        competitors: competitors.filter(Boolean),
        questions,
      });
      setQuestions((qs) => qs.map((q) => (q.slot === slot ? { ...q, text: out.text } : q)));
    });

  const pay = () =>
    run('Opening the payment page', async () => {
      const out = await post<{ url: string }>('/api/wizard/checkout', {
        email,
        profile,
        competitors: competitors.filter(Boolean),
        questions,
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
            {competitors.map((name, i) => (
              <li key={i}>
                <input
                  className="field"
                  type="text"
                  value={name}
                  placeholder="Company name"
                  onChange={(e) =>
                    setCompetitors((c) => c.map((v, j) => (j === i ? e.target.value : v)))
                  }
                />
                <button
                  className="button ghost small"
                  onClick={() => setCompetitors((c) => c.filter((_, j) => j !== i))}
                  disabled={competitors.filter(Boolean).length <= 3}
                  aria-label={`Remove ${name || 'this competitor'}`}
                >
                  Remove
                </button>
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
              onClick={() => setCompetitors((c) => [...c, ''])}
              disabled={competitors.length >= 6}
            >
              Add another
            </button>
            <button
              className="button"
              onClick={toQuestions}
              disabled={Boolean(busy) || competitors.filter(Boolean).length < 3}
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
            month. Four times a year we also read Claude and Microsoft Copilot by hand.
          </p>

          {founding && (
            <p className="founding">
              Founding rate: USD 149 a month, locked for twelve months.{' '}
              {foundingRemaining === 1
                ? 'One place left.'
                : `${foundingRemaining} of 20 places left.`}
            </p>
          )}

          <div className="wizard-fields">
            <Field
              label="Where should the report go?"
              hint="This is also the address you sign in with"
              value={email}
              onChange={setEmail}
              type="email"
            />
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
