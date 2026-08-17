'use client';

import { highlight, stripMarkdown } from '@/lib/markup';
import type { Citation } from '@/lib/types';

/**
 * The report template's excerpt block, unchanged: captured answer in mono,
 * highlighter on every competitor, the other highlighter on you, red pen
 * underneath for absence.
 */
export function AnswerExcerpt({
  engineLabel,
  model,
  runAt,
  answer,
  brandName,
  competitors,
  mentioned,
  recommended,
  citations,
}: {
  engineLabel: string;
  model: string;
  runAt: string;
  answer: string;
  brandName: string;
  competitors: string[];
  mentioned: boolean;
  recommended: boolean;
  citations: Citation[];
}) {
  const segments = highlight(stripMarkdown(answer), brandName, competitors);
  const date = new Date(runAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="excerpt" style={{ marginBottom: 20 }}>
      <div className="src">
        {engineLabel} &middot; {date} &middot; {model}
      </div>
      <p className="said">
        {segments.map((segment, i) =>
          segment.kind === 'plain' ? (
            <span key={i}>{segment.text}</span>
          ) : (
            <mark key={i} className={segment.kind === 'you' ? 'you sweep' : 'sweep'}>
              {segment.text}
            </mark>
          ),
        )}
      </p>
      <span className={recommended ? 'penmark good' : 'penmark'}>
        {recommended
          ? `${brandName}: recommended`
          : mentioned
            ? `${brandName}: named, not recommended`
            : `${brandName}: not mentioned`}
      </span>
      {citations.length > 0 ? (
        <p className="note" style={{ marginTop: 18, marginBottom: 0 }}>
          Cited: {citations.slice(0, 14).map((c) => c.domain).join(' · ')}
        </p>
      ) : null}
    </div>
  );
}
