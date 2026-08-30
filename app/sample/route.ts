import { env } from '@/lib/env';
import { getRunById } from '@/lib/run';
import { attachDelta, buildReport } from '@/lib/report';
import { asIssued, saveReport } from '@/lib/reports';
import { renderReport } from '@/lib/report-html';
import { SAMPLE_REPORT } from '@/lib/sample-report';
import { reviewsLive } from '@/lib/reviews';

/**
 * The sample report. §3 of the brand brief.
 *
 * A REAL REPORT ON A REAL BUSINESS, PUBLISHED IN FULL. Not a mockup, not blurred, not gated.
 * It is the answer to "it looks like nobody is home", and it is a better answer than any
 * scarcity line because it is evidence rather than implication: it shows the buyer exactly
 * what arrives, on a category they can judge, and it is the page a curious person forwards.
 *
 * TWO SOURCES, AND THE REAL ONE ALWAYS WINS.
 *
 *   SAMPLE_RUN_ID set    a real report for that run, rendered by the same function subscribers
 *                        get. This is the destination: a consenting customer's actual report.
 *   unset                the specimen in lib/sample-report.ts - a wholly invented dental
 *                        practice, labelled as such on every screen.
 *
 * NO REAL BUSINESS IS PUBLISHED WITHOUT BEING NAMED HERE ON PURPOSE. Exactly one real run
 * exists and it belongs to somebody who was never asked, so it is not the fallback and cannot
 * become one by accident: the fallback is synthetic, and the only way a real company reaches
 * this page is somebody deliberately setting an environment variable to their run id.
 *
 * A configured-but-broken id serves the specimen rather than nothing, because a sample page
 * that vanishes on a typo takes the nav link with it. The error is logged loudly.
 *
 * PUBLIC AND INDEXABLE, unlike /report/[runId], which is private to its account. That is the
 * whole point of this page, so the headers are deliberately the opposite of that route's.
 */
export const dynamic = 'force-dynamic';

const HTML = { 'content-type': 'text/html; charset=utf-8' };

/**
 * THIS ROUTE, NOT THE SPECIMEN FLAG, DECIDES WHETHER THE WAY OUT IS SHOWN.
 *
 * They are different questions. `specimen` means invented data; this means "a stranger is
 * reading it and has no other way into the site". Setting SAMPLE_RUN_ID publishes a REAL report
 * here, which is not a specimen and still needs the closing block - so collapsing the two would
 * silently drop it on the day this page starts showing a real customer.
 */
const SAMPLE = { publicSample: true } as const;

/** The same question the site nav asks, so the two bars cannot show different items. */
async function sampleOptions() {
  return { ...SAMPLE, reviewsLive: await reviewsLive() };
}
const PUBLIC = {
  // Cached hard: it is one document that changes when a human changes it, and it is the page
  // most likely to be linked from somewhere we do not control.
  'cache-control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
  'x-robots-tag': 'index, follow',
};

export async function GET(): Promise<Response> {
  const runId = env.sampleRunId;
  if (!runId) return new Response(renderReport(SAMPLE_REPORT, await sampleOptions()), { headers: { ...HTML, ...PUBLIC } });

  const run = await getRunById(runId);
  if (!run) {
    console.error(`sample: SAMPLE_RUN_ID ${runId} does not match a run. Serving the specimen.`);
    return new Response(renderReport(SAMPLE_REPORT, await sampleOptions()), { headers: { ...HTML, ...PUBLIC } });
  }

  // Same path the subscriber's own copy takes, so the sample cannot quietly become a nicer
  // render than the thing people actually receive.
  const rebuilt = await attachDelta(await buildReport(run), run);
  const row = await saveReport(rebuilt, run);
  const report = await asIssued(rebuilt, row);

  return new Response(renderReport(report, await sampleOptions()), { headers: { ...HTML, ...PUBLIC } });
}
