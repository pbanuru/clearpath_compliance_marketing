import { useRef, useState } from 'react';
import { Link } from 'expo-router';
import {
  FiMoreHorizontal,
  FiAlertCircle,
  FiArrowUp,
  FiX,
  FiClock,
  FiCalendar,
  FiArrowUpRight,
} from 'react-icons/fi';
import { Popover } from '@/components/overlays/Popover';
import { Pin } from './Pin';
import { channels, products, Status, dateTime, severities } from '../model';
import { Preview } from './Preview';
import { elapsed, urgency, type QueueReview } from './model';

export function QueueItem({
  review,
  now,
  selected,
  onSelect,
  onPin,
  onDrag,
  onDrop,
  dropTarget,
}: {
  review: QueueReview;
  now: number;
  selected?: boolean;
  onSelect?: () => void;
  onPin?: (review: QueueReview, unpin?: boolean) => Promise<void>;
  onDrag?: (id: QueueReview['_id'] | null) => void;
  onDrop?: (id: QueueReview['_id']) => void;
  dropTarget?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const menu = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const active = review.status === 'in_review' || review.status === 'checking';
  const due = urgency(review, now);
  async function move(unpin = false) {
    setBusy(true);
    try {
      await onPin?.(review, unpin);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article
      data-queue-id={review._id}
      className={`q-item ${selected ? 'is-selected' : ''} ${dropTarget ? 'is-drop-target' : ''}`}
      draggable={!!onDrag && review.status === 'in_review'}
      onDragStart={(e) => {
        if (!onDrag || review.status !== 'in_review') {
          e.preventDefault();
          return;
        }
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', review._id);
        onDrag(review._id);
      }}
      onDragEnd={() => onDrag?.(null)}
      onDragOver={(e) => {
        if (review.status === 'in_review' && e.dataTransfer.types.includes('text/plain')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop?.(review._id);
      }}
    >
      <Link href={`/reviews/${review._id}`} asChild>
        <a className="q-item-link" onFocus={onSelect} aria-label={`Open ${review.title}`}>
          <Preview review={review} />
          <div className="q-item-copy">
            <div className="q-item-title">
              <strong>{review.title}</strong>
              <FiArrowUpRight className="q-open-arrow" />
            </div>
            {review.recheck && (
              <span className="q-recheck-reason" title={review.recheck.changeSummary}>
                {review.recheck.sourceLabel ?? 'Rule'} “{review.recheck.title}” changed{' '}
                {new Date(review.recheck.changedAt ?? review.updatedAt).toLocaleDateString(
                  undefined,
                  { month: 'short', day: 'numeric' },
                )}
                : {review.recheck.changeSummary}
              </span>
            )}
            <span className="q-item-context">
              {products[review.product]}
              <b>·</b>
              {channels[review.channel]}
            </span>
            {review.campaignName && <span className="q-item-campaign">{review.campaignName}</span>}
            {review.cover.kind === 'text' && <p className="q-text-snippet">{review.cover.text}</p>}
            <div className="q-markers">
              {review.pinnedRank !== undefined && active && (
                <span className="q-pin-marker" title="Position pinned">
                  <Pin />
                  Pinned
                </span>
              )}
              {review.currentVersion > 1 && (
                <span className="q-version">v{review.currentVersion}</span>
              )}
              {review.ruleChangeRecheck && <span className="q-version">Recheck</span>}
              {review.recheckFailed && <span className="q-version">Recheck failed</span>}
              {review.example && <span className="q-example-label">Example</span>}
            </div>
          </div>
          <div className="q-findings">
            {review.analysisFailed ? (
              <span
                className="q-check-failed"
                title="The AI check could not finish. Open the review to inspect the error or review manually."
              >
                <FiAlertCircle />
                Check failed · manual review
              </span>
            ) : review.status === 'checking' ? (
              <span className="q-checking">
                <i />
                Checking material
              </span>
            ) : (['required', 'recommended', 'needs_context'] as const).some(
                (key) => review.counts[key],
              ) ? (
              (['required', 'recommended', 'needs_context'] as const).map(
                (key) =>
                  review.counts[key] > 0 && (
                    <span
                      className={`q-finding ${key}`}
                      key={key}
                      title={`${review.counts[key]} ${severities[key].toLowerCase()} findings`}
                    >
                      {review.counts[key]} {severities[key]}
                    </span>
                  ),
              )
            ) : (
              <span className="q-no-findings">No issues raised</span>
            )}
          </div>
          <div className="q-item-state">
            {review.wasApproved && review.status !== 'approved' ? (
              <span className="cp-pill">No longer approved</span>
            ) : (
              <Status status={review.status} />
            )}
            {due && (
              <span className={`q-urgency ${due.tone}`} title={review.goLiveDate}>
                <FiCalendar />
                {due.text}
              </span>
            )}
            <span
              className={`q-wait ${active && now - review.waitingSince > 86400000 ? 'soon' : ''}`}
              title={dateTime(active ? review.waitingSince : review.updatedAt)}
            >
              {active ? (
                <>
                  <FiClock />
                  Waiting {elapsed(now - review.waitingSince)}
                </>
              ) : (
                dateTime(review.updatedAt)
              )}
            </span>
          </div>
        </a>
      </Link>
      {onPin && review.status === 'in_review' && (
        <div className="q-row-menu">
          <button
            ref={menu}
            type="button"
            aria-label={`Actions for ${review.title}`}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <FiMoreHorizontal />
          </button>
          <Popover
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            anchor={menu}
            className="q-menu-content"
            label={`Actions for ${review.title}`}
            closeOnSelect
          >
            <button disabled={busy} onClick={() => void move()}>
              <FiArrowUp />
              Move to top
            </button>
            {review.pinnedRank !== undefined && (
              <button disabled={busy} onClick={() => void move(true)}>
                <FiX />
                Unpin
              </button>
            )}
          </Popover>
        </div>
      )}
    </article>
  );
}
