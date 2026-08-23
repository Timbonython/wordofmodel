/**
 * Put a lost capture back in the queue so a partial run can finish.
 *
 *   npm run requeue                 report what is missing from the newest run
 *   npm run requeue -- --fix        requeue it and reopen the run
 *   npm run requeue -- <runId> --fix
 *
 * A run goes `partial` when a capture never landed, and a partial run does not ship. The
 * repair is to run the missing capture, not to hand-write a row: a capture with no provenance
 * behind it is worse than a partial run, because the run at least knows it is incomplete.
 *
 * TWO THINGS HAVE TO BE RESET, AND BOTH ARE EASY TO MISS. Found the hard way on 23 Aug 2026,
 * recovering Grok's situation capture on Zapme's August run.
 *
 *   next_attempt_at   The claim predicate in 0006 is `next_attempt_at <= now()`. The backoff
 *                     written when the last attempt failed is still in the future, so a job
 *                     set back to pending is pending and unclaimable, and the tick reports
 *                     "idle" while the work sits right there.
 *
 *   completed_at      settle_run's first line is "if completed_at is not null then return".
 *                     That is its idempotency guard: a settled run is settled and nothing
 *                     re-decides it. Reopen without clearing it and the sweeper finds the run,
 *                     finds no open jobs, calls settle_run, gets nothing back, and reports
 *                     settled: [] forever while the run sits at running.
 *
 * After --fix, do nothing. The five minute sweep kicks a tick chain, the capture runs, the
 * sweep after that settles the run and fires extraction. Roughly ten minutes, no babysitting.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const { db } = await import(join(here, '../lib/db.ts'));

const args = process.argv.slice(2);
const fix = args.includes('--fix');
const runArg = args.find((a) => !a.startsWith('--')) ?? null;

const { data: runs, error } = runArg
  ? await db().from('runs').select('*').eq('id', runArg)
  : await db().from('runs').select('*').order('period_start', { ascending: false }).limit(1);
if (error) throw new Error(error.message);
const run = runs?.[0];
if (!run) {
  console.log('no such run');
  process.exit(1);
}

const { data: qs } = await db().from('questions').select('id, slot').eq('scope_id', run.scope_id);
const slot = new Map((qs ?? []).map((q) => [q.id, q.slot]));

const { data: caps } = await db().from('captures').select('engine, question_id, sample').eq('run_id', run.id);
const have = new Set((caps ?? []).map((c) => `${c.engine}:${c.question_id}:${c.sample}`));

const { data: jobs } = await db()
  .from('capture_jobs')
  .select('id, engine, question_id, sample, status, attempts, error')
  .eq('run_id', run.id);

const missing = (jobs ?? []).filter((j) => !have.has(`${j.engine}:${j.question_id}:${j.sample}`));

console.log(`run ${run.id.slice(0, 8)}  ${run.status}  ${run.period_start}`);
console.log(`captures ${(caps ?? []).length} of ${run.captures_expected}\n`);

if (!missing.length) {
  console.log('Nothing missing. Every capture this run expected is on the record.');
  process.exit(0);
}

for (const j of missing) {
  console.log(`missing: ${j.engine} / ${slot.get(j.question_id) ?? 'unknown slot'} / sample ${j.sample}`);
  console.log(`  job ${j.id.slice(0, 8)}  ${j.status}  ${j.attempts} attempts`);
  if (j.error) console.log(`  last error: ${j.error}`);
}

if (!fix) {
  console.log('\nReport only. Add --fix to requeue these and reopen the run.');
  process.exit(0);
}

const { error: jobErr } = await db()
  .from('capture_jobs')
  .update({
    status: 'pending',
    attempts: 0,
    worker_id: null,
    claimed_at: null,
    error: null,
    error_kind: null,
    next_attempt_at: new Date().toISOString(),
  })
  .in(
    'id',
    missing.map((j) => j.id),
  );
if (jobErr) throw new Error(`Could not requeue: ${jobErr.message}`);

const { error: runErr } = await db()
  .from('runs')
  .update({ status: 'running', completed_at: null, failure_reason: null, alerted_at: null })
  .eq('id', run.id);
if (runErr) throw new Error(`Could not reopen the run: ${runErr.message}`);

console.log(`\nRequeued ${missing.length} and reopened the run.`);
console.log('The sweep will capture it within five minutes and settle the run in the pass after.');
console.log('Watch it with: npm run requeue -- ' + run.id);
