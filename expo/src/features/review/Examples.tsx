import { useRef, useState } from 'react';
import { router } from 'expo-router';
import { useMutation } from 'convex/react';
import { FiPlay } from 'react-icons/fi';
import { api } from '@clearpath/backend/convex/_generated/api';
import { useAssetUploads } from '@/features/assets/useAssetUploads';
import { errorMessage } from '@/features/assets/media';
import { examples, uploadExample } from './examples';
import type { CampaignChoice } from '../campaigns/CampaignPicker';
import './example-cards.css';

const previews = [
  '/examples/personal-loan-social-ad.png',
  '',
  '/examples/mortgage-landing-page-preview.jpg',
  '/examples/affiliate-video-poster.jpg',
];
export function Examples({ campaign }: { campaign?: CampaignChoice }) {
  const uploads = useAssetUploads();
  const create = useMutation(api.reviews.create);
  const [active, setActive] = useState('');
  const [error, setError] = useState('');
  const errorElement = useRef<HTMLParagraphElement>(null);
  return (
    <section className="cp-examples" aria-label="Try an example">
      <div className="cp-examples-header">
        <h2>Try an example</h2>
      </div>
      <div className="cp-example-grid">
        {examples.map((example, i) => {
          return (
            <button
              className="cp-example"
              key={example.id}
              disabled={!!active}
              onClick={async () => {
                setActive(example.id);
                setError('');
                try {
                  const assetIds = await uploadExample(example.files, uploads);
                  const id = await create({
                    title: example.title,
                    product: example.product,
                    channel: example.channel,
                    jurisdictions: ['US'],
                    assetIds,
                    example: example.id,
                    offerTerms: example.offerTerms,
                    notes: example.notes,
                    campaignId: campaign?._id,
                    goLiveDate: campaign?.goLiveDate,
                  });
                  router.push(`/reviews/${id}`);
                } catch (cause) {
                  setError(errorMessage(cause, 'Unable to start the example.'));
                  requestAnimationFrame(() =>
                    errorElement.current?.scrollIntoView({ block: 'nearest' }),
                  );
                } finally {
                  setActive('');
                }
              }}
            >
              <div className="cp-example-preview" aria-hidden="true">
                {example.id === 'credit-card-email' ? (
                  <div className="cp-example-email">
                    <span>Subject: You&apos;re pre-approved, Jordan!</span>
                    <p>0% APR for 18 months on purchases and balance transfers</p>
                    <p>
                      No annual fee
                      <br />
                      2% cash back on everything
                    </p>
                  </div>
                ) : (
                  <img src={example.thumbnail ?? previews[i]} alt="" loading="lazy" />
                )}
                {example.id === 'affiliate-video' && (
                  <span className="cp-example-play">
                    <FiPlay />
                  </span>
                )}
              </div>
              <strong>{example.title}</strong>
              <span>{active === example.id ? 'Preparing material…' : example.format}</span>
            </button>
          );
        })}
      </div>
      {active && (
        <p className="cp-small" role="status">
          {uploads.items.find((item) => item.message)?.message ?? 'Uploading example…'}
        </p>
      )}
      {error && (
        <p ref={errorElement} role="alert" className="cp-error">
          {error}
        </p>
      )}
    </section>
  );
}
