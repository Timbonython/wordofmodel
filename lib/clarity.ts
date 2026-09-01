'use client';

import ClaritySdk from '@microsoft/clarity';

/**
 * The id on the snippet element in components/Clarity.tsx.
 *
 * NOT "clarity-script", which is the id @microsoft/clarity's own init() uses. We never call
 * init - the snippet is rendered by the server-gated component - and anyone who adds an init()
 * call later will inject a SECOND Clarity tag rather than being deduped by the first, because
 * the package only looks for its own id. Don't.
 */
export const SCRIPT_ID = 'ms-clarity';

/**
 * IS THIS VISITOR BEING RECORDED AT ALL. Set from the render of components/Clarity.tsx, which
 * the server puts in the tree only when it has decided this visitor may be recorded: a project
 * id is configured and they are not in the UK, the EEA or Switzerland.
 *
 * WHY IT IS A FLAG AND NOT A LOOK AT THE DOM, which is what this was for half an hour on 1 Sep
 * and it did not work. The obvious version asks document.getElementById(SCRIPT_ID) whether the
 * snippet is there, and treats "not there" as the visitor we do not record. But next/script at
 * afterInteractive INSERTS that element after hydration, and ScanPanel's first tag fires from a
 * mount effect - before it exists. So the first phase tag of every session was dropped, and a
 * browser was the only thing that could show it: the check fabricated the element and passed.
 *
 * "Not inserted yet" and "this visitor is never recorded" look identical in the DOM. They are
 * not the same thing, and the difference is a decision the server already made - so it is
 * passed down rather than guessed at. §3 of the engineering principles: the check belongs where
 * the decision is made.
 */
let armed = false;

export function armTagging(): void {
  armed = true;
}

/**
 * Tag the recording, so a session can be found by where it died rather than by watching it.
 *
 * THIS IS THE WHOLE POINT OF THE INSTRUMENT. Without tags you have a pile of recordings and the
 * original question - which of the four steps loses people - is answered by sitting and watching
 * until you have seen enough. With them the dashboard filters straight to "reached confirm,
 * never reached running", which is the cohort that costs the most and is invisible everywhere
 * else in the build.
 *
 * WHY THIS EXISTS RATHER THAN CALLING THE PACKAGE DIRECTLY, which is the entire reason the
 * dependency is wrapped and not merely imported: @microsoft/clarity's setTag is one line,
 *
 *     setTag(key, value) { window.clarity('set', key, value); }
 *
 * with no check that window.clarity is there. It is not there for a visitor in the UK or the
 * EEA, it is not there when NEXT_PUBLIC_CLARITY_ID is unset - which is the default and the
 * production state on 1 Sep 2026 - and it is not there for anyone running an ad blocker. In all
 * three cases a bare ClaritySdk.setTag throws a TypeError inside a React effect in the scan
 * panel. The people the region gate exists to protect are precisely the people whose scan it
 * would break.
 *
 * Nothing else in the build may import @microsoft/clarity. scripts/visits-check.mjs enforces
 * that, and proves this function survives all three absences by calling it with no window.
 *
 * THE QUEUE, and the reason it is worth twenty lines. The script is afterInteractive, so there
 * is a window after hydration where the element is in the document and window.clarity is not
 * yet defined. The first tag ScanPanel sends - phase "idle" - lands in that window. Dropping it
 * would mean "no phase tag" had two meanings: a visitor who never touched the field, and a tag
 * that arrived early. That is the recurring defect of this project - absence rendering as its
 * opposite - in the one place whose entire purpose is to count the people who did nothing. So a
 * tag sent before the snippet has run is held and flushed when it arrives.
 *
 * It only queues when the script element is actually in the document. No element is the
 * legitimate absence - no id, or a visitor we do not record - and that returns silently with no
 * timer left running. An element that never defines window.clarity within two seconds is the
 * afterInteractive ordering going wrong, or the remote tag being blocked, and it says so in the
 * console where the next person walking this funnel will see it.
 */
const PENDING: Array<[string, string]> = [];
let waiting = false;

const RETRY_MS = 100;
/* Five seconds. It only ever runs for a visitor already being recorded, so waiting costs
   nothing, and afterInteractive on a slow connection is well past the two seconds this was. */
const RETRIES = 50;

/* globalThis and not window on purpose: in a browser they are the same object, and reading the
   one that exists off the runtime lets scripts/visits-check.mjs exercise this exact function
   rather than a transcription of it. */
function ready(): boolean {
  return typeof (globalThis as { clarity?: unknown }).clarity === 'function';
}

function flushWhenReady(tries: number): void {
  if (ready()) {
    for (const [key, value] of PENDING.splice(0)) ClaritySdk.setTag(key, value);
    waiting = false;
    return;
  }
  if (tries >= RETRIES) {
    console.warn(
      `Clarity: dropped ${PENDING.length} tag(s). This visitor is being recorded but ` +
        `window.clarity never appeared, so the session cannot be filtered by phase. Either the ` +
        `remote tag is blocked or the script strategy regressed. See lib/clarity.ts.`,
    );
    PENDING.length = 0;
    waiting = false;
    return;
  }
  setTimeout(() => flushWhenReady(tries + 1), RETRY_MS);
}

export function tagSession(key: string, value: string): void {
  /* The server render. armTagging() has run here too - the component renders on the server -
     so this guard is the only thing standing between a server render and a queue with a timer
     in it. It is load-bearing, not decoration. */
  if (typeof window === 'undefined') return;
  if (ready()) {
    ClaritySdk.setTag(key, value);
    return;
  }
  /* Not recorded, by the server's decision: no project id, or a region we do not track. This is
     the common case, not the exception. Return silently and leave no timer behind. */
  if (!armed) return;
  PENDING.push([key, value]);
  if (!waiting) {
    waiting = true;
    flushWhenReady(0);
  }
}
