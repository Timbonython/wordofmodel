'use client';

import Script from 'next/script';
import { SCRIPT_ID, armTagging } from '@/lib/clarity';

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
 * that file. Clarity acquired the same hazard on 1 Sep, because ScanPanel now tags the session
 * from an effect. It is handled by the queue in lib/clarity.ts rather than by moving this
 * script into the initial HTML, which is the cheaper half of the trade: the pixel had to be
 * beforeInteractive because a dropped conversion is money, and a tag that arrives 200ms late
 * costs nothing as long as it is not lost.
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
  /* Being in the tree at all IS the server's decision that this visitor may be recorded, so it
     is recorded here rather than re-derived. In render and not an effect on purpose: every
     component in the tree renders before any effect runs, and ScanPanel tags the session from
     an effect. An effect here would be a race with a 50/50 answer. */
  armTagging();
  return (
    <Script id={SCRIPT_ID} strategy="afterInteractive">
      {`(function(c,l,a,r,i,t,y){
c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
})(window, document, "clarity", "script", ${JSON.stringify(projectId)});`}
    </Script>
  );
}
