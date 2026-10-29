import { useRef, useState } from 'react';
import { useMutation, usePaginatedQuery } from 'convex/react';
import { FiChevronDown, FiFolder, FiPlus, FiX } from 'react-icons/fi';
import { api } from '@clearpath/backend/convex/_generated/api';
import type { Doc } from '@clearpath/backend/convex/_generated/dataModel';
import { errorMessage } from '../assets/media';
import { Popover } from '@/components/overlays/Popover';

export type CampaignChoice = Pick<
  Doc<'campaigns'>,
  '_id' | 'name' | 'product' | 'offerTerms' | 'goLiveDate' | 'notes'
>;

export function CampaignPicker({
  value,
  onChange,
  embedded = false,
  disabled = false,
  onBusyChange,
}: {
  value?: CampaignChoice;
  onChange: (campaign?: CampaignChoice) => void;
  embedded?: boolean;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const close = () => {
    setOpen(false);
    toggle.current?.focus();
  };
  const options = (
    <CampaignOptions
      value={value}
      disabled={disabled}
      busy={busy}
      setBusy={(next) => {
        setBusy(next);
        onBusyChange?.(next);
      }}
      onChange={(campaign) => {
        onChange(campaign);
        close();
      }}
    />
  );
  return (
    <div className="cp-campaign-picker">
      <span className="cp-field-label" id="campaign-picker-label">
        Campaign <small>Optional</small>
      </span>
      <button
        ref={toggle}
        disabled={busy || disabled}
        className="cp-campaign-picker-toggle"
        type="button"
        aria-labelledby="campaign-picker-label campaign-selection"
        aria-haspopup={embedded ? undefined : 'dialog'}
        aria-expanded={open}
        aria-controls="campaign-options"
        onClick={() => setOpen(!open)}
      >
        <FiFolder />
        <span id="campaign-selection">{value?.name ?? 'Choose a campaign'}</span>
        <FiChevronDown />
      </button>
      {embedded ? (
        open && options
      ) : (
        <Popover
          open={open}
          onClose={() => setOpen(false)}
          anchor={toggle}
          busy={busy || disabled}
          placement="bottom-start"
          className="cp-review cp-campaign-popover"
          label="Choose a campaign"
        >
          {options}
        </Popover>
      )}
    </div>
  );
}
function CampaignOptions({
  value,
  onChange,
  disabled,
  busy,
  setBusy,
}: {
  value?: CampaignChoice;
  onChange: (campaign?: CampaignChoice) => void;
  disabled: boolean;
  busy: boolean;
  setBusy: (busy: boolean) => void;
}) {
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
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
          disabled={busy || disabled}
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
        <button
          type="button"
          disabled={busy || disabled}
          aria-pressed={!value}
          onClick={() => onChange()}
        >
          <FiX />
          No campaign
        </button>
        {results.map((campaign) => (
          <button
            key={campaign._id}
            disabled={busy || disabled}
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
          <button
            type="button"
            disabled={busy || disabled || status === 'LoadingMore'}
            onClick={() => loadMore(10)}
          >
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
              disabled={busy || disabled}
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
              disabled={busy || disabled || !name.trim()}
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
              disabled={busy || disabled}
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
          disabled={busy || disabled}
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
