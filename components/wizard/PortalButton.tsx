'use client';

import { useState } from 'react';

/**
 * Into the hosted Customer Portal. Card updates and cancellation, self serve, so
 * billing never lands on Tim.
 */
export default function PortalButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/billing/portal', { method: 'POST' });
      const json = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!r.ok || !json.url) throw new Error(json.error || 'Could not open the billing portal.');
      window.location.href = json.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the billing portal.');
      setBusy(false);
    }
  }

  return (
    <>
      <div className="wizard-actions">
        <button className="button" onClick={open} disabled={busy}>
          {busy ? 'Opening' : 'Update card or cancel'}
        </button>
      </div>
      <p className="note">
        Cancelling takes one click and stops the renewal. You keep the report you have already paid
        for.
      </p>
      {error && <p className="error">{error}</p>}
    </>
  );
}
