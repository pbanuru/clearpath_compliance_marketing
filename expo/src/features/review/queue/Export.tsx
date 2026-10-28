import { useState } from 'react';
import { useAction } from 'convex/react';
import { FiDownload } from 'react-icons/fi';
import { api } from '@clearpath/backend/convex/_generated/api';
import { errorMessage } from '@/features/assets/media';
import { products, channels, statuses } from '../model';
import { decisionCsv } from './csv';
function label(values: Record<string, string>, key: string) {
  return values[key] ?? key;
}
export function Export({ filter }: { filter: 'all' | 'approved' }) {
  const exportRows = useAction(api.reviews.exportDecisions);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <div className="q-export">
      <button
        className="cp-button"
        disabled={busy}
        aria-label="Export decision log as CSV"
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            const rows = await exportRows({ filter });
            const csv = decisionCsv(
              rows.map((row) => [
                row.title,
                label(products, row.product),
                label(channels, row.channel),
                row.jurisdictions === 'US' ? 'National (US)' : row.jurisdictions,
                row.campaign,
                row.version,
                row.outcome && label(statuses, row.outcome),
                row.decidedBy,
                row.decidedAt,
                row.note,
                row.acceptedFindings,
                row.dismissedCount ?? '',
                row.ruleVersions,
                row.aiCostUsd ?? '',
                `${window.location.origin}/reviews/${row.reviewId}`,
              ]),
            );
            const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
            const link = document.createElement('a');
            link.href = url;
            link.download = `clearpath-decisions-${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.append(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          } catch (cause) {
            setError(errorMessage(cause, 'Unable to export the decision log.'));
          } finally {
            setBusy(false);
          }
        }}
      >
        <FiDownload />
        {busy ? 'Exporting…' : 'Export'}
      </button>
      {error && (
        <span className="q-export-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
