import { useState } from 'react';
import { FiCheck, FiCopy } from 'react-icons/fi';
import { errorMessage } from '@/features/assets/media';
import type { Finding } from './model';

export function FindingDetails({ finding }: { finding: Finding }) {
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
      {finding.dismissReason && <p className="cp-small">{finding.dismissReason}</p>}
      {error && (
        <p role="alert" className="cp-error">
          {error}
        </p>
      )}
    </>
  );
}
