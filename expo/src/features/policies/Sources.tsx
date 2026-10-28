import { useState } from 'react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { FiExternalLink, FiPlus } from 'react-icons/fi';
import { api } from '@clearpath/backend/convex/_generated/api';
import { type Policy } from '../review/model';
import { PolicyDialog } from './PolicyDialog';
import { errorMessage } from '@/features/assets/media';
function AddSource({ policies, close }: { policies: Policy[]; close: () => void }) {
  const add = useAction(api.policy.sourceManagement.add);
  const [url, setUrl] = useState(''),
    [label, setLabel] = useState(''),
    [jurisdiction, setJurisdiction] = useState('federal'),
    [watch, setWatch] = useState(false),
    [linked, setLinked] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  return (
    <PolicyDialog title="Add source" close={close}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          setMessage('');
          try {
            const result = await add({
              url,
              label: label || undefined,
              jurisdiction:
                jurisdiction.trim().toLowerCase() === 'federal'
                  ? 'federal'
                  : jurisdiction.trim().toUpperCase(),
              linkedRules: linked,
              watchLinks: watch,
            });
            setMessage(result.message);
            if (result.error) setError(result.error);
          } catch (cause) {
            setError(errorMessage(cause, 'Unable to add source.'));
          } finally {
            setBusy(false);
          }
        }}
      >
        <p>
          Paste a public source. We’ll detect its type, test the fetch, and save a baseline before
          watching for changes.
        </p>
        <label>
          Source URL
          <input
            type="url"
            aria-label="Source URL"
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
          />
        </label>
        <label>
          Label (optional)
          <input
            aria-label="Source label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={200}
          />
        </label>
        <label>
          Jurisdiction
          <input
            aria-label="Source jurisdiction"
            value={jurisdiction}
            onChange={(e) => setJurisdiction(e.target.value)}
            placeholder="federal or CA"
            required
          />
        </label>
        <label className="cp-check-label">
          <input type="checkbox" checked={watch} onChange={(e) => setWatch(e.target.checked)} />
          Watch its links for new pages
        </label>
        <label>
          Linked rules (optional)
          <select
            multiple
            aria-label="Linked rules"
            value={linked}
            onChange={(e) => setLinked([...e.target.selectedOptions].map((o) => o.value))}
          >
            {policies.map((p) => (
              <option key={p.key} value={p.key}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
        <p className="cp-small">
          Leave rules empty to discover new rules from this source. Feeds and sitemaps watch new
          URLs automatically.
        </p>
        {message && (
          <p className={error ? 'cp-error' : 'cp-policy-impact'} role="status">
            {message}
          </p>
        )}
        {error && !message && (
          <p className="cp-error" role="alert">
            {error}
          </p>
        )}
        <div className="cp-actions">
          <button className="cp-button primary" disabled={busy}>
            {busy ? 'Testing source…' : 'Add and test source'}
          </button>
          <button type="button" className="cp-button" onClick={close}>
            {message ? 'Done' : 'Cancel'}
          </button>
        </div>
      </form>
    </PolicyDialog>
  );
}
export function Sources({
  policies,
  onUpdate,
}: {
  policies: Policy[];
  onUpdate: (id: string) => void;
}) {
  const sources = useQuery(api.policy.sourceManagement.list, {}),
    pause = useMutation(api.policy.sourceManagement.setPaused),
    remove = useMutation(api.policy.sourceManagement.remove),
    retry = useMutation(api.policy.sourceManagement.retry);
  const [adding, setAdding] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState('');
  async function change(id: string, run: () => Promise<unknown>) {
    setBusy(id);
    setError('');
    try {
      await run();
    } catch (cause) {
      setError(errorMessage(cause, 'Unable to change source.'));
    } finally {
      setBusy('');
    }
  }
  return (
    <section className="cp-source-section">
      <div className="cp-section-heading">
        <h2>Sources</h2>
        <button className="cp-button" onClick={() => setAdding(true)}>
          <FiPlus /> Add source
        </button>
      </div>
      {error && (
        <p role="alert" className="cp-error">
          {error}
        </p>
      )}
      {!sources ? (
        <p role="status">Loading sources…</p>
      ) : (
        <div className="cp-sources-list">
          {sources.map((s) => {
            const url =
              s.monitor.type === 'ecfr'
                ? `https://www.ecfr.gov/current/title-${s.monitor.title}/part-${s.monitor.part}${s.monitor.section ? `/section-${s.monitor.section}` : ''}`
                : s.monitor.type === 'internal'
                  ? ''
                  : s.monitor.url;
            return (
              <article className="cp-source-row" key={s._id}>
                <span className="cp-pill">
                  {s.monitor.type === 'listing' ? s.monitor.format : s.monitor.type}
                </span>
                <div className="cp-source-copy">
                  <a href={url} target="_blank" rel="noreferrer">
                    {s.label} <FiExternalLink />
                  </a>
                  <span className="cp-small">
                    {s.jurisdiction === 'federal' ? 'Federal' : s.jurisdiction}
                    {s.paused ? ' · Paused' : ''}
                  </span>
                  {s.lastError ? (
                    <div className="cp-source-error">
                      <strong>{s.lastError.replace(/^https?:\/\/[^ ]+: /, '')}</strong>
                      {s.jobStatus === 'queued' && <span> · Retry scheduled</span>}
                    </div>
                  ) : s.lastChange && s.lastUpdateId ? (
                    <a
                      href={`#policy-update-${s.lastUpdateId}`}
                      className="cp-source-change"
                      onClick={(e) => {
                        e.preventDefault();
                        onUpdate(s.lastUpdateId ?? '');
                      }}
                    >
                      Changed{' '}
                      {new Date(s.lastChange).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </a>
                  ) : null}
                </div>
                <div className="cp-actions">
                  {s.lastError && (
                    <button
                      className="cp-button quiet"
                      disabled={
                        busy === s._id ||
                        s.paused ||
                        s.jobStatus === 'queued' ||
                        s.jobStatus === 'running'
                      }
                      onClick={() => void change(s._id, () => retry({ id: s._id }))}
                    >
                      Retry
                    </button>
                  )}
                  <button
                    className="cp-button quiet"
                    disabled={busy === s._id}
                    onClick={() =>
                      void change(s._id, () => pause({ id: s._id, paused: !s.paused }))
                    }
                  >
                    {s.paused ? 'Resume' : 'Pause'}
                  </button>
                  <button
                    className="cp-button quiet"
                    disabled={busy === s._id}
                    onClick={() => void change(s._id, () => remove({ id: s._id }))}
                  >
                    Remove
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {adding && <AddSource policies={policies} close={() => setAdding(false)} />}
    </section>
  );
}
