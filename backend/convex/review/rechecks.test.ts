import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, internal } from '../_generated/api';
import { fixture } from '../reviewTest.helpers';
import { output, response } from '../pipelineTest.helpers';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.stubEnv('OPENAI_API_KEY', 'stub-key');
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test.each([true, false])(
  'recheck retains one specific finding with changed wording (explicit link: %s)',
  async (explicit) => {
    const { t, alice, reviewId, findingId, input, assetId } = await fixture();
    await alice.mutation(api.reviews.decide, {
      reviewId,
      version: 1,
      outcome: 'changes_requested',
    });
    await alice.mutation(api.reviews.resubmit, {
      reviewId,
      assetIds: input.assetIds,
      responses: [{ findingId, text: 'Revised the claim.' }],
    });
    const result = output(assetId);
    const specific = {
      ...result.findings[0],
      policyId: 'approval-claims',
      title: 'Qualify the revised approval claim',
      location: { ...result.findings[0]?.location, assetId, quote: 'approval in minutes' },
      previousFindingId: explicit ? findingId : null,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          response(
            JSON.stringify({
              ...result,
              findings: [specific],
              previous: [
                {
                  findingId,
                  status: 'still_present',
                  note: 'The remaining claim still guarantees approval.',
                },
              ],
            }),
          ),
        ),
      ),
    );
    await t.action(internal.review.analysis.run, { reviewId, version: 2 });
    const detail = await alice.query(api.reviews.get, { reviewId });
    expect(detail.versions[1]?.analysis.status).toBe('succeeded');
    const current = detail.findings.filter((f) => f.version === 2);
    expect(current).toHaveLength(1);
    expect(current[0]).toMatchObject({
      title: specific.title,
      previousFindingId: findingId,
      location: { assetId, quote: 'approval in minutes' },
    });
    expect(detail.review.counts.required).toBe(1);
    expect(detail.findings.find((f) => f._id === findingId)?.recheckNote).toBeTruthy();
  },
);
