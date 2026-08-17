'use client';

import { useState } from 'react';
import { splitBold } from '@/lib/markup';
import type { FreeResult, GatedResult } from '@/lib/types';
import { AnswerExcerpt } from './AnswerExcerpt';

function Bolded({ text }: { text: string }) {
  return (
    <>
      {splitBold(text).map((part, i) => (part.bold ? <strong key={i}>{part.text}</strong> : <span key={i}>{part.text}</span>))}
    </>
  );
}

/** Step 5, ungated, then step 6 behind a single field, then step 7. */
export function ScanResult({
  scanId,
  domain,
  question,
  free,
  cached,
  runAt,
}: {
  scanId: string;
  domain: string;
  question: string;
  free: FreeResult;
  cached: boolean;
  runAt: string;
}) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gated, setGated] = useState<GatedResult | null>(null);
  const [brandName, setBrandName] = useState('you');
  const [emailed, setEmailed] = useState(true);

  async function reveal(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanId, email }),
      });
      const body = (await response.json()) as {
        gated?: GatedResult;
        brandName?: string;
        emailed?: boolean;
        error?: string;
      };
      if (!response.ok || !body.gated) throw new Error(body.error || 'That did not work. Try again.');
      setGated(body.gated);
      setBrandName(body.brandName || 'you');
      setEmailed(body.emailed !== false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="result">
      <div className="eyebrow">The question we asked</div>
      <p className="asked">{question}</p>

      <h2 className="verdict-headline">{free.headline}</h2>
      {free.lines.map((line, i) => (
        <p key={i} className="verdict-line">
          <Bolded text={line} />
        </p>
      ))}

      {cached ? (
        <p className="note">
          You scanned {domain} in the last day. This is that result, from{' '}
          {new Date(runAt).toLocaleString('en-AU', { day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })}.
          One scan per site per day.
        </p>
      ) : null}

      {/* ---------------- step 6: the gate ---------------- */}
      {!gated ? (
        <div className="gate">
          <div className="eyebrow">What we are holding back</div>
          <ul className="gate-list">
            <li>Both answers, word for word</li>
            <li>Every brand named, in the order they came up</li>
            <li>The sites the engines cited, so you can see who owns the answer</li>
            {free.kind === 'absent' || free.kind === 'named_not_recommended' ? <li>The competitor who beat you, named</li> : null}
          </ul>
          <form className="inline-form" onSubmit={reveal}>
            <label className="visually-hidden" htmlFor="reveal-email">
              Your email address
            </label>
            <input
              id="reveal-email"
              className="field"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
            <button className="button" type="submit" disabled={busy || !email}>
              {busy ? 'Opening it up' : 'Show me the rest'}
            </button>
          </form>
          <p className="note" style={{ marginTop: 12 }}>
            One field, and we send you a copy you can forward. No account, no card.
          </p>
          {error ? <p className="error">{error}</p> : null}
        </div>
      ) : (
        <div className="revealed">
          {!emailed ? (
            <p className="error">
              It is all here on screen, but our mail server would not take it just now. Nothing is lost.
            </p>
          ) : (
            <p className="note">A copy is on its way to {email}. It is built to be forwarded.</p>
          )}

          <div className="eyebrow" style={{ marginTop: 40 }}>
            The answers, word for word
          </div>
          {gated.captures.map((capture) => (
            <AnswerExcerpt
              key={capture.engine}
              engineLabel={capture.engine_label}
              model={capture.model}
              runAt={runAt}
              answer={capture.answer}
              brandName={brandName}
              competitors={gated.brands_named}
              mentioned={capture.mentioned}
              recommended={capture.recommended}
              citations={capture.citations}
            />
          ))}

          <div className="eyebrow" style={{ marginTop: 40 }}>
            Every brand named
          </div>
          {gated.brands_named.length ? (
            <p className="brands">
              {gated.brands_named.map((brand) => (
                <mark key={brand}>{brand}</mark>
              ))}
            </p>
          ) : (
            <p>Neither engine named a single company.</p>
          )}

          <div className="eyebrow" style={{ marginTop: 40 }}>
            Where the answers came from
          </div>
          {gated.domains_cited.length ? (
            <ul className="sources">
              {gated.domains_cited.map((source) => (
                <li key={source.domain} className={source.domain === domain ? 'self' : undefined}>
                  <span className="dom">{source.domain}</span>
                  <span className="ct">{source.count}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>Neither engine cited a source, which is its own finding.</p>
          )}

          {gated.beaten_by ? (
            <>
              <div className="eyebrow" style={{ marginTop: 40 }}>
                Who beat you
              </div>
              <p className="beaten">
                <mark>{gated.beaten_by}</mark>
              </p>
            </>
          ) : null}

          {/* ---------------- step 7: the offer ---------------- */}
          <div className="offer">
            <p>That was one question and two engines.</p>
            <p>
              <strong>Word of Model</strong> runs five questions your buyers actually ask, across five AI platforms,
              every month, with the competitors ranked next to you and the three things to fix, in order.
            </p>
            <p>
              <strong>USD 249/mo.</strong> Founding rate USD 149/mo, first 20 subscribers, locked for 12 months.
            </p>
            <a className="button" href="#pricing">
              Start my first report
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
