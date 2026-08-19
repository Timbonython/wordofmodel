'use client';

import { useRef, useState } from 'react';
import { normaliseDomain } from '@/lib/domain';
import { readNdjson } from '@/lib/stream';
import type { FreeResult, ManualReason, Profile, ScanEvent } from '@/lib/types';
import { ScanProgress, type Step, type StepState } from './ScanProgress';
import { ScanResult } from './ScanResult';

type Phase = 'idle' | 'detecting' | 'confirm' | 'running' | 'result';

interface Editable {
  brand_name: string;
  what_they_sell: string;
  buyer: string;
  country: string;
  category_term: string;
}

const BLANK: Editable = { brand_name: '', what_they_sell: '', buyer: '', country: '', category_term: '' };

/**
 * Say which thing went wrong, in the visitor's terms, and never imply the fault
 * is theirs. "We could not read it" is true and survives being read by the
 * person whose site it is. The scan continues from here either way.
 */
const MANUAL_COPY: Record<
  NonNullable<ManualReason>,
  { eyebrow: string; lede: (domain: string) => string }
> = {
  unreachable: {
    eyebrow: 'We could not read your site',
    lede: (d) => `${d} would not let us read it just now. That is common and it says nothing about you, so we will ask you instead.`,
  },
  thin: {
    eyebrow: 'We could not read enough',
    lede: (d) => `There was not much text on ${d} for us to go on. Plenty of good sites are built that way.`,
  },
  unclear: {
    eyebrow: 'We read it, but we are not sure',
    lede: (d) => `We read ${d} and we would rather not guess what you sell. A wrong question makes the answer worthless.`,
  },
  detect_failed: {
    eyebrow: 'That did not work our end',
    lede: () => 'Something failed on our side while we were reading it. Nothing to do with your site.',
  },
};

function toEditable(profile: Profile): Editable {
  return {
    brand_name: profile.brand_name ?? '',
    what_they_sell: profile.what_they_sell ?? '',
    buyer: profile.buyer ?? '',
    country: profile.country ?? '',
    category_term: profile.category_term ?? '',
  };
}

/**
 * wizardLive gates the offer CTA at the end of the result and nothing else. See
 * the note on env.wizardLive: while Stripe is in test mode a visitor must not be
 * sent to a Checkout page that cannot take their card.
 */
