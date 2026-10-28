import { Link } from 'expo-router';
import { FiArrowLeft } from 'react-icons/fi';
import {
  products,
  channels,
  Status,
  dateTime,
  whereRuns,
  type ReviewDetail,
  type Version,
} from './model';
import { DetailsPopover } from './DetailsPopover';
import { Usage } from '../policies/ReviewPolicyState';
import './review-header.css';

export function ReviewHeader({
  data,
  version,
  onVersion,
}: {
  data: ReviewDetail;
  version: Version;
  onVersion: (number: number) => void;
}) {
  const { review, versions } = data;
  const status =
    version.number === review.currentVersion
      ? review.status
      : (data.decisions.find((d) => d.version === version.number)?.outcome ?? 'in_review');
  const versionControl =
    versions.length > 1 ? (
      <select
        aria-label="Review version"
        value={version.number}
        onChange={(e) => onVersion(Number(e.target.value))}
      >
        {versions.map((v) => (
          <option key={v.number} value={v.number}>
            V{v.number}
          </option>
        ))}
      </select>
    ) : (
      <span>V{version.number}</span>
    );
  return (
    <header className="cp-review-header">
      <div className="cp-review-header-row">
        <Link href="/" asChild>
          <a className="cp-back">
            <FiArrowLeft />
            <span>Review queue</span>
          </a>
        </Link>
        <div className="cp-review-title">
          <h1>{review.title}</h1>
          <div className="cp-actions">
            <Status status={status} />
            {review.recheck && <span className="cp-pill">Recheck</span>}
            {review.recheckFailed && <span className="cp-pill">Recheck failed</span>}
            {review.example && <span className="cp-pill">Example</span>}
          </div>
        </div>
        <div className="cp-header-meta" aria-label="Submission metadata">
          <span className="cp-header-product">{products[review.product]}</span>
          <span className="cp-header-channel">{channels[review.channel]}</span>
          <span className="cp-header-states">{whereRuns(review.jurisdictions)}</span>
          <span className="cp-header-version">{versionControl}</span>
          <span className="cp-header-submitted">Submitted {dateTime(version.createdAt)}</span>
        </div>
        <DetailsPopover>
          <dl>
            {review.status === 'approved' && (
              <div>
                <dt>In use</dt>
                <dd>
                  <Usage review={review} />
                </dd>
              </div>
            )}
            <div>
              <dt>Title</dt>
              <dd>{review.title}</dd>
            </div>
            <div>
              <dt>Product</dt>
              <dd>{products[review.product]}</dd>
            </div>
            <div>
              <dt>Channel</dt>
              <dd>{channels[review.channel]}</dd>
            </div>
            <div>
              <dt>States</dt>
              <dd>{whereRuns(review.jurisdictions)}</dd>
            </div>
            <div>
              <dt>Version</dt>
              <dd>{versionControl}</dd>
            </div>
            <div>
              <dt>Submitted</dt>
              <dd>{dateTime(version.createdAt)}</dd>
            </div>
            {review.offerTerms && (
              <div>
                <dt>Offer terms</dt>
                <dd>{review.offerTerms}</dd>
              </div>
            )}
            {review.goLiveDate && (
              <div>
                <dt>Go-live date</dt>
                <dd>{review.goLiveDate}</dd>
              </div>
            )}
            {review.notes && (
              <div>
                <dt>Notes</dt>
                <dd>{review.notes}</dd>
              </div>
            )}
            {version.submitterNote && (
              <div>
                <dt>Revision note</dt>
                <dd>{version.submitterNote}</dd>
              </div>
            )}
          </dl>
        </DetailsPopover>
      </div>
    </header>
  );
}
