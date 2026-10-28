import { FiCheckCircle, FiEdit3, FiXCircle } from 'react-icons/fi';
import { useAccount } from '@/features/auth/useAccount';
import { dateTime, statuses, type ReviewDetail } from './model';

export function DecisionRecord({ data, number }: { data: ReviewDetail; number: number }) {
  const decisions = data.decisions.filter((d) => d.version === number);
  return (
    <>
      {decisions.map((decision, i) => (
        <DecisionEntry
          key={decision._id}
          data={data}
          number={number}
          decision={decision}
          earlier={
            i < decisions.length - 1 ||
            (data.review.status === 'in_review' && !!data.review.recheck)
          }
        />
      ))}
    </>
  );
}
function DecisionEntry({
  data,
  number,
  decision,
  earlier,
}: {
  data: ReviewDetail;
  number: number;
  decision: ReviewDetail['decisions'][number];
  earlier: boolean;
}) {
  const account = useAccount();
  const Icon =
    decision.outcome === 'approved'
      ? FiCheckCircle
      : decision.outcome === 'changes_requested'
        ? FiEdit3
        : FiXCircle;
  const changes = data.findings.filter((f) => decision.acceptedFindingIds.includes(f._id));
  return (
    <section
      id={`decision-${decision._id}`}
      className={`cp-decision-record outcome-${decision.outcome}`}
    >
      <div className="cp-record-title">
        <Icon size={20} />
        <h2>
          {earlier ? 'Earlier decision: ' : ''}
          {statuses[decision.outcome]}
        </h2>
      </div>
      <p className="cp-small">
        {account.user?.name ?? 'You'} · {dateTime(decision.decidedAt)} · Version {number}
      </p>
      {decision.note && <p>{decision.note}</p>}
      {decision.outcome === 'changes_requested' && changes.length > 0 && (
        <details className="cp-change-list">
          <summary>
            {changes.length} requested {changes.length === 1 ? 'change' : 'changes'}
          </summary>
          <ol>
            {changes.map((f) => (
              <li key={f._id}>
                <strong>{f.title}</strong>
                <p>{f.suggestedFix ?? f.explanation}</p>
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}
