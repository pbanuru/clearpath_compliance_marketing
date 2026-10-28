import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery } from 'convex/react';
import { FiArrowRight } from 'react-icons/fi';
import { api } from '@clearpath/backend/convex/_generated/api';
import { useAssetUploads } from '@/features/assets/useAssetUploads';
import { errorMessage } from '@/features/assets/media';
import { SubmitQuickCheck } from './SubmitQuickCheck';
import { UploadBox } from './UploadBox';
import { Examples } from './ExampleCards';
import { SubmissionFields, emptyContext } from './SubmissionFields';
import { CampaignPicker, type CampaignChoice } from '../campaigns/CampaignPicker';
import type { Id } from '@clearpath/backend/convex/_generated/dataModel';

export function Submit() {
  const { campaign } = useLocalSearchParams<{ campaign?: Id<'campaigns'> }>();
  const data = useQuery(
    api.campaigns.get,
    campaign ? { campaignId: campaign, paginationOpts: { numItems: 1, cursor: null } } : 'skip',
  );
  if (campaign && !data)
    return (
      <main className="cp-page">
        <p role="status">Loading campaign…</p>
      </main>
    );
  return <SubmissionForm key={campaign ?? 'none'} campaign={data?.campaign} />;
}
function prefill(context: typeof emptyContext, campaign?: CampaignChoice): typeof emptyContext {
  return {
    ...context,
    product: context.product ?? campaign?.product,
    offerTerms: context.offerTerms || campaign?.offerTerms || '',
    goLiveDate: context.goLiveDate || campaign?.goLiveDate || '',
    notes: context.notes || campaign?.notes || '',
  };
}
function SubmissionForm({ campaign }: { campaign?: CampaignChoice }) {
  const uploads = useAssetUploads();
  const create = useMutation(api.reviews.create);
  const [context, setContext] = useState(() => prefill(emptyContext, campaign));
  const [selectedCampaign, setCampaign] = useState(campaign);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const title = context.title ?? uploads.items[0]?.name.replace(/\.[^.]+$/, '') ?? '';
  const ready =
    uploads.assetIds.length > 0 &&
    uploads.allReady &&
    !!context.product &&
    !!context.channel &&
    !!title.trim() &&
    context.jurisdictions.length > 0;
  return (
    <main className="cp-page">
      <div className="cp-form">
        <div className="cp-page-heading">
          <div>
            <h1 style={{ marginTop: 8 }}>New submission</h1>
          </div>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!ready || !context.product || !context.channel) return;
            setBusy(true);
            setError('');
            try {
              const id = await create({
                ...context,
                title,
                product: context.product,
                channel: context.channel,
                assetIds: uploads.assetIds,
                campaignId: selectedCampaign?._id,
              });
              router.push(`/reviews/${id}`);
            } catch (cause) {
              setError(errorMessage(cause, 'Unable to submit.'));
            } finally {
              setBusy(false);
            }
          }}
        >
          <UploadBox uploads={uploads} />
          <section className="cp-form-section">
            <CampaignPicker
              value={selectedCampaign}
              onChange={(next) => {
                setCampaign(next);
                setContext((current) => prefill(current, next));
              }}
            />
          </section>
          <SubmissionFields
            value={{ ...context, title }}
            onChange={(next) =>
              setContext({ ...next, title: next.title === title ? context.title : next.title })
            }
          />
          <SubmitQuickCheck
            assetIds={uploads.assetIds}
            context={context}
            uploading={uploads.busy}
            hasAssessableAssets={uploads.items.some(
              (item) => item.assetId && item.file?.type !== 'application/pdf',
            )}
          />
          <div className="cp-form-footer">
            {error && (
              <p role="alert" className="cp-error">
                {error}
              </p>
            )}
            <button className="cp-button primary" disabled={!ready || busy || uploads.busy}>
              {busy ? 'Submitting…' : 'Submit for review'}
              <FiArrowRight />
            </button>
          </div>
        </form>
        <Examples campaign={selectedCampaign} />
      </div>
    </main>
  );
}
