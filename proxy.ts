import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

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
 */
export async function proxy(request: NextRequest) {
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
