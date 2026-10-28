import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@clearpath/backend/convex/_generated/api';
import { products, channels } from '../review/model';
import { PolicyDialog } from './PolicyDialog';
import { errorMessage } from '@/features/assets/media';
export function AddRule({ close }: { close: () => void }) {
  const add = useMutation(api.policy.customRules.add);
  const [title, setTitle] = useState(''),
    [kind, setKind] = useState<'clearpath_standard' | 'state_rule'>('clearpath_standard'),
    [state, setState] = useState(''),
    [check, setCheck] = useState(''),
    [source, setSource] = useState(''),
    [product, setProduct] = useState<string[]>([]),
    [channel, setChannel] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <PolicyDialog title="Add rule" close={close} busy={busy}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await add({
              title,
              kind,
              jurisdiction: kind === 'state_rule' ? state : 'federal',
              appliesTo: { products: product, channels: channel },
              check,
              sourceUrl: source || undefined,
            });
            close();
          } catch (cause) {
            setError(errorMessage(cause, 'Unable to add rule.'));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Rule title
          <input
            aria-label="Rule title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={200}
          />
        </label>
        <label>
          Kind
          <select
            value={kind}
            onChange={(e) =>
              setKind(e.target.value === 'state_rule' ? 'state_rule' : 'clearpath_standard')
            }
          >
            <option value="clearpath_standard">ClearPath standard</option>
            <option value="state_rule">State rule</option>
          </select>
        </label>
        {kind === 'state_rule' && (
          <label>
            State jurisdiction
            <input
              aria-label="State jurisdiction"
              value={state}
              onChange={(e) => setState(e.target.value.toUpperCase())}
              placeholder="CA"
              maxLength={2}
              pattern="[A-Z]{2}"
              required
            />
          </label>
        )}
        <div className="cp-fields two">
          <label>
            Products
            <select
              multiple
              value={product}
              onChange={(e) => setProduct([...e.target.selectedOptions].map((o) => o.value))}
            >
              {Object.entries(products).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Channels
            <select
              multiple
              value={channel}
              onChange={(e) => setChannel([...e.target.selectedOptions].map((o) => o.value))}
            >
              {Object.entries(channels).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="cp-small">
          No selection means all products or channels. A state rule applies to that state and
          national submissions.
        </p>
        <label>
          What to check
          <textarea
            aria-label="Rule check"
            rows={6}
            value={check}
            onChange={(e) => setCheck(e.target.value)}
            required
            maxLength={12000}
          />
        </label>
        <label>
          Source link (optional)
          <input
            type="url"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="https://…"
          />
        </label>
        <p className="cp-small">
          This creates version 1. New submissions use it immediately. Use Sources to monitor a
          source for future changes.
        </p>
        {error && (
          <p className="cp-error" role="alert">
            {error}
          </p>
        )}
        <div className="cp-actions">
          <button className="cp-button primary" disabled={busy}>
            {busy ? 'Adding…' : 'Add rule'}
          </button>
          <button type="button" className="cp-button" disabled={busy} onClick={close}>
            Cancel
          </button>
        </div>
      </form>
    </PolicyDialog>
  );
}
