import { afterEach, expect, test, vi } from 'vitest';
import { api, internal } from '../_generated/api';
import { queued, output, response } from '../pipelineTest.helpers';
import { fetcher, must } from './test.helpers';

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test('the video-capable review pipeline reads workspace checks and retains custom rule keys', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.stubEnv('OPENAI_API_KEY', 'stub');
  const { t, alice, reviewId, assetId } = await queued();
  const check = 'Every advertised offer must include a representative payment example.';
  const key = await alice.mutation(api.policy.customRules.add, {
    title: 'Payment examples',
    kind: 'clearpath_standard',
    jurisdiction: 'federal',
    appliesTo: { products: ['personal_loan'], channels: ['social'] },
    check,
  });
  const body = output(assetId);
  must(body.findings[0]).policyId = key;
  fetcher((_url, init) => {
    expect(init?.body).toContain(check);
    expect(init?.body).toContain(key);
    return response(JSON.stringify(body));
  });
  await t.action(internal.review.analysis.run, { reviewId, version: 1 });
  const data = await alice.query(api.reviews.get, { reviewId });
  expect(data.versions[0]?.analysis.status).toBe('succeeded');
  expect(data.versions[0]?.policyVersions).toContainEqual({ key, version: 1 });
  expect(data.findings).toContainEqual(
    expect.objectContaining({ policyId: key, policyVersion: 1 }),
  );
});
