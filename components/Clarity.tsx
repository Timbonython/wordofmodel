'use client';

import Script from 'next/script';

/**
 * Microsoft Clarity: session replay, scroll maps, rage clicks.
 *
 * WHY, AND FOR HOW LONG. Added 1 Sep 2026 to answer one question that no table in this build
 * can answer: 100+ landing page views, zero ViewContent, and four unlogged places a visitor can
 * die between the ad and the free result - never touching the field, typing a business name
 * instead of a URL and hitting the validation message, abandoning at the grounding confirmation
 * step, or leaving during the forty second wait. Counting instruments tell you the number is
 * zero. A recording tells you where.
 *
 * TAKE IT OUT WHEN THE QUESTION IS ANSWERED. Unset NEXT_PUBLIC_CLARITY_ID and the script is not
 * in the document at all - not disabled, absent, the same shape as the pixel gate. A recorder
 * left running past the investigation that justified it is a third party watching customers for
 * no stated reason, and it will not be reviewed again because it will have become furniture.
 *
 * AFTERINTERACTIVE, unlike MetaPixel. The pixel needs beforeInteractive because React effects
 * call fbq at hydration and would run ahead of the snippet - the 26 Aug defect, written up in
 * that file. Nothing in this build calls window.clarity, so there is no ordering to protect and
 * no reason to spend the initial HTML on it. If anything ever does call clarity() from an
 * effect, read the MetaPixel note first; the failure is silent in exactly the same way.
 *
 * -------------------------------------------------------------------------------------------
 * MASKING, AND THE THING THAT MUST NOT BE RECORDED.
 *
 * The scan collects an email address at the reveal. Clarity's default masking hides input
 * values, but "default" is a dashboard setting on somebody else's product and it can be changed
 * by whoever is logged in - including by a future person trying to see what visitors typed.
 * The guarantee that matters is the one in the page, so any element that can hold personal data
 * carries data-clarity-mask="true", which Clarity honours regardless of the project setting.
 *
 * Rendered only when the server decided this visitor may be recorded: an id is set and they are
 * not in the UK, the EEA or Switzerland. Same region list as the pixel, from the same function,
 * because the promise on the privacy page is about the region and not about the vendor.
 */
export function Clarity({ projectId }: { projectId: string }) {
  return (
    <Script id="ms-clarity" strategy="afterInteractive">
      {`(function(c,l,a,r,i,t,y){
c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
})(window, document, "clarity", "script", ${JSON.stringify(projectId)});`}
    </Script>
  );
}
