/**
 * Did the alerts actually land?
 *
 *   npm run alerts            the last 10
 *   npm run alerts -- 30      the last 30
 *
 * ops_alerts records what sendOpsAlert attempted. That answers "did we try", which is not
 * the question: Resend accepting a message and a mailbox receiving it are different events,
 * separated by seconds and sometimes by a 550. hello@wordofmodel.ai accepted-then-bounced
 * three times on 17 Aug 2026 and nothing in this build noticed, because nothing asked.
 *
 * So this takes each stored provider_message_id back to Resend and prints the delivery
 * event they have for it. A row that says `sent` and a Resend event that says `bounced` is
 * the exact pair that used to be invisible.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const { recentOpsAlerts } = await import(join(here, '../lib/billing-mail.ts'));

const limit = Number(process.argv[2] ?? 10);
const key = process.env.RESEND_API_KEY;

const alerts = await recentOpsAlerts(limit);
if (!alerts.length) {
  console.log('No alerts recorded. Either nothing has gone wrong, or 0011 is not applied yet.');
  process.exit(0);
}

console.log(`last ${alerts.length} alert attempt${alerts.length === 1 ? '' : 's'}\n`);

let unconfirmed = 0;
for (const a of alerts) {
  const when = new Date(a.created_at).toISOString().replace('T', ' ').slice(0, 19);
  let delivery = '';

  if (a.provider_message_id && key) {
    try {
      const res = await fetch(`https://api.resend.com/emails/${a.provider_message_id}`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      const body = await res.json();
      const event = body.last_event ?? 'unknown';
      delivery = `  resend: ${event}`;
      if (event !== 'delivered') unconfirmed++;
    } catch (err) {
      delivery = `  resend: could not ask (${err instanceof Error ? err.message : err})`;
      unconfirmed++;
    }
  } else if (a.status !== 'sent') {
    unconfirmed++;
  }

  console.log(`${when}  ${a.status.padEnd(10)} ${a.subject}`);
  if (a.recipient) console.log(`  to: ${a.recipient}`);
  if (a.error) console.log(`  error: ${a.error}`);
  if (delivery) console.log(delivery);
  console.log('');
}

console.log(
  unconfirmed
    ? `${unconfirmed} of ${alerts.length} not confirmed delivered. Anything not "delivered" reached nobody.`
    : `All ${alerts.length} confirmed delivered by Resend.`,
);
