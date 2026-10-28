import { useState } from 'react';
import { Link } from 'expo-router';
import { useMutation, useQuery } from 'convex/react';
import { FiFolder, FiX } from 'react-icons/fi';
import { api } from '@clearpath/backend/convex/_generated/api';
import type { Doc } from '@clearpath/backend/convex/_generated/dataModel';
import { Modal } from '@/components/overlays/Modal';
import { CampaignPicker, type CampaignChoice } from './CampaignPicker';
import { errorMessage } from '../assets/media';

export function ReviewCampaign({ review }: { review: Doc<'reviews'> }) {
  const data = useQuery(
    api.campaigns.get,
    review.campaignId
      ? { campaignId: review.campaignId, paginationOpts: { numItems: 1, cursor: null } }
      : 'skip',
  );
  const [moving, setMoving] = useState(false);
  return (
    <div className="cp-review-campaign">
      {review.campaignId && (
        <Link href={`/campaigns/${review.campaignId}`} asChild>
          <a className="cp-header-campaign-link" title={data?.campaign.name}>
            {data?.campaign.name ?? 'Campaign'}
          </a>
        </Link>
      )}
      <button
        type="button"
        className="cp-header-campaign-move"
        aria-label="Move to campaign"
        title="Move to campaign"
        disabled={!!review.campaignId && !data}
        onClick={() => setMoving(true)}
      >
        <FiFolder />
        <span>Move</span>
      </button>
      {moving && (
        <CampaignDialog
          key={review.campaignId ?? 'none'}
          review={review}
          campaign={data?.campaign}
          onClose={() => setMoving(false)}
        />
      )}
    </div>
  );
}
function CampaignDialog({
  review,
  campaign,
  onClose,
}: {
  review: Doc<'reviews'>;
  campaign?: Doc<'campaigns'>;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<CampaignChoice | undefined>(campaign);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const move = useMutation(api.reviews.setCampaign);
  const blocked = busy || creating;
  return (
    <Modal
      open
      onClose={onClose}
      busy={blocked}
      className="cp-dialog cp-campaign-dialog"
      labelledBy="move-campaign-title"
    >
      <header>
        <h2 id="move-campaign-title">Move to campaign</h2>
        <button
          type="button"
          className="cp-icon"
          aria-label="Close campaign picker"
          disabled={blocked}
          onClick={onClose}
        >
          <FiX />
        </button>
      </header>
      <form
        className="cp-review-move"
        onSubmit={async (event) => {
          event.preventDefault();
          if (blocked) return;
          setBusy(true);
          setError('');
          try {
            await move({ reviewId: review._id, campaignId: selected?._id });
            onClose();
          } catch (cause) {
            setError(errorMessage(cause, 'Unable to move submission.'));
          } finally {
            setBusy(false);
          }
        }}
      >
        <CampaignPicker
          value={selected}
          onChange={setSelected}
          embedded
          disabled={busy}
          onBusyChange={setCreating}
        />
        <div className="cp-actions">
          <button className="cp-button" disabled={blocked}>
            {busy ? 'Moving…' : 'Save campaign'}
          </button>
          <button type="button" className="cp-button quiet" disabled={blocked} onClick={onClose}>
            Cancel
          </button>
        </div>
        {error && (
          <p role="alert" className="cp-error">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
