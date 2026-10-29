import { useQuery } from 'convex/react';
import type { RefObject } from 'react';
import { api } from '@clearpath/backend/convex/_generated/api';
import type { Policy } from './model';
import { RuleReference } from './RuleReference';

export function FindingRuleReference({
  reference,
  policy,
  boundary,
}: {
  reference: { key: string; version?: number };
  policy?: Policy;
  boundary: RefObject<HTMLElement | null>;
}) {
  const historical = useQuery(
    api.policies.version,
    reference.version ? { key: reference.key, version: reference.version } : 'skip',
  );
  const rule = reference.version ? historical : policy;
  return (
    <div className="cp-finding-rule-entry">
      <RuleReference
        dismissBoundary={boundary}
        name={rule?.title ?? policy?.title ?? reference.key}
        title={`${rule?.title ?? policy?.title ?? reference.key}${reference.version ? ` · v${reference.version}` : ''}`}
        label={policy?.source.label ?? rule?.title ?? reference.key}
        excerpt={
          rule?.citation?.excerpt ??
          (policy?.source.monitor.type === 'internal' ? rule?.check : undefined)
        }
        url={rule?.citation?.url ?? (reference.version ? null : (policy?.source.url ?? null))}
      />
    </div>
  );
}
