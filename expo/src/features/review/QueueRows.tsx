import { useState } from 'react';
import { Link } from 'expo-router';
import { useQuery } from 'convex/react';
import { FiFileText, FiHeadphones, FiFilm, FiFile } from 'react-icons/fi';
import { api } from '@clearpath/backend/convex/_generated/api';
import type { FunctionReturnType } from 'convex/server';
import { channels, products, severities, Status, dateTime } from './model';

type QueueRow = FunctionReturnType<typeof api.reviews.list>['page'][number];
function Thumbnail({
  review,
}: {
  review: FunctionReturnType<typeof api.reviews.list>['page'][number];
}) {
  const visual = review.cover.kind === 'image' || review.cover.kind === 'video';
  const urls = useQuery(api.assets.access, visual ? { assetId: review.coverAssetId } : 'skip');
  const Icon =
    review.cover.kind === 'audio'
      ? FiHeadphones
      : review.cover.kind === 'video'
        ? FiFilm
        : review.cover.kind === 'document'
          ? FiFile
          : FiFileText;
  const [failed, setFailed] = useState(false);
  const url = urls?.poster ?? urls?.original;
  return (
    <span className="cp-thumbnail">
      {url && !failed ? (
        <img src={url} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <Icon size={22} />
      )}
    </span>
  );
}
function waiting(since: number) {
  const minutes = Math.max(0, Math.floor((Date.now() - since) / 60000));
  return minutes < 60
    ? `Waiting ${minutes < 1 ? 'just now' : `${minutes}m`}`
    : minutes < 1440
      ? `Waiting ${Math.floor(minutes / 60)}h`
      : `Waiting ${Math.floor(minutes / 1440)}d`;
}
export function QueueRows({ rows }: { rows: QueueRow[] }) {
  return (
    <div className="cp-list">
      <div className="cp-list-head">
        <span>SUBMISSION</span>
        <span>FINDINGS</span>
        <span>STATUS</span>
      </div>
      {rows.map((review) => (
        <SubmissionRow key={review._id} review={review} />
      ))}
    </div>
  );
}
function SubmissionRow({ review }: { review: QueueRow }) {
  return (
    <Link href={`/reviews/${review._id}`} asChild>
      <a className="cp-row">
        <div className="cp-row-material">
          <Thumbnail review={review} />
          <div className="cp-row-copy">
            <strong>{review.title}</strong>
            <div className="cp-row-meta">
              {products[review.product]} · {channels[review.channel]}
            </div>
            {review.campaignName && (
              <div className="cp-row-meta cp-row-campaign">{review.campaignName}</div>
            )}
            <div className="cp-row-badges">
              {review.currentVersion > 1 && (
                <span className="cp-pill">v{review.currentVersion}</span>
              )}
              {review.example && <span className="cp-pill">Example</span>}
            </div>
          </div>
        </div>
        <div className="cp-actions">
          {review.status === 'checking' ? (
            <span className="cp-small">Check in progress</span>
          ) : (['required', 'recommended', 'needs_context'] as const).some(
              (key) => review.counts[key] > 0,
            ) ? (
            (['required', 'recommended', 'needs_context'] as const).map(
              (key) =>
                review.counts[key] > 0 && (
                  <span key={key} className={`cp-pill ${key}`} title={severities[key]}>
                    {review.counts[key]} {severities[key]}
                  </span>
                ),
            )
          ) : (
            <span className="cp-small">No issues raised</span>
          )}
        </div>
        <div className="cp-row-state">
          <Status status={review.status} />
          <span className="cp-small" title={dateTime(review.updatedAt)}>
            {review.status === 'in_review' || review.status === 'checking'
              ? waiting(review.waitingSince)
              : dateTime(review.updatedAt)}
          </span>
        </div>
      </a>
    </Link>
  );
}
