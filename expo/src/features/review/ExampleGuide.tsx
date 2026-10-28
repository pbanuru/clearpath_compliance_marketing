import { useId } from 'react';
import { FiCheck } from 'react-icons/fi';
import type { ReviewDetail } from './model';
import { useDismissed } from './learning';
import './learning.css';

export function ExampleGuide({ data }: { data: ReviewDetail }) {
  const [hidden, dismiss] = useDismissed('example-guide');
  const id = useId();
  if (!data.review.example || hidden) return null;
  const changes = data.decisions.some((d) => d.outcome === 'changes_requested');
  const revised = data.versions.some((v) => v.number > 1);
  const approved = data.decisions.some((d) => d.outcome === 'approved' && d.version > 1);
  const first = data.findings.filter((f) => f.version === 1);
  const triaged = first.length > 0 && first.every((f) => f.status !== 'open');
  const closedEarly = !revised && ['approved', 'rejected'].includes(data.review.status);
  const current = closedEarly ? -1 : approved ? 4 : revised ? 3 : changes ? 2 : triaged ? 1 : 0;
  const steps = [
    [
      'Triage the findings',
      'Accept what you agree with, dismiss the rest.',
      triaged || data.decisions.length > 0,
    ],
    ['Request changes', 'Accepted findings become the change list.', changes],
    [
      data.review.example === 'personal-loan-social'
        ? 'Use the example revision'
        : 'Submit a revision',
      'You are now the marketer.',
      revised,
    ],
    ['Compare versions and approve', 'Review the changes before deciding.', approved],
  ] as const;
  return (
    <div className="cp-example-guide">
      <button type="button" className="cp-guide-pill" popoverTarget={id}>
        Guide · {Math.min(Math.max(current + 1, 1), steps.length)} of {steps.length}
      </button>
      <aside id={id} popover="auto" className="cp-guide-popover" aria-label="Example review guide">
        <div className="cp-guide-heading">
          <strong>Review guide</strong>
          <button type="button" onClick={dismiss}>
            Hide guide
          </button>
        </div>
        <ol>
          {steps.map(([title, hint, done], index) => (
            <li
              key={title}
              className={done ? 'done' : current === index ? 'current' : ''}
              aria-current={current === index ? 'step' : undefined}
            >
              <span
                className="cp-guide-number"
                aria-label={done ? 'Completed' : `Step ${index + 1}`}
              >
                {done ? <FiCheck /> : index + 1}
              </span>
              <div>
                <strong>{title}</strong>
                <p>{hint}</p>
              </div>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
