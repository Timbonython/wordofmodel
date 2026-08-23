/**
 * The hosted report. One run, one page, rendered from the record.
 *
 * A ROUTE HANDLER RATHER THAN A PAGE, because the report is a whole document - its own
 * doctype, its own stylesheet, its own masthead - and it has to be byte-identical to the
 * thing that arrives by email. Rendering it inside the site layout would nest one document
 * in another and put the marketing nav around a subscriber's private numbers.
 *
 * WHAT IS BEHIND THE LOGIN AND WHY THE EMAIL IS NOT. The email carries the whole report
 * except the verbatim answers, because it is meant to be forwarded to a colleague who has
 * no account and never will. This page carries the answers, and answers are the raw
 * material of the thing they pay for: a link that leaked would hand over a subscriber's
 * entire competitive position. So it is authenticated, per account, every time.
 */

import { getCurrentAccount } from '@/lib/auth';
import { db } from '@/lib/db';
import { getRunById } from '@/lib/run';
import { attachDelta, buildReport } from '@/lib/report';
import { renderReport } from '@/lib/report-html';
import { asIssued, saveReport } from '@/lib/reports';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

const HTML = { 'content-type': 'text/html; charset=utf-8' };

/**
 * Private, never stored, never indexed. A shared computer with a warm back button is the
 * ordinary case; a search engine holding a subscriber's Share of Model is not recoverable.
 */
const SECURITY = {
  'cache-control': 'private, no-store, max-age=0',
  'x-robots-tag': 'noindex, nofollow, noarchive',
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> },
): Promise<Response> {
  const { runId } = await params;

  const account = await getCurrentAccount();
  if (!account) {
    return new Response(notice('Sign in to read this report', signInBody()), {
      status: 401,
      headers: { ...HTML, ...SECURITY },
    });
  }

  const run = await getRunById(runId);
  if (!run) return new Response(notice('No such report', missingBody()), { status: 404, headers: { ...HTML, ...SECURITY } });

  // Ownership, checked against the scope rather than trusted from the URL. A run id is a
  // uuid and unguessable, which is not the same as private. 404 rather than 403: whether a
  // run exists is itself somebody else's business.
  const { data: scope } = await db()
    .from('scopes')
    .select('id, account_id')
    .eq('id', run.scope_id)
    .maybeSingle();
  if (!scope || (scope as { account_id: string }).account_id !== account.id) {
    return new Response(notice('No such report', missingBody()), { status: 404, headers: { ...HTML, ...SECURITY } });
  }

  // A report that has never been rendered is written down on the way past. The subscriber
  // opening the page before the send job runs must not produce a different set of figures
  // from the one the email will carry, and saveReport plus asIssued is what guarantees
  // they are the same report whichever of the two happens first.
  const rebuilt = await attachDelta(await buildReport(run), run);
  const row = await saveReport(rebuilt, run);
  const report = await asIssued(rebuilt, row);

  return new Response(renderReport(report), { headers: { ...HTML, ...SECURITY } });
}

/** A whole page for two sentences, because the report is a whole document and this replaces it. */
function notice(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Word of Model - ${title}</title>
<style>
  body{margin:0;background:#F7F6F2;color:#15171C;font-family:"IBM Plex Sans",system-ui,sans-serif;
    display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}
  .box{max-width:34rem}
  .wordmark{font-family:"IBM Plex Sans Condensed","IBM Plex Sans",sans-serif;font-weight:700;font-size:15px;
    letter-spacing:.16em;text-transform:uppercase;margin-bottom:28px}
  .wordmark span{color:#8E9199}
  h1{font-size:30px;line-height:1.2;margin:0 0 14px}
  p{color:#5C5F68;line-height:1.65;margin:0 0 18px}
  a.cta{display:inline-block;background:#15171C;color:#F7F6F2;text-decoration:none;
    font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:13px;letter-spacing:.06em;padding:13px 22px}
</style>
</head>
<body>
  <div class="box">
    <div class="wordmark">Word of Model<span>.ai</span></div>
    <h1>${title}</h1>
    ${body}
  </div>
</body>
</html>`;
}

function signInBody(): string {
  return `<p>This report is private to the account it belongs to. Sign in with your email and open this link again.</p>
    <p><a class="cta" href="${env.siteUrl}/account">Sign in</a></p>`;
}

function missingBody(): string {
  // The likeliest cause by a distance is being signed in as the wrong address: a magic link
  // signs you in on the device that opened it and keeps you there. Saying so, and pointing at
  // the page that now names the address and offers a way out, is more useful than "does not
  // exist".
  return `<p>This report either does not exist, or it belongs to a different address from the one you are signed in as. That is the usual reason: a sign-in link keeps you signed in on whichever device opened it.</p>
    <p>Your account page shows which address that is, and lets you sign out and back in as another.</p>
    <p><a class="cta" href="${env.siteUrl}/account">Check which address I am signed in as</a></p>`;
}
