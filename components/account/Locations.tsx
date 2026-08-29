'use client';

import { useState } from 'react';
import { MAX_EXTRA_LOCATIONS, PRICE_USD } from '@/lib/scope';

export interface LocationRow {
  id: string;
  locality: string;
}

interface Preview {
  town: string;
  questions: { slot: string; text: string }[];
  perMonthUsd: number;
}

const money = (usd: number) => `US$${usd.toLocaleString('en-US')}`;

async function post<T>(body: unknown): Promise<T> {
  const r = await fetch('/api/account/locations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const out = (await r.json()) as T & { error?: string };
  if (!r.ok) throw new Error(out.error ?? 'That did not work. Try again.');
  return out;
}

/**
 * Towns on a live subscription, and the two operations on them.
 *
 * THE PREVIEW IS NOT A NICETY. A subscriber approved five questions about one town, and the
 * approval gate is what this product is sold on. Charging them for a second town without
 * showing the five questions as they will actually be asked would be exactly the thing the
 * whole feature was built to avoid: paying for output nobody has seen. So `add` is two steps
 * and the first one writes nothing.
 *
 * It is also the validation. Every refusal the charge can hit - no town in the questions, a
 * duplicate, the cap, a question that names no place - is raised by the preview, before any
 * money moves.
 */
export function Locations({ mainTown, initial }: { mainTown: string | null; initial: LocationRow[] }) {
  const [rows, setRows] = useState<LocationRow[]>(initial);
  const [town, setTown] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!mainTown) {
    return (
      <div className="locations-panel">
        <h3>Locations</h3>
        <p className="note">
          Your questions are written for a whole country rather than a town, so there is no place
          in them to swap. Reply to your last report and we will set a second location up by hand.
        </p>
      </div>
    );
  }

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="locations-panel">
      <h3>Locations</h3>
      <ul className="locations-list">
        <li className="locations-item">
          <span className="locations-name">{mainTown}</span>
          <span className="locations-tag">included</span>
        </li>
        {rows.map((r) => (
          <li className="locations-item" key={r.id}>
            <span className="locations-name">{r.locality}</span>
            {/* price-door: no purchase path - what they already pay for a town they already have */}
            <span className="locations-tag">{money(PRICE_USD.location_monthly)} a month</span>
            <button
              type="button"
              className="linklike"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const out = await post<{ locations: LocationRow[] }>({ action: 'remove', locationId: r.id });
                  setRows(out.locations);
                })
              }
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      {rows.length >= MAX_EXTRA_LOCATIONS ? (
        <p className="note">
          That is the most we set up from this page. Reply to your last report for more.
        </p>
      ) : !preview ? (
        <div className="wizard-row">
          <input
            className="field"
            value={town}
            placeholder="Another town"
            disabled={busy}
            onChange={(e) => setTown(e.target.value)}
          />
          <button
            type="button"
            className="wizard-add"
            disabled={busy || !town.trim()}
            onClick={() => run(async () => setPreview(await post<Preview>({ action: 'preview', town })))}
          >
            {busy ? 'Checking' : 'See the questions'}
          </button>
        </div>
      ) : (
        <div className="locations-preview">
          <p className="note">
            These are your same five questions, asked about {preview.town}. Nothing has been
            charged yet.
          </p>
          <ol className="locations-questions">
            {preview.questions.map((q) => (
              <li className="locations-question" key={q.slot}>
                {q.text}
              </li>
            ))}
          </ol>
          <div className="wizard-actions">
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const out = await post<{ locations: LocationRow[] }>({ action: 'add', town: preview.town });
                  setRows(out.locations);
                  setPreview(null);
                  setTown('');
                })
              }
            >
              {/* price-door: button */}
              {busy ? 'Adding' : `Add ${preview.town} for ${money(preview.perMonthUsd)} a month`}
            </button>
            <button type="button" className="linklike" disabled={busy} onClick={() => setPreview(null)}>
              Not yet
            </button>
          </div>
          <p className="note">
            Added to your next invoice, worked out from the days left in this period. Your first
            report for {preview.town} arrives within the hour.
          </p>
        </div>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
}
