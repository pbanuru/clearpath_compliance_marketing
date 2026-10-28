import { useState } from 'react';
import { FiChevronDown, FiZap } from 'react-icons/fi';
import { QuickGauge } from './QuickGauge';
import { QuickCheckPanel } from './QuickCheckPanel';
import { clearLabel, clearShare } from './quickCheckModel';
import type { QuickCheck } from './quickCheckModel';

export function QuickCheckSummary({
  check,
  loading = false,
  failed = false,
  expanded = false,
  detailedFinished = false,
  findingPolicyIds,
}: {
  check?: QuickCheck | null;
  loading?: boolean;
  failed?: boolean;
  expanded?: boolean;
  detailedFinished?: boolean;
  findingPolicyIds?: string[];
}) {
  const [override, setOverride] = useState<boolean | undefined>();
  const open = override ?? expanded;
  if (loading || check?.status === 'running')
    return (
      <div className="cp-quick-loading" role="status">
        <FiZap /> Quick check is reading the material…
      </div>
    );
  if (failed || check?.status === 'failed')
    return (
      <p className="cp-quick-unavailable" role="status">
        Quick check unavailable
      </p>
    );
  if (!check) return null;
  const likely = check.rules.filter((r) => r.band === 'likely').length;
  const possible = check.rules.filter((r) => r.band === 'possible').length;
  const label = check.rules.length
    ? clearLabel(check.rules, true)
    : 'Material needs detailed review';
  return (
    <section className="cp-quick" aria-label="Quick check">
      <button
        className="cp-quick-summary"
        type="button"
        aria-expanded={open}
        onClick={() => setOverride(!open)}
      >
        <span className="cp-quick-summary-label">
          <FiZap aria-hidden="true" /> Quick check
        </span>
        {check.rules.length > 0 && <QuickGauge value={clearShare(check.rules)} label={label} />}
        <span className="cp-quick-summary-copy">
          <strong>{label}</strong>
          {check.rules.length > 0 && (
            <small>
              {likely} likely {likely === 1 ? 'issue' : 'issues'} · {possible} possible
              {check.notes.length > 0 ? ' · Partial material check' : ''}
            </small>
          )}
        </span>
        <FiChevronDown className={open ? 'expanded' : ''} aria-hidden="true" />
      </button>
      {open && (
        <QuickCheckPanel
          check={check}
          detailedFinished={detailedFinished}
          findingPolicyIds={findingPolicyIds}
        />
      )}
    </section>
  );
}
