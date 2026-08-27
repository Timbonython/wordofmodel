import { attachEmail, getScan, markEmailed } from '@/lib/db';
import { validEmail } from '@/lib/email';
import { sendScanEmail } from '@/lib/mail';
import {
  checkEmailRateLimit,
  checkRateLimit,
  clientIp,
  hashEmail,
  hashIp,
  recordAttempt,
  recordEmailAttempt,
} from '@/lib/ratelimit';
import { buildGated } from '@/lib/verdict';
import type { Capture } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Step 6, the gate.
 *
 * The verbatim answers, the full brand list and the cited domains are never part
 * of the scan response. They are assembled here, after an address is captured.
 * Sending them earlier and hiding them in the client would put the whole reveal
 * one devtools tab away, and the gate is what the growth model runs on.
 *
 * Delivered to the screen and emailed, because the emailed version is what gets
 * forwarded internally.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { scanId?: string; email?: string };
  const email = validEmail(body.email ?? '');
  const scanId = body.scanId?.trim();

  if (!scanId) return Response.json({ error: 'We lost track of that scan. Run it again.' }, { status: 400 });
  if (!email) return Response.json({ error: 'That address does not look right.' }, { status: 400 });

  const ipHash = hashIp(clientIp(request.headers));
  const limit = await checkRateLimit(ipHash, 'reveal');
  if (!limit.ok) return Response.json({ error: limit.message }, { status: 429 });

  // Per address as well as per IP. This one sends an email on every success, so an address
  // submitted over and over is the shape that turns our sending domain into a complaint,
  // and it is not bounded by an IP limit when the requests come from many of them.
  const emailHash = hashEmail(email);
  const perEmail = await checkEmailRateLimit(emailHash, 'reveal');
  if (!perEmail.ok) return Response.json({ error: perEmail.message }, { status: 429 });

  const scan = await getScan(scanId);
  if (!scan || scan.status !== 'complete' || !scan.captures || !scan.result || !scan.question) {
    return Response.json({ error: 'That scan is not ready yet.' }, { status: 404 });
  }

  await recordAttempt(ipHash, 'reveal');
  await recordEmailAttempt(emailHash, 'reveal');
  await attachEmail(scanId, email);

  const brandName = scan.brand_name ?? scan.domain;
  const gated = buildGated(brandName, scan.captures as Capture[]);
  const runAt = scan.completed_at ?? scan.created_at;

  // The reveal is on screen whether or not the mail server cooperates. A Resend
  // outage must not cost the visitor the thing they just gave an address for.
  let emailed = true;
  try {
    // The email carries the verdict and two links, not the scan itself. The result has a URL
    // now, so a copy pasted into a message would be a second version of it going stale.
    await sendScanEmail({
      to: email,
      scanId,
      brandName,
      domain: scan.domain,
      question: scan.question,
      free: scan.result,
      runAt,
    });
    await markEmailed(scanId);
  } catch (err) {
    emailed = false;
    console.error('scan email failed', { scanId, message: err instanceof Error ? err.message : 'unknown' });
  }

  return Response.json({ gated, emailed, brandName, runAt });
}
