import { useState } from 'react';
import { FiCheck, FiCopy, FiEdit2, FiExternalLink } from 'react-icons/fi';
import { errorMessage } from '@/features/assets/media';
import type { Finding, Policy } from './model';

export function FindingDetails({
  finding,
  policy,
  editable,
  onEdit,
}: {
  finding: Finding;
  policy?: Policy;
  editable: boolean;
  onEdit: () => void;
}) {
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');
  const isCopied = copied === finding.suggestedFix;
  return (
    <>
      <p className="cp-finding-explanation">{finding.explanation}</p>
      {finding.suggestedFix && (
        <div className="cp-suggested">
          <div>
            <strong>Suggested fix</strong>
            <button
              className="cp-icon"
              aria-label="Copy suggested fix"
              title="Copy suggested fix"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(finding.suggestedFix ?? '');
                  setCopied(finding.suggestedFix ?? '');
                } catch (cause) {
                  setError(errorMessage(cause, 'Unable to copy.'));
                }
              }}
            >
              {isCopied ? <FiCheck /> : <FiCopy />}
            </button>
          </div>
          <p>{finding.suggestedFix}</p>
          {isCopied && (
            <span role="status" className="cp-small">
              Copied
            </span>
          )}
        </div>
      )}
      <details className="cp-rule">
        <summary>{policy?.title ?? 'Reviewer judgment'}</summary>
        <p>{policy?.check ?? 'A finding added using reviewer judgment.'}</p>
        {policy?.source.url ? (
          <a href={policy.source.url} target="_blank" rel="noreferrer">
            {policy.source.label} <FiExternalLink />
          </a>
        ) : (
          policy && <p>{policy.source.label}</p>
        )}
      </details>
      {finding.dismissReason && <p className="cp-small">{finding.dismissReason}</p>}
      {editable && (
        <button
          className="cp-button quiet cp-edit-finding"
          title="Edit finding (E)"
          data-triage="edit"
          onClick={onEdit}
        >
          <FiEdit2 /> Edit finding
        </button>
      )}
      {error && (
        <p role="alert" className="cp-error">
          {error}
        </p>
      )}
    </>
  );
}
