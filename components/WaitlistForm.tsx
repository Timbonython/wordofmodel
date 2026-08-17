'use client';

import { useState } from 'react';

/**
 * Stands in for the onboarding wizard. No Stripe, no accounts, no dashboard: the
 * first twenty founding subscribers get worked through by hand.
 */
export function WaitlistForm({ source, cta = 'Start with a free scan' }: { source: string; cta?: string }) {
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
      <p className="waitlist-done">
        You are on the list. We open the founding rate in small batches, and you will get an email from a person, not a
        sequence.
      </p>
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