export function ScanPanel({ wizardLive = false }: { wizardLive?: boolean }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [domainInput, setDomainInput] = useState('');
  const [domain, setDomain] = useState('');
  const [profile, setProfile] = useState<Editable>(BLANK);
  const [manual, setManual] = useState(false);
  const [manualReason, setManualReason] = useState<ManualReason>(null);
  const [edited, setEdited] = useState(false);
  const [question, setQuestion] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    scanId: string;
    free: FreeResult;
    cached: boolean;
    runAt: string;
    question: string;
  } | null>(null);

  const scanRegion = useRef<HTMLDivElement>(null);

  function setStep(key: string, label: string, state: StepState, detail?: string) {
    setSteps((current) => {
      const next = [...current];
      const at = next.findIndex((s) => s.key === key);
      const step: Step = { key, label, state, detail };
      if (at === -1) next.push(step);
      else next[at] = { ...next[at], ...step };
      return next;
    });
  }

  function finishActive() {
    setSteps((current) => current.map((s) => (s.state === 'active' ? { ...s, state: 'done' } : s)));
  }

  /** Shared event handling for both streams. */
  function handle(event: ScanEvent): void {
    switch (event.type) {
      case 'stage':
        finishActive();
        setStep(`stage:${event.stage}`, event.label, 'active');
        break;

      case 'site_fetched':
        setStep('stage:reading', `Read ${event.urls.length === 1 ? 'the homepage' : 'the homepage and /about'}`, 'done');
        break;

      case 'detected':
        finishActive();
        setProfile(toEditable(event.profile));
        setManual(event.needs_manual);
        setManualReason(event.manual_reason);
        setPhase('confirm');
        break;

      case 'question':
        finishActive();
        setQuestion(event.question);
        break;

      case 'engine_started':
        setStep(`engine:${event.engine}`, `Asking ${event.label}`, 'active');
        break;

      case 'engine_done':
        setStep(
          `engine:${event.engine}`,
          `${event.label} answered`,
          'done',
          `${(event.ms / 1000).toFixed(1)}s · ${event.citations} sources`,
        );
        break;

      case 'engine_failed':
        setStep(`engine:${event.engine}`, `${event.label} did not answer`, 'failed', event.message.slice(0, 60));
        break;

      case 'scoring':
        setStep('scoring', 'Reading the answers back', 'active');
        break;

      case 'result':
        finishActive();
        setSteps((current) => current.map((s) => (s.state === 'pending' ? { ...s, state: 'done' } : s)));
        setQuestion(event.question);
        setResult({
          scanId: event.scanId,
          free: event.free,
          cached: event.cached,
          runAt: event.run_at,
          question: event.question,
        });
        setPhase('result');
        break;

      case 'error':
        setError(event.message);
        setSteps((current) => current.map((s) => (s.state === 'active' ? { ...s, state: 'failed' } : s)));
        setPhase((current) => (current === 'running' ? 'confirm' : 'idle'));
        break;
    }
  }

  async function stream(url: string, body: unknown): Promise<void> {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok && response.headers.get('content-type')?.includes('application/json')) {
      const failure = (await response.json()) as { error?: string };
      throw new Error(failure.error || 'That did not work.');
    }
    if (!response.body) throw new Error('No response from the server.');

    await readNdjson(response.body, handle);
  }

  async function onDetect(event: React.FormEvent) {
    event.preventDefault();
    const clean = normaliseDomain(domainInput);
    if (!clean) {
      setError('That does not look like a website address. Try example.com');
      return;
    }
    setError(null);
    setDomain(clean);
    setResult(null);
    setQuestion(null);
    setEdited(false);
    setManual(false);
    setManualReason(null);
    setSteps([]);
    setPhase('detecting');
    scanRegion.current?.scrollIntoView({ block: 'nearest' });

    try {
      await stream('/api/detect', { domain: clean });
      // If the stream ended without moving us on, something upstream failed
      // quietly. Do not leave the visitor watching nothing.
      setPhase((current) => (current === 'detecting' ? 'idle' : current));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
      setPhase('idle');
    }
  }

  async function onRun(event: React.FormEvent) {
    event.preventDefault();
    if (!profile.brand_name.trim() || !(profile.what_they_sell.trim() || profile.category_term.trim())) {
      setError('We need your brand name and what you sell. The rest we can work with.');
      return;
    }
    setError(null);
    setPhase('running');

    try {
      await stream('/api/scan', { domain, profile, edited });
      setPhase((current) => (current === 'running' ? 'confirm' : current));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
      setPhase('confirm');
    }
  }

  function field(key: keyof Editable, label: string, placeholder: string) {
    return (
      <label className="confirm-field" key={key}>
        <span>{label}</span>
        <input
          className="field"
          value={profile[key]}
          placeholder={placeholder}
          onChange={(e) => {
            setEdited(true);
            setProfile((current) => ({ ...current, [key]: e.target.value }));
          }}
        />
      </label>
    );
  }

  const showProgress = phase === 'detecting' || phase === 'running';

  return (
    <div className="scan" ref={scanRegion} id="scan">
      {/* ---------- step 1: the field ---------- */}
      {phase === 'idle' || phase === 'detecting' ? (
        <form className="inline-form" onSubmit={onDetect}>
          <label className="visually-hidden" htmlFor="scan-domain">
            Enter your website
          </label>
          <input
            id="scan-domain"
            className="field"
            value={domainInput}
            onChange={(e) => setDomainInput(e.target.value)}
            placeholder="yourcompany.com"
            autoComplete="url"
            inputMode="url"
            spellCheck={false}
            disabled={phase === 'detecting'}
          />
          <button className="button" type="submit" disabled={phase === 'detecting'}>
            {phase === 'detecting' ? 'Reading your site' : 'Show me'}
          </button>
        </form>
      ) : null}

      {phase === 'idle' ? (
        <p className="note" style={{ marginTop: 14 }}>
          No account. No card. One question, two AI engines, your actual result.
        </p>
      ) : null}

      {/* ---------- the show ---------- */}
      {showProgress && steps.length > 0 ? <ScanProgress steps={steps} /> : null}

      {/* The question goes on screen before the answers come back. That is the
          credibility gate: you see what we asked before you see what came back. */}
      {question && phase !== 'result' ? (
        <div className="asked-block">
          <div className="eyebrow">The question we are asking</div>
          <p className="asked">{question}</p>
        </div>
      ) : null}

      {/* ---------- step 3: confirm or correct ---------- */}
      {phase === 'confirm' ? (
        <form className="confirm" onSubmit={onRun}>
          {manual ? (
            <>
              <div className="eyebrow">{MANUAL_COPY[manualReason ?? 'unclear'].eyebrow}</div>
              <p>{MANUAL_COPY[manualReason ?? 'unclear'].lede(domain)}</p>
              <p className="note">
                Tell us what you sell and who buys it. That is all we need, and the question gets built from your words
                rather than our guess.
              </p>
            </>
          ) : (
            <>
              <div className="eyebrow">Before we ask anything</div>
              <p className="confirm-lede">
                You sell <strong>{profile.what_they_sell || profile.category_term}</strong> to{' '}
                <strong>{profile.buyer || 'buyers in your category'}</strong> in{' '}
                <strong>{profile.country || 'your market'}</strong>. Right?
              </p>
              <p className="note">
                Correct anything that is wrong. The question is built from this, and a question you would not ask makes
                the answer worthless.
              </p>
            </>
          )}

          <div className="confirm-grid">
            {field('brand_name', 'Your brand name', 'How customers say it')}
            {field('what_they_sell', 'What you sell', 'Plain and specific')}
            {field('buyer', 'Who buys it', 'The person deciding')}
            {field('country', 'Main market', 'Australia')}
            {field('category_term', 'What a buyer would search', 'Six words at most')}
          </div>

          <div className="confirm-actions">
            <button className="button" type="submit">
              {edited ? 'That is right, run it' : 'Yes, run it'}
            </button>
            <span className="note">Two engines, about forty seconds.</span>
          </div>
        </form>
      ) : null}

      {phase === 'running' && !question ? (
        <p className="note" style={{ marginTop: 18 }}>
          Writing a question a buyer in {profile.country || 'your market'} would actually type.
        </p>
      ) : null}

      {/* ---------- steps 5 to 7 ---------- */}
      {phase === 'result' && result ? (
        <ScanResult
          scanId={result.scanId}
          domain={domain}
          question={result.question}
          free={result.free}
          cached={result.cached}
          runAt={result.runAt}
          wizardLive={wizardLive}
        />
      ) : null}

      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
