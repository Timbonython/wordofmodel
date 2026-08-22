'use client';

import { useState } from 'react';

/**
 * The secondary path: somebody who is not buying today, but will hear from us.
 *
 * NO RENDERED STATE MAY BE A DEAD END. The confirmation used to be a paragraph and nothing
 * else, so a visitor arriving from the waitlist email hit "You are on the list" with nothing
 * to click and no way to buy. Absence is a value in this build and it has to render as itself;
 * the same rule applies to a UI state. `buyHref` is therefore not optional decoration - it is
 * how the done state keeps an action in it.
 */
export function WaitlistForm({
  source,
  cta = 'Email me when a place opens',
  buyHref,
  buyLabel = 'Set up my report now',
}: {
  source: string;
  cta?: string;
  buyHref?: string;
  buyLabel?: string;
}) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setState('busy');
    setError(null);
    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source }),
      });
      const body = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !body.ok) throw new Error(body.error || 'That did not work. Try again.');
      setState('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work. Try again.');
      setState('idle');
    }
  }

  if (state === 'done') {
    return (
      <div className="waitlist-done">
        <p>You are on the list, and a person will email you rather than a sequence.</p>
        {buyHref ? (
          <p>
            <a className="button" href={buyHref}>
              {buyLabel}
            </a>
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form className="inline-form" onSubmit={submit}>
      <label className="visually-hidden" htmlFor={`waitlist-${source}`}>
        Your email address
      </label>
      <input
        id={`waitlist-${source}`}
        className="field"
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        placeholder="you@company.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={state === 'busy'}
      />
      <button className="button" type="submit" disabled={state === 'busy' || !email}>
        {state === 'busy' ? 'One moment' : cta}
      </button>
      {error ? <p className="error">{error}</p> : null}
    </form>
  );
}
