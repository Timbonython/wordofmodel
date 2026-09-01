'use client';

import { useEffect, useRef, useState } from 'react';
import { normaliseDomain } from '@/lib/domain';
import { readNdjson } from '@/lib/stream';
import type { FreeResult, ManualReason, Profile, ScanEvent } from '@/lib/types';
import { ScanProgress, type Step, type StepState } from './ScanProgress';
import { ScanResult } from './ScanResult';
import { BusinessFacts } from '@/components/BusinessFacts';
import { fact } from '@/lib/profile';
import { metaTrack } from '@/components/MetaPixel';
import { tagSession } from '@/lib/clarity';

type Phase = 'idle' | 'detecting' | 'confirm' | 'running' | 'result';

interface Editable {
  brand_name: string;
  what_they_sell: string;
  buyer: string;
  /** The engines' search locale. Not shown on the card; not the question's geography. */
  country: string;
  /** Quoted from the page or typed on the card. Empty string here means null on the wire. */
  location: string;
  category_term: string;
}

const BLANK: Editable = { brand_name: '', what_they_sell: '', buyer: '', country: '', location: '', category_term: '' };

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
    location: profile.location ?? '',
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
  /**
   * The question, on the card and editable, from 1 Sep 2026.
   *
   * WHAT THIS REPLACED, so the reasoning survives. It used to hold the question /api/detect
   * wrote, hidden, and hand it back only if the visitor changed nothing; correcting a fact
   * dropped it and the server wrote a new one mid-run. So the question - the single thing the
   * whole scan turns on - was the one part of the run nobody could see before it was asked, and
   * a wrong one cost the visitor the entire result. It is now on screen, in a field, above the
   * button that spends the engines.
   */
  const [draftQuestion, setDraftQuestion] = useState('');
  /** False when the guard rejected every draw and the repair. Null when none was written. */
  const [questionVerified, setQuestionVerified] = useState<boolean | null>(null);
  /**
   * Has the visitor typed in the question box?
   *
   * It decides one thing: whether correcting a fact is allowed to overwrite what is in there.
   * Once somebody has written their own question, replacing it because they also fixed a typo in
   * their suburb would be the software taking their work away. After that the rewrite is offered
   * and never automatic.
   */
  const [questionEdited, setQuestionEdited] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  /** Which fact the question cannot be written without, from /api/question. §4. */
  const [missingFact, setMissingFact] = useState<'buyer' | 'sells' | null>(null);
  /* Debounce, so a fact typed one character at a time is four draws and not forty. */
  const rewriteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* The last rewrite asked for. An earlier reply landing late must not overwrite a later one. */
  const rewriteSeq = useRef(0);
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

  /**
   * TAG THE RECORDING WITH WHERE THE VISITOR GOT TO. Added 1 Sep 2026, with Clarity, for the
   * one question the tables cannot answer: 100+ landing views and zero completed scans, and
   * five states a session can end in. Now a recording can be found by its ending.
   *
   * IT READS THE STATE RATHER THAN BEING CALLED AT THE TRANSITIONS, which is the whole reason
   * it is one effect and not seven setPhase call sites. Phase is set in seven places, three of
   * them inside the functional updater that reverts a failed run - and a tag added next to six
   * of the seven is a hole exactly where the interesting cohort is. Depending on the state
   * makes an untagged phase unrepresentable instead of merely unlikely.
   *
   * Clarity keeps every value a session sets for a key, so a visitor who reached the
   * confirmation card and stopped carries idle, detecting and confirm and never carries
   * running. That subtraction - has confirm, lacks running - is the abandonment number, and it
   * is not available from any table in this build.
   *
   * Safe when Clarity was never loaded, which is every UK and EEA visitor and every environment
   * with no project id. See tagSession; it is a no-op there and deliberately not the package's
   * own setTag, which would throw.
   */
  useEffect(() => {
    tagSession('phase', phase);
  }, [phase]);

  /**
   * The scan id, so a recording joins to the row it produced.
   *
   * It is a pointer into our own data and not personal data in itself, but it does let anyone
   * with Clarity access walk from a recording to a scans row, and that row carries an email
   * address once the reveal has been through. That is a deliberate trade for the length of this
   * investigation and it goes when the recorder does - the id is what makes "this session"
   * and "this result" the same object, and without it a recording of a scan that went wrong
   * cannot be matched to the question that was actually asked.
   */
  useEffect(() => {
    if (result?.scanId) tagSession('scan', result.scanId);
  }, [result?.scanId]);

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
        // Written in the detect stream from 1 Sep 2026, so the card sits between it and the
        // engines. Held so it can be handed back unchanged when nothing was corrected.
        setDraftQuestion(event.question ?? '');
        setQuestionVerified(event.question_verified);
        setQuestionEdited(false);
        setMissingFact(event.question ? null : 'buyer');
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
        /*
         * VIEWCONTENT IS THE COMPLETED FREE SCAN, from 31 Aug 2026.
         *
         * It used to fire in the reveal's success branch, two lines from Lead - so the two
         * were the same conversion under two names, and a campaign optimised for either was
         * optimising for the identical action. Meta cannot bid on a distinction that does not
         * exist in the data.
         *
         * Here it means the free result is on the visitor's screen: they typed a domain,
         * agreed to the profile, and two engines answered. That is the cheapest real signal
         * this site produces and the one worth buying more of. Lead stays where it is, on the
         * email, which is a strictly larger commitment.
         *
         * A CACHED RESULT STILL COUNTS. The visitor did the same thing and saw the same page;
         * whether we paid an engine for it is our business and not a fact about their intent.
         */
        metaTrack('ViewContent');
        break;

      case 'error':
        setError(event.message);
        setSteps((current) => current.map((s) => (s.state === 'active' ? { ...s, state: 'failed' } : s)));
        setPhase((current) => (current === 'running' ? 'confirm' : 'idle'));
        break;
    }
  }

  /**
   * Rewrite the question from whatever the card currently holds.
   *
   * Called on a corrected fact, and by hand from the link under the box. It never runs while the
   * visitor has their own question in there unless they ask for it - see questionEdited.
   */
  async function rewrite(next: Editable): Promise<void> {
    const seq = ++rewriteSeq.current;
    setRewriting(true);
    try {
      const response = await fetch('/api/question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, ...next }),
      });
      const data = (await response.json()) as {
        question?: string | null;
        verified?: boolean;
        missing?: 'buyer' | 'sells';
        error?: string;
      };
      // A reply to an older keystroke, arriving after a newer one. Drop it.
      if (seq !== rewriteSeq.current) return;
      if (data.question) {
        setDraftQuestion(data.question);
        setQuestionVerified(data.verified ?? null);
        setMissingFact(null);
      } else if (data.missing) {
        /*
         * NOT AN ERROR, AND IT MUST NOT LOOK LIKE ONE. §4: without knowing who is choosing there
         * is no question to write. The field is on screen above this. Clear the box rather than
         * leaving the old question sitting under facts it no longer comes from.
         */
        setDraftQuestion('');
        setQuestionVerified(null);
        setMissingFact(data.missing);
      }
    } catch {
      /*
       * DELIBERATELY QUIET, AND THIS IS THE ONE PLACE IN THE PANEL THAT IS. The visitor is
       * mid-correction with a working question already on screen; a failed rewrite means it is
       * now slightly stale, not that anything is broken. The stale-question warning under the
       * box is already saying the true thing. An error banner here would read as "your
       * correction failed", which it did not.
       */
    } finally {
      if (seq === rewriteSeq.current) setRewriting(false);
    }
  }

  /** Wait for them to stop typing. A fact is entered a character at a time; a rewrite is not free. */
  function scheduleRewrite(next: Editable): void {
    if (rewriteTimer.current) clearTimeout(rewriteTimer.current);
    rewriteTimer.current = setTimeout(() => void rewrite(next), 800);
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
      /* NOT A PHASE, and that is the point. This visitor typed something - a business name,
         usually - and the client rejected it before any request was made, so phase never leaves
         "idle" and they are indistinguishable from someone who never touched the field. That is
         the second of the four deaths this recorder was added to find, and without its own key
         it is the one death the instrument cannot see. */
      tagSession('rejected', 'domain');
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
    setDraftQuestion('');
    setQuestionVerified(null);
    setQuestionEdited(false);
    setMissingFact(null);
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
      /* Same shape as the domain rejection above: they pressed the button on the confirmation
         card and were sent back to it, still in phase "confirm", looking exactly like someone
         who read it and left. */
      tagSession('rejected', 'facts');
      setError('We need your brand name and what you sell. The rest we can work with.');
      return;
    }
    /*
     * NO QUESTION, NO RUN - AND THIS IS NEW ON 1 SEP 2026.
     *
     * It used to submit with an empty question and let the server write one, which threw when the
     * buyer was missing and the visitor got an error at the end of a run they had already paid
     * attention to. The question is on the card now, so an empty box is a visible, fixable state
     * and the fact it is waiting on is one line above it.
     */
    const asking = draftQuestion.trim();
    if (!asking) {
      setError(
        missingFact === 'sells'
          ? 'Tell us what you do and we can write the question.'
          : 'Tell us who chooses you and we can write the question.',
      );
      return;
    }
    // Drop a rewrite that is still in flight, along with the one that has not fired yet. Its
    // reply would land after the run had started and quietly change the question on a card the
    // visitor has already left.
    if (rewriteTimer.current) clearTimeout(rewriteTimer.current);
    rewriteSeq.current++;
    setRewriting(false);
    setError(null);
    setPhase('running');

    try {
      // Read at submit rather than on mount: the parameters are on the URL the visitor landed
      // on, and this is the first server call that can store them somewhere that survives a
      // cleared browser or a hop to a laptop.
      await stream('/api/scan', {
        domain,
        profile,
        edited,
        /*
         * THE QUESTION ON THE CARD, ALWAYS, AND VERBATIM. It was `edited ? undefined : written`
         * - the server rewrote whenever a fact had changed, which was correct while the question
         * was invisible and is wrong now that one is on screen above the button. Whatever the
         * visitor last read is what gets asked. /api/scan will not use a cached run of a
         * different question against it.
         */
        question: asking,
        touch: touchFromUrl(),
      });
      setPhase((current) => (current === 'running' ? 'confirm' : current));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
      setPhase('confirm');
    }
  }

  function touchFromUrl(): Record<string, string> {
    if (typeof window === 'undefined') return {};
    const q = new URLSearchParams(window.location.search);
    const out: Record<string, string> = {};
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'fbclid']) {
      const v = q.get(k);
      if (v) out[k] = v.slice(0, 200);
    }
    return out;
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
            const next = { ...profile, [key]: e.target.value };
            setEdited(true);
            setProfile(next);
            if (!questionEdited) scheduleRewrite(next);
          }}
        />
      </label>
    );
  }

  const showProgress = phase === 'detecting' || phase === 'running';

  return (
    /* NO id HERE. app/page.tsx and app/pricing/page.tsx each wrap this in <div id="scan">, which
       is what every "Free scan" link in the nav and the footer anchors to. This carried the same
       id, so both pages shipped two elements with one id - invalid HTML, and it breaks any
       selector that expects one. The wrapper owns the anchor; this owns the class. */
    <div className="scan" ref={scanRegion}>
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

      {/* The reassurance strip, §4 of the brand brief: it sits UNDER the field, not above it,
          and it is part of the fold budget rather than decoration below it.

          "ABOUT THREE MINUTES", AND THE DIRECTION MATTERS. The verified run took 2m 46s. The
          site said two. A promise that runs slightly ahead of the product is the same defect
          that cost two days of ad spend last week, in a smaller dose - so this under-promises
          and lets people be pleasantly surprised. The ads still say "about a minute" and have
          to be changed in Meta to match; that is queued and is not code. */}
      {phase === 'idle' ? (
        <p className="reassure">Free &middot; about three minutes &middot; no account, no card</p>
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
            /*
             * REPLACED 1 Sep 2026 by the shared card. What was here read:
             *
             *   You sell {what_they_sell} to {buyer || 'buyers in your category'} in
             *   {country || 'your market'}. Right?
             *
             * A missing buyer and a missing market rendered as plausible prose in the same
             * weight as a found fact, and the field below it carried the placeholder
             * "Australia". Principle §5, three times in one screen.
             */
            null
          )}

          {manual ? (
            <div className="confirm-grid">
              {field('brand_name', 'Your brand name', 'How customers say it')}
              {field('what_they_sell', 'What you sell', 'Plain and specific')}
              {field('buyer', 'Who buys it', 'The person deciding')}
              {field('country', 'Main market', '')}
              {field('category_term', 'What a buyer would search', 'Six words at most')}
            </div>
          ) : (
            <BusinessFacts
              brandName={profile.brand_name || undefined}
              value={{
                sells: fact(profile.what_they_sell || profile.category_term, 'extracted'),
                buyer: fact(profile.buyer, 'extracted'),
                location: fact(profile.location, 'extracted'),
              }}
              onChange={(next) => {
                const updated = {
                  ...profile,
                  what_they_sell: next.sells?.value ?? '',
                  buyer: next.buyer?.value ?? '',
                  location: next.location?.value ?? '',
                };
                setEdited(true);
                setProfile(updated);
                /*
                 * THE CARD'S TWO HALVES HAVE TO AGREE. A corrected fact with the old question
                 * still sitting under it is the same defect the card was built to remove, one
                 * layer up: what is on screen would no longer be what the run is built from.
                 */
                if (!questionEdited) scheduleRewrite(updated);
              }}
            />
          )}

          {/*
            THE QUESTION, ON THE CARD AND EDITABLE. §5 of the grounding brief put the three facts
            here; this is the thing those facts were only ever a means to. A visitor who reads a
            question they would never ask can now fix it in the box rather than watch it get
            asked, and the engines get exactly what is in here.
          */}
          <div className="asking">
            <div className="eyebrow">So this is what we will ask</div>
            <textarea
              className="field asking-input"
              aria-label="The question we will ask"
              rows={3}
              value={draftQuestion}
              placeholder="The question a buyer would type"
              onChange={(e) => {
                setQuestionEdited(true);
                // Ours to vouch for, not theirs. Their own words are not "unverified".
                setQuestionVerified(null);
                setDraftQuestion(e.target.value);
              }}
            />
            {rewriting ? (
              <p className="note asking-note">Rewriting it from your correction.</p>
            ) : !draftQuestion.trim() ? (
              <p className="asking-warn">
                {missingFact === 'sells'
                  ? 'We cannot write the question until we know what you do. Fill that in above.'
                  : 'We cannot write the question until we know who chooses you. Fill that in above.'}
              </p>
            ) : questionVerified === false ? (
              /*
                THE GUARD FAILED AND SAYS SO. Four draws and a repair all came back reading like
                something nobody would type, and this is the best of them. It used to arrive on
                screen looking exactly like a question that passed. Now it does not.
              */
              <p className="asking-warn">
                We are not confident in this one. Nothing we drafted read like a question a real
                buyer would type, so this is the closest of them. Worth rewriting in your words.
              </p>
            ) : (
              <p className="note asking-note">
                Both engines get this exact question. Change it if it is not what someone would type.
              </p>
            )}
            {questionEdited && !rewriting ? (
              <button
                className="asking-redo"
                type="button"
                onClick={() => {
                  setQuestionEdited(false);
                  void rewrite(profile);
                }}
              >
                Write it again from the facts above
              </button>
            ) : null}
          </div>

          <div className="confirm-actions">
            <button className="button" type="submit">
              {edited ? 'That is right - ask the engines' : 'Looks right - ask the engines'}
            </button>
            <span className="note">Two engines, about forty seconds.</span>
          </div>
        </form>
      ) : null}

      {/* `|| 'your market'` was here too - a missing market rendered as a plausible phrase. The
          sentence now says what is true without naming a place it may not have. */}
      {phase === 'running' && !question ? (
        <p className="note" style={{ marginTop: 18 }}>
          Writing a question a buyer would actually type.
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
