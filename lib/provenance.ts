/**
 * Provenance is recorded, not assumed.
 *
 * Every check in here answers the same question in a different costume: is the thing
 * we are about to file under a surface's name actually that surface's answer? The one
 * substitution this product cannot make is running a different system and calling it
 * ChatGPT, or Gemini, or Perplexity. That is why Claude and Copilot are browser-only,
 * and it is why a 200 from an API is not, on its own, evidence of anything.
 *
 * Three distinct failures live here, and each was found by calling a real API:
 *
 *   1. VENDOR SUBSTITUTION. The Perplexity Agent API is model agnostic and fronts
 *      OpenAI, Anthropic, Google and xAI. lib/env.ts already refuses to SEND a
 *      non-Sonar model, but nothing checked what came BACK, which is the half that
 *      matters.
 *   2. VERSION DRIFT vs SUBSTITUTION. OpenAI answers a request for gpt-5.5 with
 *      gpt-5.5-2026-xx-xx. Gemini's modelVersion is often more specific than the id
 *      asked for. Strict equality would fail every capture on day one, so the rule is
 *      a family match - which is what "did we get the model we pinned" actually means.
 *   3. SILENT UNGROUNDING. gemini-3.6-flash returns 200 with a fluent answer and no
 *      groundingMetadata at all: it ignored the search tool and recited training data.
 *      The free scan spec documents the same failure for Sonar. An answer from memory
 *      is not a measurement of what a buyer searching today would see.
 */

import 'server-only';

/**
 * Whether a failure is worth trying again.
 *
 * retryable  rate limit, timeout, 5xx, network. The surface would probably have
 *            answered; the attempt was unlucky.
 * permanent  auth, bad request, a refusal, or any provenance failure. Trying again
 *            cannot change the answer. A model mismatch is permanent on purpose: if
 *            Perplexity routed to someone else's model, a retry does not make the
 *            result a Perplexity answer.
 */
export type ErrorKind = 'retryable' | 'permanent';

export class CaptureError extends Error {
  readonly kind: ErrorKind;
  readonly status: number | null;

  constructor(message: string, kind: ErrorKind, status: number | null = null) {
    super(message);
    this.name = 'CaptureError';
    this.kind = kind;
    this.status = status;
  }
}

/** Classify an HTTP status from any of the five surfaces. */
export function kindForStatus(status: number): ErrorKind {
  if (status === 408 || status === 409 || status === 425 || status === 429) return 'retryable';
  if (status >= 500) return 'retryable';
  return 'permanent';
}

export function httpError(surfaceLabel: string, status: number, detail?: string): CaptureError {
  return new CaptureError(
    `${surfaceLabel} returned ${status}${detail ? `: ${detail}` : ''}`,
    kindForStatus(status),
    status,
  );
}

/** A timeout or a socket failure. Always worth another go. */
export function transportError(surfaceLabel: string, err: unknown): CaptureError {
  const msg = err instanceof Error ? err.message : String(err);
  if (err instanceof Error && (err.name === 'AbortError' || /aborted|timeout/i.test(msg))) {
    return new CaptureError(`${surfaceLabel} took too long to answer`, 'retryable');
  }
  return new CaptureError(`${surfaceLabel} could not be reached: ${msg}`, 'retryable');
}

/**
 * The model we pinned, or a more specific version of it, and nothing else.
 *
 * A provider is allowed to be more precise than the pin - gpt-5.5 answering as
 * gpt-5.5-2026-03-01 is the same model, dated. It is not allowed to be a different
 * model. The separator check is what stops "gpt-5" matching "gpt-5.5": a suffix only
 * counts if it begins with a version separator.
 *
 * A missing model in the response is a failure, not a pass. "The provider did not say"
 * cannot be recorded as "the provider confirmed", or the method note is a guess with a
 * confident font.
 */
export function assertModelFamily(surfaceLabel: string, pinned: string, returned: unknown): string {
  if (typeof returned !== 'string' || !returned.trim()) {
    throw new CaptureError(
      `${surfaceLabel} did not report which model answered. Provenance cannot be assumed, ` +
        `so this is a failed capture rather than one attributed on trust.`,
      'permanent',
    );
  }

  const got = returned.trim();
  if (got === pinned) return got;
  if (got.startsWith(pinned) && /^[-@:.]/.test(got.slice(pinned.length))) return got;

  throw new CaptureError(
    `${surfaceLabel} answered with "${got}" but we pinned "${pinned}". A surface is only ` +
      `ever recorded from itself, so this is a failed capture, not a successful one.`,
    'permanent',
  );
}

/**
 * Perplexity is a different check in kind, and it is the reason this module exists.
 *
 * The risk is not a version bump, it is the Agent API routing to another vendor
 * entirely. So the family is the vendor's own Sonar line: perplexity/sonar and its
 * variants pass, anything else - including a model Perplexity merely hosts - does not.
 * An answer from Anthropic's model served through Perplexity is not a Perplexity
 * answer, and the methodology depends on it being one.
 */
export function assertSonarResponse(returned: unknown): string {
  if (typeof returned !== 'string' || !returned.trim()) {
    throw new CaptureError(
      'Perplexity did not report which model answered. The Agent API is model agnostic, ' +
        'so an unreported model is exactly the case that cannot be trusted.',
      'permanent',
    );
  }

  const got = returned.trim();
  if (got === 'perplexity/sonar' || got.startsWith('perplexity/sonar')) return got;

  throw new CaptureError(
    `Perplexity answered with "${got}". The Agent API fronts OpenAI, Anthropic, Google ` +
      `and xAI, and an answer from any of those is not a Perplexity answer. Failed capture.`,
    'permanent',
  );
}

/**
 * Did the surface actually search?
 *
 * Grounding is not optional for this product. The whole claim is that we report what
 * an assistant tells a buyer looking today, and a model answering from training data
 * is answering about a market that may be two years stale.
 *
 * This does NOT throw, and that is deliberate. "Gemini answered this one without
 * searching" is a true and interesting fact about the surface, and throwing it away
 * would be its own kind of dishonesty. It is recorded on captures.grounded, retried
 * once in case the model's choice was incidental, and if it persists the method note
 * says so. What must never happen is a memory answer and a searched answer being
 * averaged together and the result called a measurement.
 */
export function groundingOf(chunks: unknown, queries: unknown): boolean {
  const hasChunks = Array.isArray(chunks) && chunks.length > 0;
  const hasQueries = Array.isArray(queries) && queries.length > 0;
  return hasChunks || hasQueries;
}
