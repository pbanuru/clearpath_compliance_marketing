import { useRef, useState } from 'react';
import { useMutation, usePaginatedQuery } from 'convex/react';
import { FiChevronDown, FiFolder, FiPlus, FiX } from 'react-icons/fi';
import { api } from '@clearpath/backend/convex/_generated/api';
import type { Doc } from '@clearpath/backend/convex/_generated/dataModel';
import { errorMessage } from '../assets/media';

export type CampaignChoice = Pick<
  Doc<'campaigns'>,
  '_id' | 'name' | 'product' | 'offerTerms' | 'goLiveDate' | 'notes'
>;

export function CampaignPicker({
  value,
  onChange,
}: {
  value?: CampaignChoice;
  onChange: (campaign?: CampaignChoice) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    toggle.current?.focus();
  };
  return (
    <div
      className="cp-campaign-picker"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
      }}
    >
      <span className="cp-field-label" id="campaign-picker-label">
        Campaign <small>Optional</small>
      </span>
      <button
        ref={toggle}
        className="cp-campaign-picker-toggle"
        type="button"
        aria-labelledby="campaign-picker-label campaign-selection"
        aria-expanded={open}
        aria-controls="campaign-options"
        onClick={() => setOpen(!open)}
      >
        <FiFolder />
        <span id="campaign-selection">{value?.name ?? 'Choose a campaign'}</span>
        <FiChevronDown />
      </button>
      {open && (
        <CampaignOptions
          value={value}
          onChange={(campaign) => {
            onChange(campaign);
            close();
          }}
        />
      )}
    </div>
  );
}
function CampaignOptions({
  value,
  onChange,
}: {
  value?: CampaignChoice;
  onChange: (campaign?: CampaignChoice) => void;
}) {
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const create = useMutation(api.campaigns.create);
  const { results, status, loadMore } = usePaginatedQuery(
    api.campaigns.list,
    { search },
    { initialNumItems: 10 },
  );
  return (
    <div id="campaign-options" className="cp-campaign-options">
      <label>
        Search campaigns
        <input
          autoFocus
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name"
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.preventDefault();
          }}
        />
      </label>
      <div className="cp-campaign-option-list" role="group" aria-label="Campaigns">
        <button type="button" aria-pressed={!value} onClick={() => onChange()}>
          <FiX />
          No campaign
        </button>
        {results.map((campaign) => (
          <button
            key={campaign._id}
            type="button"
            aria-pressed={campaign._id === value?._id}
            onClick={() => onChange(campaign)}
          >
            <FiFolder />
            <span>{campaign.name}</span>
            <small>
              {campaign.counts.approved}/{campaign.counts.total}
            </small>
          </button>
        ))}
        {status === 'LoadingFirstPage' && (
          <p className="cp-small" role="status">
            Loading campaigns…
          </p>
        )}
        {status !== 'LoadingFirstPage' && !results.length && (
          <p className="cp-small">No campaigns found.</p>
        )}
        {(status === 'CanLoadMore' || status === 'LoadingMore') && (
          <button type="button" disabled={status === 'LoadingMore'} onClick={() => loadMore(10)}>
            Load more campaigns
          </button>
        )}
      </div>
      {creating ? (
        <div className="cp-campaign-inline-new">
          <label>
            Campaign name
            <input
              maxLength={160}
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.preventDefault();
              }}
            />
          </label>
          <div className="cp-actions">
            <button
              type="button"
              className="cp-button primary"
              disabled={busy || !name.trim()}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  const id = await create({ name });
                  onChange({ _id: id, name: name.trim() });
                } catch (cause) {
                  setError(errorMessage(cause, 'Unable to create campaign.'));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Creating…' : 'Create campaign'}
            </button>
            <button
              type="button"
              className="cp-button"
              disabled={busy}
              onClick={() => setCreating(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          className="cp-button quiet"
          type="button"
          onClick={() => {
            setName(search);
            setCreating(true);
          }}
        >
          <FiPlus />
          New campaign
        </button>
      )}
      {error && (
        <p role="alert" className="cp-error">
          {error}
        </p>
      )}
    </div>
  );
}
