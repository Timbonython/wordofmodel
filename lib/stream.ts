// Both halves of the protocol live here on purpose: the server emitter and the
// client reader have to agree, and they are easier to keep in step side by side.
import type { ScanEvent } from './types';

/**
 * NDJSON over a plain streaming response. Steps 2 to 4 are the show: the visitor
 * watches the site get read, the question get written and each engine report
 * back. A bare spinner for 45 seconds is the one thing the spec forbids.
 *
 * If the visitor closes the tab mid-scan, writes start failing but the generator
 * keeps running to completion so the answers already paid for still land in the
 * database.
 */
export function ndjson(producer: (emit: (event: ScanEvent) => void) => Promise<void>): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const emit = (event: ScanEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          open = false;
        }
      };

      try {
        await producer(emit);
      } catch (err) {
        emit({ type: 'error', message: err instanceof Error ? err.message : 'Something went wrong.' });
      } finally {
        if (open) {
          try {
            controller.close();
          } catch {
            /* already closed by the client */
          }
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      // Stops any proxy in front of this from buffering the progress away.
      'X-Accel-Buffering': 'no',
    },
  });
}

/** Client-side counterpart: read an NDJSON body line by line. */
export async function readNdjson(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: ScanEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        onEvent(JSON.parse(trimmed) as ScanEvent);
      } catch {
        /* a partial line is not an error worth surfacing */
      }
    }
  }
  const tail = buffer.trim();
  if (tail) {
    try {
      onEvent(JSON.parse(tail) as ScanEvent);
    } catch {
      /* ignore */
    }
  }
}
