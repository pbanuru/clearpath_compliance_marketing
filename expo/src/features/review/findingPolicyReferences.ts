import type { Finding } from './model';

export function findingPolicyReferences(
  finding: Pick<Finding, 'policyId' | 'policyVersion' | 'additionalPolicies'>,
) {
  const references = [
    { key: finding.policyId, version: finding.policyVersion },
    ...(finding.additionalPolicies ?? []),
  ];
  return references.filter(
    (reference, index) =>
      reference.key !== 'other' &&
      references.findIndex((prior) => prior.key === reference.key) === index,
  );
}
