import { useRef, useState } from 'react';
import { useMutation } from 'convex/react';
import { FiCheck, FiRefreshCw, FiUpload, FiFileText } from 'react-icons/fi';
import { api } from '@clearpath/backend/convex/_generated/api';
import type { Id } from '@clearpath/backend/convex/_generated/dataModel';
import { useAssetUploads } from '@/features/assets/useAssetUploads';
import { errorMessage } from '@/features/assets/media';
import type { ReviewDetail, Version } from './model';
import { UploadBox } from './UploadBox';
import { uploadExample } from './examples';
import './revision.css';

export function Revision({
  data,
  version,
  onSubmitted,
}: {
  data: ReviewDetail;
  version: Version;
  onSubmitted: () => void;
}) {
  const uploads = useAssetUploads();
  const resubmit = useMutation(api.reviews.resubmit);
  const [replacements, setReplacements] = useState<Record<string, Id<'assets'> | 'pending'>>({});
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const replacing = useRef<Id<'assets'> | undefined>(undefined);
  const decision = data.decisions.find((d) => d.version === version.number);
  const changes = data.findings.filter((f) => decision?.acceptedFindingIds.includes(f._id));
  const replacementIds = Object.values(replacements).filter((id) => id !== 'pending');
  const assetIds = [
    ...version.assets.flatMap((asset) => {
      const replacement = replacements[asset._id];
      return replacement === 'pending' ? [] : [replacement ?? asset._id];
    }),
    ...uploads.assetIds.filter((id) => !replacementIds.includes(id)),
  ];
  const unanswered = changes.filter((f) => !responses[f._id]?.trim()).length;
  const ready =
    !Object.values(replacements).includes('pending') && !unanswered && assetIds.length > 0;
  async function exampleRevision() {
    setBusy(true);
    setError('');
    try {
      const ids = await uploadExample(
        [
          { path: 'personal-loan-social-ad-v2.png' },
          { path: 'personal-loan-social-caption-v2.txt', name: 'Caption' },
        ],
        uploads,
      );
      const next: Record<string, Id<'assets'>> = {};
      for (const asset of version.assets) {
        const replacement =
          asset.kind === 'text' ? ids[1] : asset.kind === 'image' ? ids[0] : undefined;
        if (replacement) next[asset._id] = replacement;
      }
      setReplacements(next);
      setResponses(
        Object.fromEntries(
          changes.map((f) => [
            f._id,
            'Updated the ad and caption with qualified approval language, the full APR range, and lending disclosures.',
          ]),
        ),
      );
      setNote('Revised the ad and caption to address the requested changes.');
    } catch (cause) {
      setError(errorMessage(cause, 'Unable to prepare the example revision.'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="cp-revision">
      <div className="cp-revision-heading">
        <span className="cp-eyebrow">YOUR NEXT STEP</span>
        <h2>Submit a revision</h2>
        <p>Respond to the change list, then add the updated material.</p>
      </div>
      {data.review.example === 'personal-loan-social' && (
        <button
          className="cp-button cp-example-revision"
          disabled={busy || uploads.busy}
          onClick={() => void exampleRevision()}
        >
          <FiRefreshCw />
          {busy ? 'Preparing revision…' : 'Use the example revision'}
        </button>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!ready) return;
          setBusy(true);
          setError('');
          try {
            await resubmit({
              reviewId: data.review._id,
              assetIds,
              responses: changes.map((f) => ({ findingId: f._id, text: responses[f._id] ?? '' })),
              note: note || undefined,
            });
            onSubmitted();
          } catch (cause) {
            setError(errorMessage(cause, 'Unable to submit the revision.'));
          } finally {
            setBusy(false);
          }
        }}
      >
        {changes.map((finding, index) => (
          <div className="cp-revision-response" key={finding._id}>
            <div className="cp-response-title">
              <span className={responses[finding._id]?.trim() ? 'answered' : ''}>
                {responses[finding._id]?.trim() ? <FiCheck /> : index + 1}
              </span>
              <strong>{finding.title}</strong>
            </div>
            <p>{finding.suggestedFix ?? finding.explanation}</p>
            <label>
              Your response
              <textarea
                required
                rows={2}
                placeholder="What changed, or what context should the reviewer consider?"
                value={responses[finding._id] ?? ''}
                onChange={(e) => setResponses({ ...responses, [finding._id]: e.target.value })}
              />
            </label>
          </div>
        ))}
        <h3 className="cp-revision-subheading">Material for version {version.number + 1}</h3>
        {version.assets.map((asset) => {
          const replacement = replacements[asset._id];
          return (
            <div key={asset._id} className="cp-revision-asset">
              <FiFileText />
              <div>
                <strong>{asset.name}</strong>
                <span>
                  {replacement && replacement !== 'pending'
                    ? `Replaced with ${uploads.items.find((i) => i.assetId === replacement)?.name ?? 'updated material'}`
                    : replacement === 'pending'
                      ? 'Choose an updated file below'
                      : 'Keep the current material'}
                </span>
              </div>
              <div className="cp-revision-asset-actions">
                <button
                  type="button"
                  className="cp-button"
                  aria-pressed={!replacement}
                  disabled={busy || uploads.busy}
                  onClick={() => {
                    if (replacement && replacement !== 'pending') {
                      const item = uploads.items.find((i) => i.assetId === replacement);
                      if (item) uploads.remove(item.key);
                    }
                    setReplacements((current) => {
                      return Object.fromEntries(
                        Object.entries(current).filter(([key]) => key !== asset._id),
                      );
                    });
                  }}
                >
                  Keep
                </button>
                <button
                  type="button"
                  className="cp-button"
                  aria-pressed={!!replacement}
                  disabled={busy || uploads.busy}
                  onClick={() => {
                    setReplacements((current) => ({ ...current, [asset._id]: 'pending' }));
                    replacing.current = asset._id;
                    input.current?.click();
                  }}
                >
                  <FiUpload />
                  Replace
                </button>
              </div>
            </div>
          );
        })}
        <input
          ref={input}
          type="file"
          hidden
          accept="image/*,video/*,audio/*,application/pdf,text/plain"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            const old = replacing.current;
            e.target.value = '';
            if (!file || !old) return;
            setError('');
            setBusy(true);
            try {
              const id =
                file.type === 'text/plain' || file.name.endsWith('.txt')
                  ? await uploads.addText(
                      version.assets.find((a) => a._id === old)?.name ?? file.name,
                      await file.text(),
                    )
                  : (await uploads.upload([file]))[0];
              if (id) setReplacements((current) => ({ ...current, [old]: id }));
            } catch (cause) {
              setError(errorMessage(cause, 'Unable to replace the material.'));
            } finally {
              setBusy(false);
            }
          }}
        />
        <div className="cp-revision-extra">
          <span className="cp-field-label">Add more material</span>
          <UploadBox uploads={uploads} />
        </div>
        <label>
          Revision note <small>Optional</small>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        {error && (
          <p className="cp-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="cp-button primary cp-revision-submit"
          disabled={!ready || busy || uploads.busy}
        >
          {busy ? 'Submitting…' : 'Submit revision'}
        </button>
        {unanswered > 0 && (
          <p className="cp-small">
            Respond to {unanswered} {unanswered === 1 ? 'change' : 'changes'} to submit the
            revision.
          </p>
        )}
      </form>
    </section>
  );
}
