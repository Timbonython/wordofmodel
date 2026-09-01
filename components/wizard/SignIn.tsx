'use client';

import { useState } from 'react';

/** Magic link request. Always the same answer, whether or not the address exists. */
export default function SignIn() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, next: '/account' }),
      });
      const json = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(json.error || 'Could not send that link.');
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send that link.');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return <p className="punch">Check your inbox. The link signs you straight in.</p>;
  }

  return (
    <>
      <div className="inline-form">
        <input
          className="field"
          type="email"
          data-clarity-mask="true"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && email.trim() && !busy) send();
          }}
          disabled={busy}
        />
        <button className="button" onClick={send} disabled={busy || !email.trim()}>
          {busy ? 'Sending' : 'Email me a link'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </>
  );
}
