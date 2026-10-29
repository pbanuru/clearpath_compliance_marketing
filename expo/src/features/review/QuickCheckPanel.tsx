import { useId } from 'react';
import { QuickGauge } from './QuickGauge';
import { authorities, authority, clearLabel, clearShare } from './quickCheckModel';
import type { QuickCheck, QuickRule } from './quickCheckModel';

function RuleRow({
  rule,
  disagreement,
  prefix,
}: {
  rule: QuickRule;
  disagreement: boolean;
  prefix: string;
}) {
  const estimate =
    rule.probability === null
      ? 'Not assessed'
      : `${Math.round(rule.probability * 100)}% likely conflict`;
  return (
    <li className="cp-quick-rule" id={`${prefix}-${rule.ruleId}`}>
      <div className="cp-quick-rule-title">
        <strong>{rule.title}</strong>
        <span className={`cp-quick-band ${rule.band ?? 'unassessed'}`}>
          {rule.refusal
            ? 'Unassessed'
            : rule.band === 'low'
              ? 'Low risk'
              : rule.band === 'likely'
                ? 'Likely'
                : 'Possible'}
        </span>
      </div>
      <div className="cp-quick-reading">
        {rule.probability !== null && (
          <QuickGauge mini value={1 - rule.probability} label={`${rule.title}: ${estimate}`} />
        )}
        <span>{estimate}</span>
      </div>
      {disagreement && (
        <p className="cp-quick-disagreement">Flagged by quick check, no detailed finding</p>
      )}
    </li>
  );
}
export function QuickCheckPanel({
  check,
  findingPolicyIds,
  detailedFinished = false,
}: {
  check: QuickCheck;
  findingPolicyIds?: string[];
  detailedFinished?: boolean;
}) {
  const prefix = useId();
  return (
    <div className="cp-quick-panel" role="region" aria-label="Quick check rules" tabIndex={0}>
      <p className="cp-quick-caption">Likelihood of conflict, before the full review.</p>
      {authorities.map((name) => {
        const rules = check.rules
          .filter((r) => authority(r.source) === name)
          .sort((a, b) => (b.probability ?? -1) - (a.probability ?? -1));
        if (!rules.length) return null;
        const label = `${name} · ${clearLabel(rules)}`;
        return (
          <details
            className="cp-quick-authority"
            key={name}
            open={rules.some((r) => r.band !== 'low')}
          >
            <summary>
              <QuickGauge mini value={clearShare(rules)} label={label} />
              <span>{label}</span>
            </summary>
            <ul>
              {rules.map((rule) => (
                <RuleRow
                  key={rule.ruleId}
                  rule={rule}
                  prefix={prefix}
                  disagreement={
                    detailedFinished &&
                    rule.band === 'likely' &&
                    !findingPolicyIds?.includes(rule.ruleId)
                  }
                />
              ))}
            </ul>
          </details>
        );
      })}
    </div>
  );
}
