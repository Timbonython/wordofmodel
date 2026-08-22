'use client';

import { useState } from 'react';
import { splitBold, stripMarkdown } from '@/lib/markup';
import type { FreeResult, GatedResult } from '@/lib/types';
import { AnswerExcerpt } from './AnswerExcerpt';
import { priceLabel, FOUNDING_SEATS_PUBLIC } from '@/lib/scope';

function Bolded({ text }: { text: string }) {
  return (
    <>
      {splitBold(text).map((part, i) => (part.bold ? <strong key={i}>{part.text}</strong> : <span key={i}>{part.text}</span>))}
    </>
  );
}

/**
 * The scan result, and the order is the whole design.
 *
 * IT WAS COMPREHENSIVE WHEN ITS JOB IS TO MAKE ONE POINT. Verdict, then both answers in full,
 * then every brand named, then every cited domain, then who beat you, and only then the offer:
 * several screens of reading before the one thing a visitor could act on. This is the moment
 * somebody is closest to buying, and it was being spent proving how thorough we are.
 *
 * Inverted. A one line verdict in plain words, one short quote as the evidence, the gap stated
 * honestly - two answers to one question, against twenty five answers to five questions every
 * month - and then the button. Everything else is still here, below, for the people who want
 * it, with the same button at the end.
 *
 * ONE CTA, TWICE, NOT THREE. A third button in the middle is the tell that a page is too long,
 * and the fix for that is cutting rather than another button.
 */
export function ScanResult({
  scanId,
  domain,
  question,
  free,
  cached,
  runAt,
  wizardLive = false,
  initialGated = null,
  initialBrandName,
}: {
  scanId: string;
  domain: string;
  question: string;
  free: FreeResult;
  cached: boolean;
  runAt: string;
  wizardLive?: boolean;
  /** Supplied by the permalink, which has already been through the email gate. */
  initialGated?: GatedResult | null;
  initialBrandName?: string;
}) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gated, setGated] = useState<GatedResult | null>(initialGated);
  const [brandName, setBrandName] = useState(initialBrandName ?? 'you');
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

  // One quote, chosen the same way every time rather than per render.
  const quote = (() => {
    if (!gated?.captures.length) return null;
    const pick =
      gated.captures.find((c) => c.recommended) ??
      gated.captures.find((c) => c.mentioned) ??
      gated.captures[0];
    if (!pick) return null;
    const clean = stripMarkdown(pick.answer).replace(/\s+/g, ' ').trim();
    const twoSentences = clean.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ');
    const text = twoSentences.length > 320 ? `${twoSentences.slice(0, 317)}...` : twoSentences;
    return { text, label: pick.engine_label, model: pick.model };
  })();

  const ctaHref = wizardLive ? `/start?scan=${scanId}` : '/#pricing';
  const ctaLabel = wizardLive ? 'Start my first report' : 'See the pricing';

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
          {/* Only for somebody who has just handed over an address. The permalink arrives here
              with the result already open and no email in play, and it used to render "a copy
              is on its way to ." with nothing after the "to". */}
          {email ? (
            !emailed ? (
              <p className="error">
                It is all here on screen, but our mail server would not take it just now. Nothing is lost.
              </p>
            ) : (
              <p className="note">
                A short summary is on its way to {email}, with a link back to this page. The link is the
                thing to forward: it stays current, and it is shorter than the email.
              </p>
            )
          ) : null}

          {/* THE EVIDENCE, THEN THE OFFER, BEFORE ANY OF THE DETAIL.
              One quote, picked deterministically: the engine that recommended them if one did,
              then one that merely named them, then whatever answered. */}
          {quote ? (
            <blockquote className="scan-quote">
              <p>{quote.text}</p>
              <cite>
                {quote.label}
                {quote.model ? `, ${quote.model}` : ''}
              </cite>
            </blockquote>
          ) : null}

          <div className="offer offer-top">
            <p className="gap">
              <strong>That was two answers to one question, once.</strong> Your report is twenty five
              answers to five questions, every month, with the companies that came up instead of you
              ranked beside you and what to do about it, in order.
            </p>
            <a className="button" href={ctaHref}>
              {ctaLabel}
            </a>
            <p className="note" style={{ marginTop: 10 }}>
              {priceLabel('founding_monthly')}/mo founding rate, first {FOUNDING_SEATS_PUBLIC} subscribers.
              Three minutes to set up, and your first report lands within 24 hours.
            </p>
          </div>

          <div className="eyebrow" style={{ marginTop: 44 }}>
            The rest of it

          </div>

          <div className="eyebrow" style={{ marginTop: 24 }}>
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

          {/* The same offer at the end, for the people who read to the end. Same label, same
              destination: two chances to act on one thing being offered. */}
          <div className="offer">
            <p>
              <strong>{priceLabel('standard_monthly')}/mo.</strong> Founding rate{' '}
              {priceLabel('founding_monthly')}/mo, first {FOUNDING_SEATS_PUBLIC} subscribers, locked for
              12 months. Cancel any time.
            </p>
            <a className="button" href={ctaHref}>
              {ctaLabel}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
