import type { Infer } from 'convex/values';
import type { Doc } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';
import type { policyReference } from './types';
import { policyByKey } from '../policy/changes';

type Reference = Infer<typeof policyReference>;
type FindingReferences = Pick<Doc<'findings'>, 'policyId' | 'policyVersion' | 'additionalPolicies'>;

export function extraPolicyIds(ids: string[] | undefined, primary: string) {
  return ids === undefined ? undefined : [...new Set(ids)].filter((key) => key !== primary);
}
export function findingPolicyReferences(finding: FindingReferences): Reference[] {
  return [
    ...(finding.policyVersion === undefined
      ? []
      : [{ key: finding.policyId, version: finding.policyVersion }]),
    ...(finding.additionalPolicies ?? []),
  ];
}
export function uniquePolicyReferences(refs: Reference[]) {
  return [...new Map(refs.map((p) => [JSON.stringify([p.key, p.version]), p])).values()];
}
export function additionalPolicySnapshots(
  primary: string,
  ids: string[] | undefined,
  versions: Reference[] = [],
) {
  return extraPolicyIds(ids, primary)?.map((key) => {
    const reference = versions.find((p) => p.key === key);
    if (!reference) throw new Error(`Unknown or out-of-scope additional policy: ${key}.`);
    return { key, version: reference.version };
  });
}
export async function manualPolicyReferences(
  ctx: QueryCtx,
  owner: string,
  args: { policyId?: string; additionalPolicyIds?: string[] },
  existing?: FindingReferences,
) {
  const key = args.policyId ?? existing?.policyId ?? 'other';
  const prior = existing ? findingPolicyReferences(existing) : [];
  const primary = key === 'other' ? undefined : await policyByKey(ctx, owner, key);
  const ids = extraPolicyIds(
    args.additionalPolicyIds ?? existing?.additionalPolicies?.map((p) => p.key),
    key,
  );
  const additionalPolicies = ids
    ? await Promise.all(
        ids.map(async (key) => {
          const policy = await policyByKey(ctx, owner, key);
          return {
            key,
            version: prior.find((p) => p.key === key)?.version ?? policy.currentVersion,
          };
        }),
      )
    : undefined;
  return {
    policyId: key,
    policyVersion: primary
      ? existing?.policyId === key
        ? existing.policyVersion
        : (prior.find((p) => p.key === key)?.version ?? primary.currentVersion)
      : undefined,
    additionalPolicies,
  };
}
