import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocalSearchParams } from 'expo-router';
import { useMutation, usePaginatedQuery } from 'convex/react';
import {
  FiPlus,
  FiList,
  FiColumns,
  FiChevronDown,
  FiCheck,
  FiSearch,
  FiArrowDown,
} from 'react-icons/fi';
import { api } from '@clearpath/backend/convex/_generated/api';
import { queueCompare } from '@clearpath/backend/convex/review/queueOrder';
import { errorMessage } from '@/features/assets/media';
import { Examples } from './Examples';
import { filterLabels, reviewFilter } from './model';
import { QueueItem } from './queue/QueueItem';
import { QueueEmpty } from './queue/QueueEmpty';
import { Throughput } from './queue/Throughput';
import { columns, stageOrder, type QueueReview } from './queue/model';
import { useQueueInteraction, useQueueView } from './queue/useQueueInteraction';

export function Queue() {
  const { filter: value } = useLocalSearchParams<{ filter?: string }>();
  const filter = reviewFilter(value);
  const { results, status, loadMore } = usePaginatedQuery(
    api.reviews.queue,
    {},
    { initialNumItems: 50 },
  );
  const pin = useMutation(api.reviews.pin),
    unpin = useMutation(api.reviews.unpin);
  const { view, phone, changeView } = useQueueView();
  const [search, setSearch] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState<QueueReview['_id'] | null>(null);
  const [dropTarget, setDropTarget] = useState<QueueReview['_id'] | null>(null);
  const [rejectedOpen, setRejectedOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  // Load every page before the final ordering; each backend read remains bounded.
  useEffect(() => {
    if (status === 'CanLoadMore') loadMore(100);
  }, [status, loadMore]);
  const ordered = useMemo(
    () =>
      [...results].sort((a, b) => {
        if (a.status !== b.status)
          return stageOrder.indexOf(a.status) - stageOrder.indexOf(b.status);
        return a.status === 'in_review' ? queueCompare(a, b) : b.updatedAt - a.updatedAt;
      }),
    [results],
  );
  const visible = useMemo(
    () =>
      ordered.filter((r) => {
        const matches = search.trim().toLowerCase();
        const inFilter =
          view === 'board' ||
          filter === 'all' ||
          (filter === 'needs_review'
            ? r.status === 'in_review' || r.status === 'checking'
            : r.status === filter);
        return (
          inFilter && (!matches || `${r.title} ${r.cover.name}`.toLowerCase().includes(matches))
        );
      }),
    [ordered, search, view, filter],
  );
  const { selected, setSelected } = useQueueInteraction(root, visible, `${view}-${filter}`);
  const loading = status === 'LoadingFirstPage';
  const allLoaded = status === 'Exhausted';
  async function move(review: QueueReview, remove = false) {
    setError('');
    try {
      if (remove) await unpin({ reviewId: review._id });
      else await pin({ reviewId: review._id });
    } catch (cause) {
      setError(errorMessage(cause, 'Unable to update this position.'));
    }
  }
  async function drop(beforeId: QueueReview['_id']) {
    setDropTarget(null);
    setDragging(null);
    if (!dragging || dragging === beforeId) return;
    setError('');
    try {
      await pin({ reviewId: dragging, beforeId: beforeId });
    } catch (cause) {
      setError(errorMessage(cause, 'Unable to reorder this submission.'));
    }
  }
  function item(review: QueueReview) {
    return (
      <QueueItem
        key={review._id}
        review={review}
        now={now}
        selected={selected === review._id}
        onSelect={() => setSelected(review._id)}
        onPin={move}
        onDrag={(id) => {
          setDragging(id);
          if (!id) setDropTarget(null);
        }}
        onDrop={(id) => void drop(id)}
        dropTarget={dropTarget === review._id && dragging !== review._id}
      />
    );
  }
  const emptyTitle = {
    needs_review: 'A clear queue. A fresh start.',
    changes_requested: 'No changes outstanding',
    approved: 'Your next green light starts here',
    all: 'Your workspace starts here',
  }[filter];
  return (
    <main className="cp-page q-page">
      <header className="cp-page-heading q-heading">
        <div>
          <h1>{view === 'board' ? 'Review queue' : filterLabels[filter]}</h1>
          <p>
            {view === 'board'
              ? 'A clear view of every submission, from first check to final call.'
              : 'Know what needs your attention. Keep good work moving.'}
          </p>
        </div>
        <Link href="/submit" asChild>
          <a className="cp-button primary q-new">
            <FiPlus />
            New submission
          </a>
        </Link>
      </header>
      <Throughput />
      <div className="q-toolbar">
        <div className="q-toolbar-label">
          <span className="q-live-dot" />
          <strong>{view === 'board' ? 'All submissions' : filterLabels[filter]}</strong>
          <span className="q-total">{loading ? '—' : visible.length}</span>
        </div>
        <div className="q-toolbar-controls">
          <label className="q-search">
            <FiSearch />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find a submission…"
              aria-label="Find a submission"
            />
          </label>
          {!phone && (
            <div className="q-view-switch" role="group" aria-label="Queue view">
              <button aria-pressed={view === 'list'} onClick={() => changeView('list')}>
                <FiList />
                List
              </button>
              <button aria-pressed={view === 'board'} onClick={() => changeView('board')}>
                <FiColumns />
                Board
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="q-sort-note">
        <span>
          <FiArrowDown />
          Go-live date, then longest waiting
          <span className="q-sort-detail"> · Pinned positions kept</span>
        </span>
        <span className="q-keyboard-hint">
          <kbd>J</kbd>
          <kbd>K</kbd> to move <kbd>↵</kbd> to open
        </span>
      </div>
      {error && (
        <p role="alert" className="cp-error">
          {error}
        </p>
      )}
      <div
        ref={root}
        className={`q-content q-${view}`}
        onDragOver={(e) => {
          if (!dragging) return;
          const target =
            e.target instanceof Element ? e.target.closest<HTMLElement>('[data-queue-id]') : null;
          const review = visible.find((r) => r._id === target?.dataset.queueId);
          setDropTarget(review?.status === 'in_review' ? review._id : null);
        }}
      >
        {loading ? (
          <div className="q-loading" role="status">
            <span className="q-checking">
              <i />
              Loading your queue…
            </span>
            {[1, 2, 3].map((n) => (
              <div className="q-skeleton" key={n} />
            ))}
          </div>
        ) : view === 'board' ? (
          <>
            <div className="q-board-columns">
              {columns.map((column) => {
                const rows = visible.filter((r) => r.status === column.status);
                return (
                  <section
                    className={`q-column q-column-${column.status}`}
                    key={column.status}
                    aria-label={column.title}
                  >
                    <header>
                      <span className={`q-status-dot ${column.status}`} />
                      <h2>{column.title}</h2>
                      <span className="q-total">{rows.length}</span>
                    </header>
                    <div className="q-column-body">
                      {rows.length ? (
                        rows.map(item)
                      ) : (
                        <div className="q-column-empty">
                          <FiCheck />
                          <strong>{search ? 'No matches' : column.empty}</strong>
                          <p>{search ? 'Try another title or file name.' : column.hint}</p>
                        </div>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
            <section className="q-rejected">
              <button onClick={() => setRejectedOpen((open) => !open)} aria-expanded={rejectedOpen}>
                <FiChevronDown
                  style={{ transform: rejectedOpen ? 'rotate(0)' : 'rotate(-90deg)' }}
                />
                Rejected
                <span className="q-total">
                  {visible.filter((r) => r.status === 'rejected').length}
                </span>
              </button>
              {rejectedOpen && (
                <div className="q-rejected-items">
                  {visible.some((r) => r.status === 'rejected') ? (
                    visible.filter((r) => r.status === 'rejected').map(item)
                  ) : (
                    <p>No rejected submissions. Decisions stay in the review record.</p>
                  )}
                </div>
              )}
            </section>
          </>
        ) : visible.length ? (
          <div className="q-list-table">
            <div className="q-list-head">
              <span>Submission</span>
              <span>Findings</span>
              <span>Status & timing</span>
            </div>
            {visible.map(item)}
          </div>
        ) : (
          <QueueEmpty
            search={search}
            clearSearch={() => setSearch('')}
            title={
              results.length && filter === 'needs_review'
                ? 'Good work. You’re all caught up.'
                : emptyTitle
            }
          />
        )}
      </div>
      {!loading && !allLoaded && (
        <p className="q-loading-note" role="status">
          Loading more submissions to finish sorting…
        </p>
      )}
      {!loading && !results.length && !search && <Examples />}
      {!loading && results.length > 0 && (
        <footer className="q-footer">
          <span className="q-live-dot" />
          Live updates<span>Decisions happen in the review.</span>
        </footer>
      )}
    </main>
  );
}
