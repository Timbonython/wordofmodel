'use client';

import { useEffect, useRef, useState } from 'react';
import { REVIEW_MAX, reviewProblem, type Platform } from '@/lib/review-text';

/**
 * The review form, and the hand-off afterwards.
 *
 * THE ONLY JAVASCRIPT ON THE PAGE. Everything around it is server rendered, and the reviews the
 * site displays are rendered server side too - a testimonial that needs a script to appear is
 * invisible to the crawlers and language models this whole feature exists to reach.
 *
 * Under two minutes is the target: five fields, three of them optional, and a star row you can
 * hit with a thumb. No captcha - see the route for what stands in for one.
 */
export function ReviewForm({ platforms }: { platforms: Platform[] }) {
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [firstName, setFirstName] = useState('');
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState(''); // honeypot
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ id: string; platforms: Platform[] } | null>(null);
  const [copied, setCopied] = useState(false);
  const [clicked, setClicked] = useState<Set<string>>(new Set());

  const startedAt = useRef<number>(0);
  const announced = useRef(false);

  useEffect(() => {
    startedAt.current = Date.now();
    void fetch('/api/review/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'review_form_view' }),
    }).catch(() => {});
  }, []);

  /** Once, on the first thing they actually do. */
  function noteStarted() {
    if (announced.current) return;
    announced.current = true;
    void fetch('/api/review/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'review_form_started' }),
    }).catch(() => {});
  }

  async function submit() {
    setError(null);
    const problem = reviewProblem({ rating, reviewText, firstName, location, category });
    if (problem) return setError(problem);
    if (!consent) return setError('We need your permission to publish it.');

    setBusy(true);
    try {
      const r = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating, reviewText, firstName, location, category, consent, website,
          elapsedMs: Date.now() - startedAt.current,
        }),
      });
      const out = (await r.json()) as { ok?: boolean; id?: string; platforms?: Platform[]; error?: string };
      if (!r.ok) throw new Error(out.error ?? 'That did not go through.');
      setSent({ id: out.id ?? '', platforms: out.platforms ?? platforms });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not go through.');
    } finally {
      setBusy(false);
    }
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(reviewText.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  function openPlatform(p: Platform) {
    void fetch('/api/review/external', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: sent?.id, platform: p.key }),
    }).catch(() => {});
    setClicked((s) => new Set(s).add(p.key));
    void copyText();
    window.open(p.url ?? '#', '_blank', 'noopener,noreferrer');
  }

  if (sent) {
    return (
      <div className="review-done">
        <div className="eyebrow">Thank you</div>
        <h1>That is with us.</h1>
        <p className="lede">
          A person reads every one before it goes on the site, so it will not appear straight
          away. We do not edit what you said beyond an obvious typo.
        </p>

        {sent.platforms.length > 0 ? (
          <div className="review-share">
            <h2>Would you post it publicly too?</h2>
            <p>
              Entirely up to you, and it makes no difference to whether we publish yours. Your
              words get copied, then the site opens in a new tab for you to paste.
            </p>
            <div className="review-quote">{reviewText.trim()}</div>
            <button type="button" className="wizard-add" onClick={copyText}>
              {copied ? 'Copied' : 'Copy my review'}
            </button>
            <ul className="review-platforms">
              {sent.platforms.map((p) => (
                <li className="review-platform" key={p.key}>
                  <button type="button" className="button" onClick={() => openPlatform(p)}>
                    {clicked.has(p.key) ? `Opened ${p.label}` : `Post on ${p.label}`}
                  </button>
                  <span className="review-platform-hint">{p.hint}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="wizard-note">
          <a href="/">Back to Word of Model</a>
        </p>
      </div>
    );
  }

  return (
    <div className="review-form">
      <fieldset className="review-stars">
        <legend className="k">Your rating</legend>
        <div className="review-star-row">
          {[1, 2, 3, 4, 5].map((n) => (
            <label className="review-star" key={n}>
              <input
                type="radio"
                name="rating"
                value={n}
                checked={rating === n}
                onChange={() => { setRating(n); noteStarted(); }}
                className="visually-hidden"
              />
              <span aria-hidden="true" className={n <= rating ? 'review-star-on' : 'review-star-off'}>
                ★
              </span>
              <span className="visually-hidden">{n} star{n === 1 ? '' : 's'}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="wizard-field">
        <span className="k">What would you tell someone considering it?</span>
        <span className="h">Plain words are better than polished ones. A few sentences is plenty.</span>
        <textarea
          className="field review-textarea"
          rows={6}
          maxLength={REVIEW_MAX}
          value={reviewText}
          onChange={(e) => { setReviewText(e.target.value); noteStarted(); }}
        />
      </label>

      <label className="wizard-field">
        <span className="k">First name</span>
        <span className="h">First name only. We never publish a surname or your company.</span>
        <input className="field" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
      </label>

      <div className="review-pair">
        <label className="wizard-field">
          <span className="k">What you do</span>
          <span className="h">Optional. &ldquo;Dentist&rdquo;, &ldquo;eSIM&rdquo;, &ldquo;accountant&rdquo;</span>
          <input className="field" value={category} onChange={(e) => setCategory(e.target.value)} />
        </label>
        <label className="wizard-field">
          <span className="k">Where</span>
          <span className="h">Optional. A town or a country</span>
          <input className="field" value={location} onChange={(e) => setLocation(e.target.value)} />
        </label>
      </div>

      {/* The honeypot. Off-screen rather than display:none, which some bots check for, and
          aria-hidden plus tabIndex so nobody using a keyboard or a screen reader ever meets it. */}
      <div className="review-hp" aria-hidden="true">
        <label htmlFor="review-website">Website</label>
        <input
          id="review-website"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      <label className="review-consent">
        <input
          className="review-consent-box"
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        <span className="review-consent-text">
          Publish this on the site with my first name{category.trim() ? `, ${category.trim()}` : ''}
          {location.trim() ? ` and ${location.trim()}` : ''}. I can ask you to take it down at any
          time by replying to any email from us.
        </span>
      </label>

      {error && <p className="error">{error}</p>}

      <div className="wizard-actions">
        <button type="button" className="button" onClick={submit} disabled={busy}>
          {busy ? 'Sending' : 'Send it'}
        </button>
      </div>
    </div>
  );
}
