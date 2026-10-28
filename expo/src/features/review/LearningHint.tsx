import { FiX } from 'react-icons/fi';
import { useDismissed } from './learning';
import './learning.css';

const hints = {
  finding: 'The AI suggests; you decide. Accepted findings become the change request.',
  decision: 'Add a note to explain your decision.',
  revision: 'Answer each change, then replace the material.',
};
export function LearningHint({ concept }: { concept: keyof typeof hints }) {
  const [hidden, dismiss] = useDismissed(`hint-${concept}`);
  if (hidden) return null;
  return (
    <aside className="cp-learning-hint" data-hint={concept} aria-label="Review tip">
      <p>{hints[concept]}</p>
      <button
        type="button"
        className="cp-icon"
        title="Dismiss tip"
        aria-label={`Dismiss ${concept} tip`}
        onClick={dismiss}
      >
        <FiX />
      </button>
    </aside>
  );
}
