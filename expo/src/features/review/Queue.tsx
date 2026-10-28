import { Link, useLocalSearchParams } from 'expo-router';
import { usePaginatedQuery } from 'convex/react';
import { FiInbox, FiPlus, FiFileText, FiHeadphones, FiFilm, FiFile } from 'react-icons/fi';
import { api } from '@clearpath/backend/convex/_generated/api';
import { useAssetAccess } from '@/features/assets/useAssetAccess';
import type { FunctionReturnType } from 'convex/server';
import { Examples } from './Examples';
import {
  channels,
  products,
  filterLabels,
  reviewFilter,
  severities,
  Status,
  dateTime,
} from './model';

function Thumbnail({
  review,
}: {
  review: FunctionReturnType<typeof api.reviews.list>['page'][number];
}) {
  const visual = review.cover.kind === 'image' || review.cover.kind === 'video';
  const access = useAssetAccess(visual ? review.coverAssetId : undefined);
  const { urls, failed } = access;
  const Icon =
    review.cover.kind === 'audio'
      ? FiHeadphones
      : review.cover.kind === 'video'
        ? FiFilm
        : review.cover.kind === 'document'
          ? FiFile
          : FiFileText;
  const url = urls?.poster ?? urls?.original;
  return (
    <span className="cp-thumbnail">
      {url && !failed ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          onError={() => access.retry(review.cover.kind === 'video' ? 'poster' : 'image')}
          onLoad={() => access.loaded(review.cover.kind === 'video' ? 'poster' : 'image')}
        />
      ) : (
        <Icon size={22} />
      )}
    </span>
  );
}
function waiting(since: number) {
  const minutes = Math.max(0, Math.floor((Date.now() - since) / 60000));
  return minutes < 60
    ? `Waiting ${minutes < 1 ? '<1m' : `${minutes}m`}`
    : minutes < 1440
      ? `Waiting ${Math.floor(minutes / 60)}h`
      : `Waiting ${Math.floor(minutes / 1440)}d`;
}
export function Queue() {
  const { filter: value } = useLocalSearchParams<{ filter?: string }>();
  const filter = reviewFilter(value);
  const emptyTitle = {
    needs_review: 'Nothing to review yet',
    changes_requested: 'No changes requested yet',
    approved: 'No approved submissions yet',
    all: 'No submissions yet',
  }[filter];
  const { results, status, loadMore } = usePaginatedQuery(
    api.reviews.list,
    { filter },
    { initialNumItems: 25 },
  );
  return (
    <main className="cp-page">
      <div className="cp-page-heading">
        <div>
          <span className="cp-eyebrow">YOUR WORKSPACE</span>
          <h1 style={{ marginTop: 8 }}>{filterLabels[filter]}</h1>
          <p>
            {filter === 'needs_review'
              ? 'Review findings and decide what is ready to publish.'
              : 'Every submission and its decision, in one place.'}
          </p>
        </div>
        <Link href="/submit" asChild>
          <a className="cp-button cp-queue-new">
            <FiPlus /> New submission
          </a>
        </Link>
      </div>
      {status === 'LoadingFirstPage' ? (
        <p role="status" className="cp-muted">
          Loading submissions…
        </p>
      ) : !results.length ? (
        <>
          <section className="cp-empty">
            <FiInbox size={32} />
            <h2>{emptyTitle}</h2>
            <p>Submit material, or try an example to see a review.</p>
            <Link href="/submit" asChild>
              <a className="cp-button primary">
                <FiPlus /> New submission
              </a>
            </Link>
          </section>
          <Examples />
        </>
      ) : (
        <div className="cp-list">
          <div className="cp-list-head">
            <span>SUBMISSION</span>
            <span>FINDINGS</span>
            <span>STATUS</span>
          </div>
          {results.map((review) => (
            <Link key={review._id} href={`/reviews/${review._id}`} asChild>
              <a className="cp-row">
                <div className="cp-row-material">
                  <Thumbnail review={review} />
                  <div className="cp-row-copy">
                    <strong>{review.title}</strong>
                    {review.recheck && (
                      <span className="cp-recheck-reason" title={review.recheck.changeSummary}>
                        {review.recheck.sourceLabel ?? 'Rule'} “{review.recheck.title}” changed{' '}
                        {new Date(review.recheck.changedAt ?? review.updatedAt).toLocaleDateString(
                          undefined,
                          { month: 'short', day: 'numeric' },
                        )}
                        : {review.recheck.changeSummary}
                      </span>
                    )}
                    <div className="cp-row-meta">
                      {products[review.product]} · {channels[review.channel]}
                    </div>
                    <div className="cp-row-badges">
                      {review.currentVersion > 1 && (
                        <span className="cp-pill">v{review.currentVersion}</span>
                      )}
                      {review.recheck && <span className="cp-pill needs_context">Recheck</span>}
                      {review.recheckFailed && (
                        <span className="cp-pill required">Recheck failed</span>
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
                  {review.wasApproved && review.status !== 'approved' ? (
                    <span className="cp-pill required">No longer approved</span>
                  ) : (
                    <Status status={review.status} />
                  )}
                  <span className="cp-small" title={dateTime(review.updatedAt)}>
                    {review.status === 'in_review' || review.status === 'checking'
                      ? waiting(review.waitingSince)
                      : dateTime(review.updatedAt)}
                  </span>
                </div>
              </a>
            </Link>
          ))}
        </div>
      )}
      {(status === 'CanLoadMore' || status === 'LoadingMore') && (
        <button
          className="cp-button"
          style={{ marginTop: 20 }}
          disabled={status === 'LoadingMore'}
          onClick={() => loadMore(25)}
        >
          {status === 'LoadingMore' ? 'Loading…' : 'Load more'}
        </button>
      )}
    </main>
  );
}
