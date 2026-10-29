import { useRef, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { FiCheck, FiX, FiRotateCcw, FiChevronDown } from 'react-icons/fi';
import { api } from '@clearpath/backend/convex/_generated/api';
import { errorMessage } from '@/features/assets/media';
import { severities, type Finding, type Policy } from './model';
import { findingEvidence } from './findingEvidence';
import { FindingDetails } from './FindingDetails';
import { useDismissable } from '@/components/overlays/useDismissable';
import { FindingRuleReference } from './FindingRuleReference';
import { findingPolicyReferences } from './findingPolicyReferences';

export function FindingCard({
  finding,
  policies,
  selected,
  editable,
  onSelect,
  onEdit,
}: {
  finding: Finding;
  policies: Policy[];
  selected: boolean;
  editable: boolean;
  onSelect: () => void;
  onEdit: () => void;
}) {
  const historical = useQuery(
    api.policies.version,
    selected && finding.policyVersion
      ? { key: finding.policyId, version: finding.policyVersion }
      : 'skip',
  );
  const policy = policies.find((policy) => policy.id === finding.policyId);
  const references = findingPolicyReferences(finding);
  const rule = finding.policyVersion ? historical : policy;
  const setStatus = useMutation(api.findings.setStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [choosingReason, setChoosingReason] = useState(false);
  const dismissTrigger = useRef<HTMLButtonElement>(null);
  const ruleBoundary = useRef<HTMLElement>(null);
  const reasons = useRef<HTMLDivElement>(null);
  useDismissable({
    open: selected && editable && finding.status === 'dismissed' && choosingReason,
    onClose: () => setChoosingReason(false),
    content: reasons,
    trigger: dismissTrigger,
    busy,
  });
  async function triage(status: 'accepted' | 'dismissed' | 'open', reason?: string) {
    setBusy(true);
    setError('');
    try {
      await setStatus({ findingId: finding._id, status, reason });
      setChoosingReason(status === 'dismissed' && !reason);
    } catch (cause) {
      setError(errorMessage(cause, 'Unable to update finding.'));
    } finally {
      setBusy(false);
    }
  }
  const evidence = findingEvidence(finding);
  const state = { open: '', accepted: 'Accepted', dismissed: 'Not raised', resolved: 'Resolved' }[
    finding.status
  ];
  return (
    <article
      ref={(element) => {
        ruleBoundary.current = element?.closest<HTMLElement>('.cp-findings-panel') ?? element;
      }}
      className={`cp-finding ${selected ? 'selected' : ''} is-${finding.status}`}
      id={`finding-${finding._id}`}
    >
      <div className="cp-finding-summary">
        <h3 className="cp-finding-heading">
          <button
            className="cp-finding-select"
            type="button"
            onClick={onSelect}
            aria-expanded={selected}
            aria-controls={`detail-${finding._id}`}
          >
            <span className="cp-finding-heading-copy">
              <span className={`cp-finding-evidence ${evidence.quoted ? 'quoted' : 'described'}`}>
                <span title={evidence.text}>
                  {evidence.quoted ? `“${evidence.text}”` : evidence.text}
                </span>
                {!evidence.quoted && evidence.label && (
                  <span className="cp-finding-location">{evidence.label}</span>
                )}
              </span>
              {!evidence.repeatsTitle && (
                <span className="cp-finding-subtitle">{finding.title}</span>
              )}
            </span>
            <FiChevronDown className="cp-finding-chevron" aria-hidden="true" />
          </button>
        </h3>
        <div className="cp-finding-references">
          {references.length ? (
            <div className="cp-finding-rule-list">
              {references.map((reference) => (
                <FindingRuleReference
                  key={reference.key}
                  reference={reference}
                  boundary={ruleBoundary}
                  policy={policies.find((policy) => policy.id === reference.key)}
                />
              ))}
            </div>
          ) : (
            <span className="cp-finding-rule">Reviewer judgment</span>
          )}
          <span className="cp-finding-status">
            <span>{severities[finding.severity]}</span>
            {finding.source === 'recheck' && <span>Recheck</span>}
            {state && (
              <span className="cp-finding-state">
                {finding.status === 'accepted' && <FiCheck aria-hidden="true" />} {state}
              </span>
            )}
          </span>
        </div>
      </div>
      <div id={`detail-${finding._id}`} className="cp-finding-detail" hidden={!selected}>
        {selected && (
          <>
            <FindingDetails
              finding={finding}
              citationError={
                historical === null ? 'Saved rule version is unavailable.' : rule?.citationError
              }
            />
            {editable && (
              <div className="cp-finding-actions">
                <button
                  className="cp-button quiet"
                  title="Accept finding (A)"
                  aria-pressed={finding.status === 'accepted'}
                  data-triage="accept"
                  disabled={busy}
                  onClick={() => void triage('accepted')}
                >
                  Accept
                </button>
                <button
                  className="cp-button quiet"
                  title="Dismiss finding (D)"
                  aria-pressed={finding.status === 'dismissed'}
                  data-triage="dismiss"
                  ref={dismissTrigger}
                  disabled={busy}
                  onClick={() =>
                    choosingReason ? setChoosingReason(false) : void triage('dismissed')
                  }
                >
                  Dismiss
                </button>
                <button className="cp-button quiet" title="Edit finding (E)" onClick={onEdit}>
                  Edit
                </button>
                {finding.status !== 'open' && (
                  <button
                    className="cp-icon"
                    title="Reopen finding (U)"
                    aria-label="Reopen finding"
                    data-triage="reopen"
                    disabled={busy}
                    onClick={() => void triage('open')}
                  >
                    <FiRotateCcw />
                  </button>
                )}
              </div>
            )}
            {editable && finding.status === 'dismissed' && choosingReason && (
              <div ref={reasons} className="cp-reason-chips" aria-label="Optional dismissal reason">
                <span>
                  Reason <small>optional</small>
                </span>
                {['Not an issue', 'Already disclosed', 'Out of scope'].map((reason) => (
                  <button
                    className="cp-button quiet"
                    key={reason}
                    disabled={busy}
                    onClick={() => void triage('dismissed', reason)}
                  >
                    {reason}
                  </button>
                ))}
                <button
                  className="cp-icon"
                  aria-label="Skip dismissal reason"
                  onClick={() => setChoosingReason(false)}
                >
                  <FiX />
                </button>
              </div>
            )}
            {error && (
              <p role="alert" className="cp-error">
                {error}
              </p>
            )}
          </>
        )}
      </div>
    </article>
  );
}
