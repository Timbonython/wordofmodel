/**
 * One fetch, with a deadline and an error taxonomy.
 *
 * Every surface gets the same treatment so the runner can tell a rate limit from a
 * refusal without knowing whose API it just called. The distinction is not cosmetic:
 * a retryable failure goes back in the queue with backoff, a permanent one stops and
 * says why, and getting that backwards either burns money in a loop or throws away a
 * capture that would have worked on the second try.
 */

import 'server-only';
import { CaptureError, httpError, transportError } from '../provenance';

export async function postJson<T>(
  url: string,
  init: { headers: Record<string, string>; body: unknown },
  timeoutMs: number,
  surfaceLabel: string,
): Promise<T> {
  return request<T>(url, { method: 'POST', ...init }, timeoutMs, surfaceLabel);
}

export async function getJson<T>(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
  surfaceLabel: string,
): Promise<T> {
  return request<T>(url, { method: 'GET', headers }, timeoutMs, surfaceLabel);
}

async function request<T>(
  url: string,
  init: { method: string; headers: Record<string, string>; body?: unknown },
  timeoutMs: number,
  surfaceLabel: string,
): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method,
      headers: { 'Content-Type': 'application/json', ...init.headers },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: ctl.signal,
    });
  } catch (err) {
    throw transportError(surfaceLabel, err);
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // A body that is not JSON is almost always an HTML error page from a proxy or a
    // CDN. Worth surfacing a slice of it: "Unexpected token <" tells nobody anything.
    throw new CaptureError(
      `${surfaceLabel} returned ${res.status} with a non-JSON body: ${text.slice(0, 200)}`,
      res.ok ? 'retryable' : classify(res.status),
      res.status,
    );
  }

  if (!res.ok) {
    throw httpError(surfaceLabel, res.status, messageFrom(parsed));
  }
  return parsed as T;
}

function classify(status: number): 'retryable' | 'permanent' {
  return status === 429 || status >= 500 ? 'retryable' : 'permanent';
}

/** Pull whatever the provider called the error message out of its own envelope. */
function messageFrom(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const b = body as Record<string, unknown>;
  const err = b.error;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const m = (err as Record<string, unknown>).message;
    if (typeof m === 'string') return m;
  }
  if (typeof b.status_message === 'string') return b.status_message;
  if (typeof b.message === 'string') return b.message;
  return undefined;
}
