import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { recordVisit, visitRowFor } from '@/lib/visits';

/**
 * Refreshes the magic link session on the way through, so a signed in
 * subscriber's tokens get rotated and written back before anything renders.
 *
 * Next 16 renamed the middleware file convention to proxy. Same behaviour, and
 * it runs on the Node runtime by default.
 *
 * Two deliberate choices about blast radius, because this file runs in front of
 * the whole site and the free scan is the growth engine:
 *
 *   - the matcher excludes the scan routes. They are anonymous, they hold a
 *     request open for up to 300 seconds, and there is nothing to refresh. The
 *     wizard routes are excluded for the same reason: onboarding happens before
 *     there is an account to have a session for.
 *   - it excludes the Stripe webhook, which must not be touched at all. That
 *     route verifies a signature over the raw body, and anything in front of it
 *     that could read, buffer or alter that body breaks the check.
 *   - the environment is read straight from process.env and a missing value
 *     returns the request untouched rather than throwing. A misconfigured auth
 *     env should cost you a login, never the front page.
 *
 * It also counts the visit, added 1 Sep 2026. This is the only place on the site
 * that sees every page request, which is the whole reason traffic is measured
 * here rather than in a layout or a browser script - lib/visits.ts says why at
 * length. Three properties make it safe to put in front of the front page:
 *
 *   - it is handed to event.waitUntil, so it runs AFTER the response has gone
 *     and adds nothing to time-to-first-byte. Awaiting it would put a Supabase
 *     round trip on every navigation to buy a number nobody reads until 8am.
 *   - it runs before the auth refresh below, so the row is queued even when the
 *     Supabase env is missing and this function returns early.
 *   - it cannot throw. visitRowFor returns null rather than raising, and
 *     recordVisit swallows everything. A measurement must never be able to take
 *     down the thing it measures.
 *
 * The matcher already excludes static assets and the scan and wizard API routes,
 * so what reaches here is close to the set of real page requests; lib/visits.ts
 * drops the prefetches and RSC fetches that survive it.
 */
export async function proxy(request: NextRequest, event?: NextFetchEvent) {
  const visit = visitRowFor(request);
  if (visit) {
    // No await. If there is no event - a context that calls proxy directly, such
    // as a test - fall back to a floating promise with its own catch rather than
    // blocking, because the alternative is a test harness deciding the latency
    // of the live front page.
    if (event) event.waitUntil(recordVisit(visit));
    else void recordVisit(visit);
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        // The library hands back the no-store headers that have to travel with
        // a Set-Cookie carrying auth. Without them a CDN can cache one
        // subscriber's session token and serve it to the next visitor.
        for (const [header, value] of Object.entries(headers)) {
          response.headers.set(header, value);
        }
      },
    },
  });

  // Has to be awaited here, before the response is committed, or a refresh that
  // finishes late has nowhere to write and every request refreshes again.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/scan|api/detect|api/reveal|api/waitlist|api/wizard|api/stripe|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)',
  ],
};
