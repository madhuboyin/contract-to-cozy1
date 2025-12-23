// components/orchestration/DecisionTraceDrawer.tsx
import { DecisionTraceStepDTO } from '@/types';

export function DecisionTraceDrawer({
  trace,
}: {
  trace: { steps: DecisionTraceStepDTO[] };
}) {
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-muted-foreground">
        Why am I seeing this?
      </summary>

      <ul className="mt-2 space-y-1">
        {trace.steps.map((step, idx) => (
          <li key={idx} className="flex gap-2">
            <span
              className={
                step.outcome === 'APPLIED'
                  ? 'text-green-600'
                  : 'text-gray-400'
              }
            >
              {step.outcome}
            </span>
            <span>{step.rule}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
