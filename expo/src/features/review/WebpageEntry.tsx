import { useState } from 'react';
import './webpage.css';
import { FiGlobe } from 'react-icons/fi';
import type { useAssetUploads } from '@/features/assets/useAssetUploads';
import { errorMessage } from '@/features/assets/media';

export function WebpageEntry({ uploads }: { uploads: ReturnType<typeof useAssetUploads> }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  async function capture() {
    setError('');
    try {
      await uploads.addWebpage(url);
    } catch (cause) {
      setError(errorMessage(cause, 'Unable to capture this page.'));
    }
  }
  return (
    <div className="cp-text-entry">
      <label htmlFor="webpage-url">Web page URL</label>
      <div className="cp-url-entry">
        <input
          id="webpage-url"
          type="url"
          placeholder="https://example.com/offer"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (!uploads.busy && url.trim()) void capture();
            }
          }}
        />
        <button
          type="button"
          className="cp-button"
          disabled={uploads.busy || !url.trim()}
          onClick={() => void capture()}
        >
          <FiGlobe /> Capture page
        </button>
      </div>
      <span className="cp-small">We’ll save a desktop view of the page for this review.</span>
      {error && (
        <p className="cp-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
