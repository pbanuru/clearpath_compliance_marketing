import { useState } from 'react';
import { router } from 'expo-router';
import { useMutation } from 'convex/react';
import { FiArrowRight } from 'react-icons/fi';
import { api } from '@clearpath/backend/convex/_generated/api';
import { useAssetUploads } from '@/features/assets/useAssetUploads';
import { errorMessage } from '@/features/assets/media';
import { SubmitQuickCheck } from './SubmitQuickCheck';
import { UploadBox } from './UploadBox';
import { Examples } from './Examples';
import { SubmissionFields, emptyContext } from './SubmissionFields';

export function Submit() {
  const uploads = useAssetUploads();
  const create = useMutation(api.reviews.create);
  const [context, setContext] = useState(emptyContext);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const title = context.title ?? uploads.items[0]?.name.replace(/\.[^.]+$/, '') ?? '';
  const ready =
    uploads.assetIds.length > 0 &&
    !!context.product &&
    !!context.channel &&
    !!title.trim() &&
    context.jurisdictions.length > 0;
  return (
    <main className="cp-page">
      <div className="cp-form">
        <div className="cp-page-heading">
          <div>
            <span className="cp-eyebrow">START A REVIEW</span>
            <h1 style={{ marginTop: 8 }}>New submission</h1>
            <p>Start with the material. Add the context that helps us check it.</p>
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
            <span className="cp-small">
              AI checks the material first. A reviewer makes every decision.
            </span>
          </div>
        </form>
        <Examples />
      </div>
    </main>
  );
}
