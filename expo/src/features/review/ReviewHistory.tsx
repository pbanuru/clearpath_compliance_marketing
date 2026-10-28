import { dateTime, type ReviewDetail } from './model';

const labels = {
  submitted: 'Material submitted',
  analysis_started: 'AI check started',
  analysis_finished: 'AI check completed',
  analysis_failed: 'AI check failed',
  finding_accepted: 'Finding accepted',
  finding_dismissed: 'Finding dismissed',
  finding_reopened: 'Finding reopened',
  finding_edited: 'Finding edited',
  finding_added: 'Reviewer finding added',
  decided: 'Decision recorded',
  resubmitted: 'Revision submitted',
  recheck_passed: 'Recheck passed',
  recheck_started: 'Policy recheck started',
  recheck_findings: 'Policy recheck found issues',
  recheck_failed: 'Policy recheck failed',
  usage_changed: 'Usage updated',
};
export function ReviewHistory({ data }: { data: ReviewDetail }) {
  return (
    <details className="cp-history">
      <summary>
        History <span className="cp-small">{data.events.length} events</span>
      </summary>
      <ol>
        {[...data.events].reverse().map((event) => {
          const finding = event.findingId
            ? data.findings.find((f) => f._id === event.findingId)
            : undefined;
          const decision =
            event.type === 'decided'
              ? [...data.decisions]
                  .reverse()
                  .find((d) => d.version === event.version && d.decidedAt <= event.at)
              : undefined;
          return (
            <li key={event._id}>
              <div>
                <strong>{labels[event.type]}</strong>
                <span className="cp-small">
                  {dateTime(event.at)} · v{event.version}
                </span>
              </div>
              {finding && <p>{finding.title}</p>}
              {decision && (
                <p>
                  {decision.outcome.replaceAll('_', ' ')}
                  {decision.note ? `: ${decision.note}` : ''}
                </p>
              )}
              {event.detail && !['decided', 'finding_edited'].includes(event.type) && (
                <p>{event.detail}</p>
              )}
            </li>
          );
        })}
      </ol>
    </details>
  );
}
