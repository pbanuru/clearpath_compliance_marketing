import { afterEach, expect, test, vi } from 'vitest';
import { api, internal } from '../_generated/api';
import { fixture } from '../reviewTest.helpers';
import { queued, output, response } from '../pipelineTest.helpers';
import { must } from '../policy/test.helpers';
import { parseAnalysis, record } from './parsing';
import { outputSchema } from './output';

vi.mock('./quickCheckRun', () => ({ runQuickCheck: () => Promise.resolve({ rules: [] }) }));
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test('parser accepts legacy output, deduplicates extra references, and requires the array in strict output', async () => {
  const { t, assetId } = await queued();
  const asset = must(await t.run((ctx) => ctx.db.get('assets', assetId)));
  const body = output(assetId);
  const parse = (raw: unknown) =>
    parseAnalysis(JSON.stringify(raw), [asset], [], new Map(), [
      'approval-claims',
      'udaap-misleading',
    ]);
  expect(must(parse(body).findings[0]).additionalPolicyIds).toBeUndefined();
  const multiple = {
    ...body,
    findings: [
      {
        ...must(body.findings[0]),
        additionalPolicyIds: ['udaap-misleading', 'approval-claims', 'udaap-misleading'],
      },
    ],
  };
  expect(must(parse(multiple).findings[0]).additionalPolicyIds).toEqual(['udaap-misleading']);
  const findingSchema = record(record(outputSchema.properties.findings).items);
  expect(findingSchema.required).toContain('additionalPolicyIds');
  for (const extra of ['missing-rule', 'card-promo-rate']) {
    must(multiple.findings[0]).additionalPolicyIds = [extra];
    expect(() => parse(multiple)).toThrow('Unknown or out-of-scope additional policy');
  }
});

test('analysis persists the loaded differing rule versions even when both change before completion', async () => {
  const { t, alice, assetId, reviewId } = await queued();
  const rate = 'advertised-rate-available',
    soft = 'soft-pull-claims';
  await alice.mutation(api.policies.edit, {
    key: rate,
    expectedVersion: 1,
    check: 'Original payment check.',
    changeSummary: 'Add a payment check.',
  });
  const loaded = must(await t.mutation(internal.review.state.start, { reviewId, version: 1 }));
  const base = output(assetId);
  const body = {
    ...base,
    findings: [{ ...must(base.findings[0]), policyId: rate, additionalPolicyIds: [soft] }],
  };
  const result = parseAnalysis(
    JSON.stringify(body),
    loaded.assets,
    [],
    new Map(),
    loaded.policies.map((p) => p.id),
  );
  await alice.mutation(api.policies.edit, {
    key: rate,
    expectedVersion: 2,
    check: 'New rate check.',
    changeSummary: 'Clarify.',
  });
  await alice.mutation(api.policies.edit, {
    key: soft,
    expectedVersion: 1,
    check: 'New soft inquiry check.',
    changeSummary: 'Clarify.',
  });
  const completion = { reviewId, version: 1, runKey: loaded.runKey, spans: [], extractions: [] };
  await expect(
    t.mutation(internal.review.state.finish, {
      ...completion,
      result: {
        ...result,
        findings: [{ ...must(result.findings[0]), additionalPolicyIds: ['missing-rule'] }],
      },
    }),
  ).rejects.toThrow('Unknown or out-of-scope additional policy');
  await t.mutation(internal.review.state.finish, { ...completion, result });
  const stored = must((await alice.query(api.reviews.get, { reviewId })).findings[0]);
  expect(stored).toMatchObject({
    source: 'ai',
    policyId: rate,
    policyVersion: 2,
    additionalPolicies: [{ key: soft, version: 1 }],
  });
  expect(stored).not.toHaveProperty('additionalPolicyIds');
  expect((await alice.query(api.policies.version, { key: rate, version: 2 }))?.check).toBe(
    'Original payment check.',
  );
  expect((await alice.query(api.policies.version, { key: soft, version: 1 }))?.check).not.toBe(
    'New soft inquiry check.',
  );
});

