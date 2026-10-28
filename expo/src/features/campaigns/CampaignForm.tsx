import { useState } from 'react';
import { useMutation } from 'convex/react';
import { router } from 'expo-router';
import { api } from '@clearpath/backend/convex/_generated/api';
import type { Doc } from '@clearpath/backend/convex/_generated/dataModel';
import { products } from '../review/model';
import { errorMessage } from '../assets/media';

export function CampaignForm({
  campaign,
  onClose,
}: {
  campaign?: Doc<'campaigns'>;
  onClose: () => void;
}) {
  const create = useMutation(api.campaigns.create);
  const update = useMutation(api.campaigns.update);
  const [name, setName] = useState(campaign?.name ?? '');
  const [product, setProduct] = useState(campaign?.product);
  const [offerTerms, setTerms] = useState(campaign?.offerTerms ?? '');
  const [goLiveDate, setDate] = useState(campaign?.goLiveDate ?? '');
  const [notes, setNotes] = useState(campaign?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <form
      className="cp-form-section cp-campaign-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        const context = { name, product, offerTerms, goLiveDate, notes };
        try {
          if (campaign) {
            await update({ campaignId: campaign._id, ...context });
            onClose();
          } else {
            const id = await create(context);
            router.push(`/campaigns/${id}`);
          }
        } catch (cause) {
          setError(errorMessage(cause, 'Unable to save campaign.'));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>{campaign ? 'Edit campaign' : 'New campaign'}</h2>
      <div className="cp-fields">
        <label>
          Name
          <input
            autoFocus
            required
            maxLength={160}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <div className="cp-fields two">
          <label>
            Product <small>Optional</small>
            <select
              value={product ?? ''}
              onChange={(e) =>
                setProduct(
                  (['personal_loan', 'credit_card', 'mortgage_prequalification'] as const).find(
                    (key) => key === e.target.value,
                  ),
                )
              }
            >
              <option value="">Choose a product</option>
              {Object.entries(products).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Go-live date <small>Optional</small>
            <input type="date" value={goLiveDate} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        <label>
          Offer terms <small>Optional</small>
          <textarea
            rows={2}
            maxLength={10000}
            value={offerTerms}
            onChange={(e) => setTerms(e.target.value)}
          />
        </label>
        <label>
          Notes <small>Optional</small>
          <textarea
            rows={3}
            maxLength={10000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="cp-error">
            {error}
          </p>
        )}
        <div className="cp-actions">
          <button className="cp-button primary" disabled={busy || !name.trim()}>
            {busy ? 'Saving…' : campaign ? 'Save changes' : 'Create campaign'}
          </button>
          <button type="button" className="cp-button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}
