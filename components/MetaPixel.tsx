'use client';

import Script from 'next/script';
import { useEffect } from 'react';

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
 */
export function MetaPixel({ pixelId }: { pixelId: string }) {
  return (
    <Script id="meta-pixel" strategy="afterInteractive">
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
  );
}

/**
 * Fire one standard event, if the pixel is there at all.
 *
 * Standard names rather than custom ones, so Meta's optimiser can actually bid on them:
 * ViewContent for a completed scan, Lead for a wizard start, InitiateCheckout for a session.
 * A custom event is invisible to the thing we are paying to optimise.
 *
 * Safe to call when the pixel was never loaded, which is the case for every UK and EEA
 * visitor and for every environment with no pixel id. It does nothing and says nothing.
 *
 * THE PARAMETER TYPE IS THE GUARD. 'Purchase' is not a member of it and must never become
 * one. That holds in pixel-only mode too, which is the state where it is genuinely tempting:
 * from 25 Aug 2026 the server-side Purchase is not sent at all, because Meta will not issue a
 * Conversions API token for a pixel on a personal ad account, and the obvious patch is to let
 * the browser report it on the way back from Stripe. It is the wrong patch. That buyer returns
 * through whatever ad blocker, iOS setting and cleared cookie they have, so a browser Purchase
 * is a number wrong in a direction nobody can see, and a missing Purchase is better than a
 * wrong one. The purchase is recorded against the scan id in our own table regardless. See
 * lib/meta.ts.
 */
export function metaTrack(event: 'ViewContent' | 'Lead' | 'InitiateCheckout'): void {
  const fbq = (window as unknown as { fbq?: (...args: unknown[]) => void }).fbq;
  if (typeof fbq === 'function') fbq('track', event);
}

/** Fires once when the component mounts. For steps that are a page rather than a click. */
export function useMetaEvent(event: 'ViewContent' | 'Lead' | 'InitiateCheckout'): void {
  useEffect(() => {
    metaTrack(event);
  }, [event]);
}