test('revision input and legacy carryover retain every accepted rule reference', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.stubEnv('OPENAI_API_KEY', 'stub');
  const { t, alice, reviewId, findingId, input } = await fixture();
  await alice.mutation(api.findings.edit, { findingId, additionalPolicyIds: ['soft-pull-claims'] });
  await alice.mutation(api.reviews.decide, { reviewId, version: 1, outcome: 'changes_requested' });
  await alice.mutation(api.reviews.resubmit, {
    reviewId,
    assetIds: input.assetIds,
    responses: [{ findingId, text: 'Updated this claim.' }],
  });
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init?: RequestInit) => {
      if (typeof init?.body !== 'string') throw new Error('Expected JSON request.');
      const material = JSON.stringify(record(JSON.parse(init.body)).input);
      expect(material).toContain('additionalPolicyIds');
      expect(material).toContain('approval-claims');
      expect(material).toContain('soft-pull-claims');
      return Promise.resolve(
        response(
          JSON.stringify({
            summary: 'The claim remains.',
            findings: [],
            previous: [{ findingId, status: 'still_present', note: 'Still needs qualification.' }],
          }),
        ),
      );
    }),
  );
  await t.action(internal.review.analysis.run, { reviewId, version: 2 });
  const detail = await alice.query(api.reviews.get, { reviewId });
  expect(detail.versions[1]?.analysis.status).toBe('succeeded');
  expect(detail.findings.find((f) => f.version === 2)).toMatchObject({
    previousFindingId: findingId,
    additionalPolicies: [{ key: 'soft-pull-claims', version: 1 }],
  });
});

test.each(['extra', 'legacy primary'] as const)(
  'revision retains an accepted %s rule outside automatic applicability',
  async (role) => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.stubEnv('OPENAI_API_KEY', 'stub');
    const { t, alice, reviewId, findingId, input } = await fixture();
    const key = await alice.mutation(api.policy.customRules.add, {
      title: 'Reviewer-selected card email rule',
      kind: 'clearpath_standard',
      jurisdiction: 'federal',
      appliesTo: { products: ['credit_card'], channels: ['email'] },
      check: 'Check the reviewer-selected claim.',
    });
    await alice.mutation(api.findings.edit, {
      findingId,
      ...(role === 'extra' ? { additionalPolicyIds: [key] } : { policyId: key }),
    });
    if (role === 'legacy primary')
      await t.run((ctx) => ctx.db.patch('findings', findingId, { policyVersion: undefined }));
    await alice.mutation(api.reviews.decide, {
      reviewId,
      version: 1,
      outcome: 'changes_requested',
    });
    const check = 'Updated check for the reviewer-selected claim.';
    await alice.mutation(api.policies.edit, {
      key,
      expectedVersion: 1,
      check,
      changeSummary: 'Clarify the check.',
    });
    await alice.mutation(api.reviews.resubmit, {
      reviewId,
      assetIds: input.assetIds,
      responses: [{ findingId, text: 'Revised this issue.' }],
    });
    let instructions: unknown;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        if (typeof init?.body !== 'string') throw new Error('Expected JSON request.');
        instructions = record(JSON.parse(init.body)).instructions;
        return Promise.resolve(
          response(
            JSON.stringify({
              summary: 'The requested issue remains.',
              findings: [],
              previous: [
                { findingId, status: 'still_present', note: 'The claim still needs revision.' },
              ],
            }),
          ),
        );
      }),
    );
    await t.action(internal.review.analysis.run, { reviewId, version: 2 });
    const detail = await alice.query(api.reviews.get, { reviewId });
    expect(detail.versions[1]?.analysis.status).toBe('succeeded');
    expect(detail.versions[1]?.policyVersions).toContainEqual({ key, version: 2 });
    expect(detail.versions[1]?.policyVersions?.some((p) => p.key === 'card-promo-rate')).toBe(
      false,
    );
    expect(instructions).toContain(check);
    const carried = must(detail.findings.find((f) => f.version === 2));
    const prior = must(detail.findings.find((f) => f._id === findingId));
    expect(carried.previousFindingId).toBe(findingId);
    if (role === 'extra') {
      expect(carried.additionalPolicies).toEqual([{ key, version: 2 }]);
      expect(prior.additionalPolicies).toEqual([{ key, version: 1 }]);
    } else {
      expect(carried).toMatchObject({ policyId: key, policyVersion: 2 });
      expect(prior.policyId).toBe(key);
      expect(prior.policyVersion).toBeUndefined();
    }
  },
);
