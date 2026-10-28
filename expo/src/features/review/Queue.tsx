import { Link, useLocalSearchParams } from 'expo-router';
import { usePaginatedQuery } from 'convex/react';
import { FiInbox, FiPlus } from 'react-icons/fi';
import { api } from '@clearpath/backend/convex/_generated/api';
import { Examples } from './Examples';
import { QueueRows } from './QueueRows';
import { filterLabels, reviewFilter } from './model';

export function Queue() {
  const { filter: value } = useLocalSearchParams<{ filter?: string }>();
  const filter = reviewFilter(value);
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
          <a className="cp-button">
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
            <h2>
              {filter === 'needs_review'
                ? 'Nothing to review yet'
                : `No ${filter === 'all' ? 'submissions' : filterLabels[filter].toLowerCase()} yet`}
            </h2>
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
        <QueueRows rows={results} />
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
