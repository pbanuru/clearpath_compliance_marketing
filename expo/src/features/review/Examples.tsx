import { useState } from 'react';
import { router } from 'expo-router';
import { useMutation } from 'convex/react';
import { FiImage, FiMail, FiFileText, FiVideo } from 'react-icons/fi';
import { api } from '@clearpath/backend/convex/_generated/api';
import { useAssetUploads } from '@/features/assets/useAssetUploads';
import { errorMessage } from '@/features/assets/media';
import { examples, uploadExample } from './examples';

const icons = [FiImage, FiMail, FiFileText, FiVideo];
export function Examples() {
  const uploads = useAssetUploads();
  const create = useMutation(api.reviews.create);
  const [active, setActive] = useState('');
  const [error, setError] = useState('');
  return (
    <section className="cp-examples" aria-label="Try an example">
      <div className="cp-examples-header">
        <h2>Try an example</h2>
        <span className="cp-small">Real material. A complete review.</span>
      </div>
      <div className="cp-example-grid">
        {examples.map((example, i) => {
          const Icon = icons[i] ?? FiFileText;
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
                  });
                  router.push(`/reviews/${id}`);
                } catch (cause) {
                  setError(errorMessage(cause, 'Unable to start the example.'));
                } finally {
                  setActive('');
                }
              }}
            >
              {example.thumbnail ? (
                <img
                  src={example.thumbnail}
                  alt=""
                  loading="lazy"
                  style={{
                    width: '100%',
                    height: 128,
                    objectFit: 'cover',
                    objectPosition: 'top',
                    borderRadius: 5,
                  }}
                />
              ) : (
                <Icon size={24} />
              )}
              <strong>{example.title}</strong>
              <span>{active === example.id ? 'Preparing material…' : example.format}</span>
            </button>
          );
        })}
      </div>
      {active && (
        <p className="cp-small" role="status">
          Uploading the example to your workspace…
        </p>
      )}
      {error && (
        <p role="alert" className="cp-error">
          {error}
        </p>
      )}
    </section>
  );
}
