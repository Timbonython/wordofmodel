'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

/**
 * The Meta pixel, and the three events the browser is allowed to report.
 *
 * NOT PURCHASE. That one is sent from the Stripe webhook when a Conversions API token exists,
 * because the browser is redirected out to Stripe and back through whatever ad blocker and
 * privacy setting the buyer has, and a purchase counted twice makes every ratio underneath it
 * wrong. When no token exists the Purchase is not reported to Meta by anybody, and this
 * component is still exactly right: the three events below are all the browser was ever
 * trusted with. See lib/meta.ts.
 *
 * NOT ON REPORT PAGES either, which costs nothing to guarantee: the report is served by a
 * route handler with its own document and never renders this layout. Paid subscriber content
 * has no business carrying an advertising tracker, and the structure enforces it rather than a
 * reviewer remembering.
 *
 * Rendered only when the server decided this visitor may be tracked - a pixel id is set and
 * they are not in the UK or the EEA. The decision is made server side and passed down, so
 * nothing here can accidentally track somebody by defaulting to true.
 *
 * ---------------------------------------------------------------------------------------
 * BEFOREINTERACTIVE, AND IT IS THE WHOLE DEFECT. Fixed 26 Aug 2026.
 *
 * This was `strategy="afterInteractive"`, which the Next documentation defines as "load the
 * script early but AFTER SOME HYDRATION on the page occurs". A React effect that runs at
 * hydration therefore runs BEFORE the pixel snippet exists.
 *
 * useMetaEvent('Lead') is exactly such an effect: it fires the moment the wizard mounts. On a
 * direct load of /start, window.fbq was still undefined when it ran, metaTrack's
 * `typeof fbq === 'function'` guard swallowed the call, and the event was gone. Not delayed,
 * not queued - gone. Meta's own snippet is written to survive this: it defines fbq as a stub
 * with a queue synchronously, so calls made before fbevents.js downloads are held and replayed.
 * That protection only works if THE SNIPPET ITSELF has run, and afterInteractive guaranteed it
 * had not.
 *
 * beforeInteractive puts the snippet in the initial HTML, ahead of any Next.js code, so the
 * stub and its queue exist before the first effect. The queue then does the job it was
 * designed for.
 *
 * Evidence, gathered rather than reasoned about, with a real Chrome driven at the built site:
 * a soft navigation from / to /start fired ev=Lead, because fbq had loaded during the time
 * spent on the home page. The same build loaded directly at /start fired nothing. That is the
 * ordering, visible.
 */
export function MetaPixel({ pixelId }: { pixelId: string }) {
  return (
    <>
      <Script id="meta-pixel" strategy="beforeInteractive">
        {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${pixelId}');
fbq('track', 'PageView');`}
      </Script>
      <MetaRouteChange />
    </>
  );
}

/**
 * A PageView on every client-side route change.
 *
 * THE SITE ROOT ON EVERY EVENT WAS THIS. The snippet's own PageView fires once, on the first
 * document load, and App Router navigation after that is a soft transition: no new document,
 * no new snippet, and nothing telling the pixel the page changed. Meta therefore kept
 * attributing everything - including its own automatic button-click capture on the wizard - to
 * whichever URL the visitor first landed on, which for almost everybody is the site root.
 *
 * The first render is skipped deliberately. The snippet has already sent a PageView for that
 * document, and sending a second would double every landing in the reporting while looking
 * perfectly healthy, which is the failure this build keeps refusing to ship.
 */
function MetaRouteChange() {
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    metaTrack('PageView');
  }, [pathname]);

  return null;
}

/** The events the browser may report. 'Purchase' is absent and must stay absent. */
type BrowserEvent = 'ViewContent' | 'Lead' | 'InitiateCheckout' | 'PageView';

/**
 * Fire one standard event, if the pixel is there at all.
 *
 * Standard names rather than custom ones, so Meta's optimiser can actually bid on them:
 * ViewContent for a completed scan, Lead for a wizard start, InitiateCheckout for a session.
 * A custom event is invisible to the thing we are paying to optimise. All four names above are
 * Meta standard events, which is why this uses fbq('track', ...) and never trackCustom - a
 * custom name sent through track is discarded silently, and a standard name sent through
 * trackCustom is not the standard event.
 *
 * Safe to call when the pixel was never loaded, which is the case for every UK and EEA visitor
 * and for every environment with no pixel id. It does nothing.
 *
 * IT NO LONGER DOES NOTHING QUIETLY. The old version returned on a missing fbq with no trace,
 * which is how three named events went missing for a fortnight while a boot line said they
 * were being served. If the pixel script is in the document and fbq is still not a function,
 * that is the ordering bug above coming back, and it says so in the console where the next
 * person to walk the funnel will see it. A missing script element is the legitimate case - no
 * pixel id, or a visitor we do not track - and stays silent.
 *
 * THE PARAMETER TYPE IS THE GUARD. 'Purchase' is not a member and must never become one. That
 * holds in pixel-only mode too, which is the state where it is genuinely tempting: the
 * server-side Purchase is not sent at all, because Meta will not issue a Conversions API token
 * for a pixel on a personal ad account, and the obvious patch is to let the browser report it
 * on the way back from Stripe. It is the wrong patch. That buyer returns through whatever ad
 * blocker, iOS setting and cleared cookie they have, so a browser Purchase is a number wrong in
 * a direction nobody can see, and a missing Purchase is better than a wrong one. The purchase
 * is recorded against the scan id in our own table regardless. See lib/meta.ts.
 */
export function metaTrack(event: BrowserEvent): void {
  const fbq = (window as unknown as { fbq?: (...args: unknown[]) => void }).fbq;
  if (typeof fbq === 'function') {
    fbq('track', event);
    return;
  }
  if (typeof document !== 'undefined' && document.getElementById('meta-pixel')) {
    console.warn(
      `Meta pixel: dropped "${event}". The snippet is in the document but fbq is not defined ` +
        `yet, so this call could not even be queued. That is the script strategy regressing to ` +
        `afterInteractive. See components/MetaPixel.tsx.`,
    );
  }
}

/** Fires once when the component mounts. For steps that are a page rather than a click. */
export function useMetaEvent(event: BrowserEvent): void {
  useEffect(() => {
    metaTrack(event);
  }, [event]);
}
