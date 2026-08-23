'use client';

import Script from 'next/script';
import { useEffect } from 'react';

/**
 * The Meta pixel, and the three events the browser is allowed to report.
 *
 * NOT PURCHASE. That one is sent from the Stripe webhook, because the browser is redirected
 * out to Stripe and back through whatever ad blocker and privacy setting the buyer has, and a
 * purchase counted twice makes every ratio underneath it wrong. See lib/meta.ts.
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
