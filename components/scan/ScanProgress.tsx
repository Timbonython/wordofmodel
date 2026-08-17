'use client';

export type StepState = 'pending' | 'active' | 'done' | 'failed';

export interface Step {
  key: string;
  label: string;
  state: StepState;
  detail?: string;
}

/**
 * Steps 2 to 4 are the show. Watching the site get read, the question get written
 * and each engine report back is what makes the result feel earned. The one thing
 * the spec forbids is a bare spinner, so every row here says what is happening and
 * what came back.
 */
export function ScanProgress({ steps }: { steps: Step[] }) {
  return (
    <ol className="progress" aria-live="polite">
      {steps.map((step) => (
        <li key={step.key} className={`progress-row ${step.state}`}>
          <span className="progress-cell" aria-hidden="true" />
          <span className="progress-label">{step.label}</span>
          {step.detail ? <span className="progress-detail">{step.detail}</span> : null}
          <span className="visually-hidden">
            {step.state === 'done'
              ? ', done'
              : step.state === 'active'
                ? ', running'
                : step.state === 'failed'
                  ? ', failed'
                  : ', waiting'}
          </span>
        </li>
      ))}
    </ol>
  );
}
