import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';
import { api } from '@clearpath/backend/convex/_generated/api';
import { dateTime, type Policy } from '../review/model';
import { PolicyDialog } from './PolicyDialog';
import { errorMessage } from '@/features/assets/media';
import { PolicyCitation } from './PolicyCitation';
function Rollout({ policyKey, version }: { policyKey: string; version: number }) {
  const jobs = useQuery(api.policy.rechecks.list, { key: policyKey, toVersion: version }),
    retry = useMutation(api.policy.recheckState.retry);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  if (!jobs?.length) return null;
  const done = jobs.filter((j) => j.status === 'passed' || j.status === 'findings').length,
    failed = jobs.filter((j) => j.status === 'failed').length,
    skipped = jobs.filter((j) => j.status === 'skipped').length;
  return (
    <div className="cp-rollout">
      <span>
        Rechecked {done} of {jobs.length}
        {failed ? `, ${failed} failed` : ''}
        {skipped ? `, ${skipped} retired or superseded` : ''}
      </span>
      {failed > 0 && (
        <button
          className="cp-button quiet"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await retry({ key: policyKey, toVersion: version });
            } catch (cause) {
              setError(errorMessage(cause, 'Unable to retry.'));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Retrying…' : 'Retry failed rechecks'}
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
export function PolicyHistory({ policy, close }: { policy: Policy; close: () => void }) {
  const versions = useQuery(api.policies.history, { key: policy.key });
  return (
    <PolicyDialog title="Version history" close={close}>
      <p>{policy.title}</p>
      {!versions ? (
        <p role="status">Loading versions…</p>
      ) : (
        versions.map((v) => (
          <article className="cp-policy-version" key={v._id}>
            <div className="cp-actions">
              <strong>Version {v.version}</strong>
              <span className="cp-small">
                {dateTime(v.createdAt)} · {v.createdBy.replaceAll('_', ' ')}
              </span>
            </div>
            <p>
              <strong>{v.changeSummary}</strong>
            </p>
            <p>{v.check}</p>
            <PolicyCitation
              citation={v.citation}
              label={policy.source.label}
              error={v.citationError}
            />
            <Rollout policyKey={policy.key} version={v.version} />
          </article>
        ))
      )}
    </PolicyDialog>
  );
}
