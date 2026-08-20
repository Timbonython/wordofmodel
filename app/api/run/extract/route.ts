/**
 * The extraction pass. Reads stored captures, writes interpretation, calls no engine.
 *
 * Separate from the run on purpose, and separately triggerable. An engine call costs money
 * and can never be reproduced; a parse can be re-run a hundred times, and will be - a
 * prompt change, a new competitor, a bug in the matcher. Nothing in here can cost a
 * capture.
 *
 * Safe to run twice: already-extracted captures are skipped unless force is set, and force
 * only ever re-reads rows that are already paid for.
 *
 *   curl -X POST $SITE/api/run/extract \
 *        -H "Authorization: Bearer $CRON_SECRET" \
 *        -H 'Content-Type: application/json' \
 *        -d '{"runId":"...","force":false}'
 */

import { authorised, unauthorised } from '@/lib/cron';
import { db } from '@/lib/db';
import { EXTRACTION_VERSION, extractCapture, writeExtraction, type CaptureToExtract } from '@/lib/extract';
import { getRunById } from '@/lib/run';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/** Four at a time: fast enough for 55 captures in a single invocation, gentle on the API. */
const CONCURRENCY = 4;

/** Leaves room for the slowest in-flight batch inside maxDuration. */
const BUDGET_MS = 240_000;

export async function POST(req: Request): Promise<Response> {
  if (!authorised(req)) return unauthorised();

  let body: { runId?: string; force?: boolean };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'expected a JSON body' }, { status: 400 });
  }
  if (!body.runId) return Response.json({ error: 'runId is required' }, { status: 400 });

  const run = await getRunById(body.runId);
  if (!run) return Response.json({ error: 'no such run' }, { status: 404 });

  const { data: scope, error: scopeErr } = await db()
    .from('scopes')
    .select('brand_name')
    .eq('id', run.scope_id)
    .single();
  if (scopeErr || !scope) {
    return Response.json({ error: `scope lookup failed: ${scopeErr?.message}` }, { status: 500 });
  }

  // The competitor set as it stands NOW. Delta reporting has to read added_at and
  // removed_at before calling any change a movement - a competitor configured in during
  // the period did not overtake anybody. That is 0002's warning and it is Session 4's job;
  // extraction just needs the live set to match against.
  const { data: comps } = await db()
    .from('competitors')
    .select('name')
    .eq('scope_id', run.scope_id)
    .is('removed_at', null);
  const competitors = (comps ?? []).map((c) => (c as { name: string }).name);

  const { data: questions } = await db()
    .from('questions')
    .select('id, text')
    .eq('scope_id', run.scope_id);
  const questionText = new Map(
    (questions ?? []).map((q) => [(q as { id: string }).id, (q as { text: string }).text]),
  );

  let query = db()
    .from('captures')
    .select('id, engine, outcome, answer_text, citations, question_id, extracted_at, extraction_version')
    .eq('run_id', run.id);
  if (!body.force) query = query.is('extracted_at', null);

  const { data: rows, error } = await query;
  if (error) return Response.json({ error: `capture lookup failed: ${error.message}` }, { status: 500 });

  const todo = (rows ?? []) as Array<CaptureToExtract & { extraction_version: number | null }>;
  const started = Date.now();
  const done: string[] = [];
  const failed: Array<{ id: string; reason: string }> = [];

  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    if (Date.now() - started > BUDGET_MS) break;
    const batch = todo.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (capture) => {
        try {
          const result = await extractCapture(
            capture,
            scope as { brand_name: string },
            competitors,
            questionText.get(capture.question_id) ?? '',
          );
          await writeExtraction(result);
          done.push(capture.id);
        } catch (err) {
          // Left unextracted deliberately. The next pass picks it up, and a capture with a
          // null extracted_at is visibly unfinished rather than quietly scored as a miss.
          failed.push({ id: capture.id, reason: err instanceof Error ? err.message : String(err) });
        }
      }),
    );
  }

  const { count: remaining } = await db()
    .from('captures')
    .select('*', { count: 'exact', head: true })
    .eq('run_id', run.id)
    .is('extracted_at', null);

  return Response.json({
    run: run.id,
    version: EXTRACTION_VERSION,
    considered: todo.length,
    extracted: done.length,
    failed,
    remaining: remaining ?? 0,
    ms: Date.now() - started,
  });
}
