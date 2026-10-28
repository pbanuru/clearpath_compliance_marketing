import { useState } from 'react';
import { useAction, useQuery } from 'convex/react';
import { FiExternalLink, FiPlus, FiRefreshCw } from 'react-icons/fi';
import { api } from '@clearpath/backend/convex/_generated/api';
import { products, channels, type Policy } from './model';
import { PolicyUpdates } from '../policies/PolicyUpdates';
import { PolicyEditor } from '../policies/PolicyEditor';
import { PolicyHistory } from '../policies/PolicyHistory';
import { Sources } from '../policies/Sources';
import { RecheckDemo } from '../policies/RecheckDemo';
import { MonitorStatus } from '../policies/MonitorStatus';
import { AddRule } from '../policies/AddRule';
import { PolicyCitation } from '../policies/PolicyCitation';
import { errorMessage } from '@/features/assets/media';
import '../policies/policies.css';
import '../policies/monitoring.css';
const kinds = {
  law: 'Laws',
  regulation: 'Regulations',
  guidance: 'Guidance',
  platform: 'Platforms',
  clearpath_standard: 'ClearPath standards',
  state_rule: 'State rules',
};
export function Policies() {
  const policies = useQuery(api.policies.list, {}),
    updates = useQuery(api.policies.updates, {}),
    run = useQuery(api.policy.monitorState.latest, {}),
    sources = useQuery(api.policy.sourceManagement.list, {}),
    checkNow = useAction(api.policy.monitor.checkNow);
  const [tab, setTab] = useState('rules'),
    [edit, setEdit] = useState<Policy>(),
    [history, setHistory] = useState<Policy>(),
    [adding, setAdding] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const running = run?.last?.status === 'running';
  return (
    <main className="cp-page cp-policies-page">
      <div className="cp-page-heading">
        <div>
          <h1 style={{ marginTop: 8 }}>Policies</h1>
        </div>
        <button
          className="cp-button"
          disabled={busy || running}
          onClick={async () => {
            setBusy(true);
            setMessage('');
            setError('');
            try {
              setMessage(
                (await checkNow())
                  ? 'Source check queued. This page will update as it runs.'
                  : 'Sources were checked recently. Try again after 10 minutes.',
              );
            } catch (cause) {
              setError(errorMessage(cause, 'Unable to check sources.'));
            } finally {
              setBusy(false);
            }
          }}
        >
          <FiRefreshCw />
          {busy || running ? 'Checking sources…' : 'Check sources now'}
        </button>
      </div>
      <MonitorStatus
        run={run}
        total={sources?.length ?? 0}
        failing={sources?.filter((s) => !s.paused && s.lastError).length ?? 0}
        onSources={() => setTab('sources')}
      />
      {message && (
        <p role="status" className="cp-policy-impact">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="cp-error">
          {error}
        </p>
      )}
      <div className="cp-policy-tabs" role="tablist" aria-label="Policies">
        <button role="tab" aria-selected={tab === 'rules'} onClick={() => setTab('rules')}>
          Rules <span>{policies?.length ?? '—'}</span>
        </button>
        <button role="tab" aria-selected={tab === 'sources'} onClick={() => setTab('sources')}>
          Sources
        </button>
      </div>
      {tab === 'sources' ? (
        <Sources
          policies={policies ?? []}
          onUpdate={(id) => {
            setTab('rules');
            const update = updates?.find((u) => u._id === id);
            const applied = policies?.find((p) => p.key === (update?.appliedKey ?? update?.key));
            if (update?.status === 'applied' && applied) {
              setHistory(applied);
              return;
            }
            setTimeout(() => {
              const target = document.getElementById(`policy-update-${id}`);
              const details = target?.closest('details');
              if (details) details.open = true;
              target?.scrollIntoView({ block: 'center' });
            }, 0);
          }}
        />
      ) : (
        <>
          <PolicyUpdates updates={updates ?? []} policies={policies ?? []} />
          <div className="cp-section-heading">
            <div>
              <h2>Policy library</h2>
            </div>
            <button className="cp-button" onClick={() => setAdding(true)}>
              <FiPlus /> Add rule
            </button>
          </div>
          {!policies ? (
            <p role="status">Loading policies…</p>
          ) : (
            Object.entries(kinds).map(([kind, label]) => {
              const group = policies.filter((p) => p.kind === kind);
              return (
                group.length > 0 && (
                  <section key={kind} className="cp-policy-group">
                    <h2>{label}</h2>
                    <div className="cp-policy-grid">
                      {group.map((policy) => (
                        <article key={policy.id} className="cp-policy">
                          <div className="cp-policy-title">
                            <h3>{policy.title}</h3>
                            <div className="cp-policy-meta">
                              <span className="cp-pill">v{policy.currentVersion}</span>
                              {policy.currentVersion > 1 &&
                                policy.lastChangedAt > Date.now() - 30 * 86400000 && (
                                  <span className="cp-policy-change">
                                    Changed{' '}
                                    {new Date(policy.lastChangedAt).toLocaleDateString(undefined, {
                                      month: 'short',
                                      day: 'numeric',
                                    })}
                                  </span>
                                )}
                            </div>
                          </div>
                          <p>
                            {policy.check[0]?.toUpperCase()}
                            {policy.check.slice(1)}
                          </p>
                          <p className="cp-small">
                            {policy.jurisdiction && policy.jurisdiction !== 'federal'
                              ? `${policy.jurisdiction} · `
                              : ''}
                            {policy.appliesTo.products?.length
                              ? policy.appliesTo.products
                                  .map(
                                    (p) =>
                                      Object.entries(products).find(([k]) => k === p)?.[1] ?? p,
                                  )
                                  .join(', ')
                              : 'All products'}{' '}
                            ·{' '}
                            {policy.appliesTo.channels?.length
                              ? policy.appliesTo.channels
                                  .map(
                                    (c) =>
                                      Object.entries(channels).find(([k]) => k === c)?.[1] ?? c,
                                  )
                                  .join(', ')
                              : 'All channels'}
                          </p>
                          {policy.source.url ? (
                            <a
                              className="cp-small"
                              href={policy.source.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {policy.source.label} <FiExternalLink />
                            </a>
                          ) : (
                            <span className="cp-small">{policy.source.label}</span>
                          )}
                          <PolicyCitation
                            citation={policy.citation}
                            label={policy.source.label}
                            error={policy.citationError}
                          />
                          <div className="cp-actions">
                            <button className="cp-button quiet" onClick={() => setHistory(policy)}>
                              Version history
                            </button>
                            {policy.source.monitor.type === 'internal' && (
                              <button className="cp-button quiet" onClick={() => setEdit(policy)}>
                                Edit
                              </button>
                            )}
                          </div>
                          {policy.key === 'advertised-rate-available' && (
                            <RecheckDemo policy={policy} />
                          )}
                        </article>
                      ))}
                    </div>
                  </section>
                )
              );
            })
          )}
        </>
      )}
      {history && <PolicyHistory policy={history} close={() => setHistory(undefined)} />}
      {edit && <PolicyEditor policy={edit} close={() => setEdit(undefined)} />}
      {adding && <AddRule close={() => setAdding(false)} />}
    </main>
  );
}
