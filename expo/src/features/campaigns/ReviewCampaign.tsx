import { useEffect, useRef, useState } from 'react';
import { Link } from 'expo-router';
import { useMutation, useQuery } from 'convex/react';
import { FiFolder, FiX } from 'react-icons/fi';
import { api } from '@clearpath/backend/convex/_generated/api';
import type { Doc } from '@clearpath/backend/convex/_generated/dataModel';
import { CampaignPicker, type CampaignChoice } from './CampaignPicker';
import { errorMessage } from '../assets/media';
import { containDialogFocus } from '../review/dialog';

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
      {!moving ? (
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
      ) : (
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
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="cp-dialog cp-campaign-dialog"
      aria-labelledby="move-campaign-title"
      onClose={onClose}
      onKeyDown={containDialogFocus}
    >
      <header>
        <h2 id="move-campaign-title">Move to campaign</h2>
        <button className="cp-icon" aria-label="Close campaign picker" onClick={onClose}>
          <FiX />
        </button>
      </header>
      <MoveCampaign review={review} campaign={campaign} onClose={onClose} />
    </dialog>
  );
}
function MoveCampaign({
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
  const [error, setError] = useState('');
  const move = useMutation(api.reviews.setCampaign);
  return (
    <div className="cp-review-move">
      <CampaignPicker value={selected} onChange={setSelected} />
      <div className="cp-actions">
        <button
          className="cp-button"
          disabled={busy}
          onClick={async () => {
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
          {busy ? 'Moving…' : 'Save campaign'}
        </button>
        <button className="cp-button quiet" disabled={busy} onClick={onClose}>
          Cancel
        </button>
      </div>
      {error && (
        <p role="alert" className="cp-error">
          {error}
        </p>
      )}
    </div>
  );
}
