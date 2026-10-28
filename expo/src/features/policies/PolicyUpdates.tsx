import { useState } from 'react';
import { useMutation } from 'convex/react';
import { FiExternalLink } from 'react-icons/fi';
import { api } from '@clearpath/backend/convex/_generated/api';
import type { Doc } from '@clearpath/backend/convex/_generated/dataModel';
import type { Policy } from '../review/model';
import { dateTime } from '../review/model';
import { PolicyEditor } from './PolicyEditor';
import { Rollout } from './PolicyHistory';
import { errorMessage } from '@/features/assets/media';
export function PolicyUpdates({
  updates,
  policies,
}: {
  updates: Doc<'policyUpdates'>[];
  policies: Policy[];
}) {
  const [selected, setSelected] = useState<Doc<'policyUpdates'>>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState('');
  const dismiss = useMutation(api.policies.dismiss),
    open = updates.filter((u) => u.status === 'open' || u.status === 'not_triaged'),
    applied = updates.filter((u) => u.status === 'applied');
  return (
    <section className="cp-policy-updates" aria-label="Policy updates">
      <div className="cp-section-heading">
        <h2>
          Policy updates <span className="cp-small">{open.length} to review</span>
        </h2>
        <span className="cp-small">Source changes become rules after your review.</span>
      </div>
      {!open.length && (
        <div className="cp-policy-empty">
          No updates awaiting review. Daily monitoring checks for changes and new guidance.
        </div>
      )}
      {open.map((u) => (
        <article className="cp-policy-update" key={u._id} id={`policy-update-${u._id}`}>
          <div className="cp-actions">
            <span
              className={`cp-pill ${u.status === 'not_triaged' ? 'required' : 'needs_context'}`}
            >
              {u.status === 'not_triaged' ? 'Not triaged' : u.kind.replaceAll('_', ' ')}
            </span>
            <span className="cp-small">Detected {dateTime(u.detectedAt)}</span>
          </div>
          <h3>{policies.find((p) => p.key === u.key)?.title ?? u.title}</h3>
          <p>{u.aiSummary}</p>
          <a href={u.evidence.url} target="_blank" rel="noreferrer" className="cp-small">
            {u.evidence.documentTitle ??
              (u.evidence.amendmentDate
                ? `Amendment: ${u.evidence.amendmentDate}`
                : 'View source evidence')}{' '}
            <FiExternalLink />
          </a>
          {u.evidence.documentNumber && (
            <p className="cp-small">
              Federal Register {u.evidence.documentNumber} · {u.evidence.publicationDate}
            </p>
          )}
          <details>
            <summary>Evidence and proposed check</summary>
            <blockquote>{u.evidence.excerpt}</blockquote>
            <strong>Proposed check</strong>
            <p>{u.proposedCheck || 'Write the check after reviewing the source.'}</p>
            {u.triageError && <p className="cp-error">{u.triageError}</p>}
          </details>
          <div className="cp-actions">
            <button className="cp-button primary" onClick={() => setSelected(u)}>
              Apply
            </button>
            <button
              className="cp-button"
              disabled={busy === u._id}
              onClick={async () => {
                setBusy(u._id);
                try {
                  await dismiss({ updateId: u._id });
                } catch (cause) {
                  setError(errorMessage(cause, 'Unable to dismiss.'));
                } finally {
                  setBusy('');
                }
              }}
            >
              Dismiss
            </button>
          </div>
        </article>
      ))}
      {error && (
        <p className="cp-error" role="alert">
          {error}
        </p>
      )}
      {applied.length > 0 && (
        <details className="cp-applied-updates">
          <summary>Applied updates ({applied.length})</summary>
          {applied.map((u) => (
            <article className="cp-policy-version" key={u._id} id={`policy-update-${u._id}`}>
              <strong>{u.title}</strong>
              <p>{u.aiSummary}</p>
              {(u.appliedKey ?? u.key) && u.appliedVersion && (
                <Rollout policyKey={u.appliedKey ?? u.key ?? ''} version={u.appliedVersion} />
              )}
            </article>
          ))}
        </details>
      )}
      {selected && (
        <PolicyEditor
          update={selected}
          policy={policies.find((p) => p.key === selected.key)}
          close={() => setSelected(undefined)}
        />
      )}
    </section>
  );
}
