import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocalSearchParams } from 'expo-router';
import { useMutation, usePaginatedQuery } from 'convex/react';
import { FiPlus, FiList, FiColumns, FiChevronDown, FiCheck, FiSearch } from 'react-icons/fi';
import { api } from '@clearpath/backend/convex/_generated/api';
import { errorMessage } from '@/features/assets/media';
import { Examples } from './Examples';
import { filterLabels, reviewFilter } from './model';
import { QueueItem } from './queue/QueueItem';
import { QueueEmpty } from './queue/QueueEmpty';
import { Export } from './queue/Export';
import { Sort, useQueueSort, compareQueue } from './queue/Sort';
import { columns, stageOrder, emptyTitles, type QueueReview } from './queue/model';
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
  const { view: preferredView, phone, changeView } = useQueueView();
  const view = filter === 'rechecks' ? 'list' : preferredView;
  const { sort, setSort, hasPins, customBase } = useQueueSort(results);
  const resetOrder = useMutation(api.reviews.resetOrder);
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
        return compareQueue(a, b, sort, customBase);
      }),
    [results, sort, customBase],
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
            : filter === 'rechecks'
              ? r.recheckOpen
              : filter === 'approved'
                ? r.wasApproved || r.status === 'approved'
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
      else {
        await pin({ reviewId: review._id, ...(sort === 'custom' ? {} : { sort }) });
        setSort('custom');
      }
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
      await pin({ reviewId: dragging, beforeId, ...(sort === 'custom' ? {} : { sort }) });
      setSort('custom');
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

  return (
    <main className="cp-page q-page">
      <header className="cp-page-heading q-heading">
        <div>
          <h1>
            {view === 'board' ? 'Review queue' : filterLabels[filter]}
            {view === 'list' && <span className="q-total">{loading ? '—' : visible.length}</span>}
          </h1>
        </div>
        <Link href="/submit" asChild>
          <a className="cp-button primary q-new">
            <FiPlus />
            New submission
          </a>
        </Link>
      </header>
      <div className="q-toolbar">
        {view === 'board' && (
          <div className="q-toolbar-label">
            <strong>All submissions</strong>
            <span className="q-total">{loading ? '—' : visible.length}</span>
          </div>
        )}
        <div className="q-toolbar-controls">
          {(filter === 'all' || filter === 'approved') && <Export filter={filter} />}
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
          <Sort
            value={sort}
            hasPins={hasPins}
            onChange={setSort}
            onReset={async () => {
              setError('');
              try {
                await resetOrder({});
                setSort('go_live');
              } catch (cause) {
                setError(errorMessage(cause, 'Unable to reset the queue order.'));
              }
            }}
          />
          {!phone && filter !== 'rechecks' && (
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
                    <p>No rejected submissions.</p>
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
                ? 'No submissions need review.'
                : emptyTitles[filter]
            }
          />
        )}
      </div>
      {!loading && !allLoaded && (
        <p className="q-loading-note" role="status">
          Loading submissions…
        </p>
      )}
      {!loading && !results.length && !search && <Examples />}
    </main>
  );
}
