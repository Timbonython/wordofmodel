/**
 * Can two people buy the last founding place at the same time?
 *
 *   npm run founding:race          five callers, one seat
 *   npm run founding:race -- 20    twenty callers, one seat
 *
 * The seat count is a parameter of claim_founding_seat, so this asks for a world with exactly
 * ONE place and fires N simultaneous claims at it. Exactly one may win. Anything else is a
 * discount given away, or two businesses told they hold the same seat.
 *
 * Why this cannot be checked by reading the code: the failure is a race, and the version this
 * replaced looked correct. It counted confirmed subscriptions, which are written by the webhook
 * after payment, so both callers read the same number and both were right at the moment they
 * read it. Only concurrency shows it.
 *
 * Creates throwaway accounts and deletes them, along with every claim it made. It touches no
 * subscription and no Stripe object.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const { db } = await import(join(here, '../lib/db.ts'));

const CALLERS = Number(process.argv[2] ?? 5);
const SEATS = 1;
const stamp = Date.now();

console.log(`${CALLERS} callers, ${SEATS} seat\n`);

const emails = Array.from({ length: CALLERS }, (_, i) => `race-${stamp}-${i}@example.invalid`);
const { data: accounts, error: accErr } = await db()
  .from('accounts')
  .insert(emails.map((email) => ({ email })))
  .select('id, email');
if (accErr) throw new Error(`Could not create the test accounts: ${accErr.message}`);

const expires = new Date(Date.now() + 30 * 60_000).toISOString();

try {
  const results = await Promise.all(
    accounts.map(async (a) => {
      const { data, error } = await db().rpc('claim_founding_seat', {
        p_account: a.id,
        p_expires: expires,
        p_seats: SEATS,
      });
      if (error) return { email: a.email, claim: null, error: error.message };
      return { email: a.email, claim: data ?? null, error: null };
    }),
  );

  const winners = results.filter((r) => r.claim);
  const failed = results.filter((r) => r.error);

  for (const r of results) {
    console.log(`  ${r.email.padEnd(40)} ${r.claim ? 'WON  ' + r.claim.slice(0, 8) : r.error ? 'ERROR ' + r.error : 'lost'}`);
  }

  console.log(`\n${winners.length} winner(s) of ${CALLERS} for ${SEATS} seat.`);
  if (failed.length) console.log(`${failed.length} caller(s) errored, which is neither a win nor a clean loss.`);

  const ok = winners.length === SEATS && failed.length === 0;
  console.log(ok ? 'PASS: exactly one claim survived.' : 'FAIL: the seat was not held atomically.');

  // A second claim by an account that already holds one must not consume another seat.
  if (winners.length === 1) {
    const holder = accounts.find((a) => a.email === winners[0].email);
    const { data: again } = await db().rpc('claim_founding_seat', {
      p_account: holder.id,
      p_expires: expires,
      p_seats: SEATS,
    });
    console.log(
      again
        ? 'PASS: the holder claiming again is still founding, and did not take a second seat.'
        : 'FAIL: an account that already holds a place was refused.',
    );
  }

  process.exitCode = ok ? 0 : 1;
} finally {
  const ids = accounts.map((a) => a.id);
  await db().from('founding_claims').delete().in('account_id', ids);
  await db().from('accounts').delete().in('id', ids);
  console.log('\ncleaned up the test accounts and their claims.');
}
