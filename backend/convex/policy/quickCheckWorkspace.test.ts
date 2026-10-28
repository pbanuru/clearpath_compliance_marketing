import { afterEach, expect, test, vi } from 'vitest';
import { api } from '../_generated/api';
import { setup, aliceIdentity } from '../reviewTest.helpers';
import { fetcher, requestQuestions } from './test.helpers';

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test('quick check seeds each owner, filters state rules, and invalidates edited workspace checks', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.stubEnv('OPENAI_API_KEY', 'stub');
  const t = setup(),
    alice = t.withIdentity(aliceIdentity);
  const bob = t.withIdentity({
    ...aliceIdentity,
    tokenIdentifier: 'https://auth.example|bob',
    subject: 'bob',
  });
  const assetId = await alice.mutation(api.assets.createText, {
    name: 'Ad',
    text: 'Your loan offer.',
  });
  const args = {
    assetIds: [assetId],
    product: 'personal_loan' as const,
    channel: 'social' as const,
    jurisdictions: ['NY'],
  };
  const requests: { name: string; instructions: string }[][] = [];
  fetcher((_url, init) => {
    const questions = requestQuestions(init);
    requests.push(questions);
    return Response.json({
      model: 'gpt-6-luna',
      answers: questions.map((q) => ({ name: q.name, type: 'predicate', probability: 0.2 })),
    });
  });
  const initial = await alice.action(api.quickCheck.forAssets, args);
  expect(initial.status).toBe('succeeded');
  expect(await alice.query(api.policies.history, { key: 'meta-personal-attributes' })).toHaveLength(
    1,
  );
  expect((await alice.action(api.quickCheck.forAssets, args))._id).toBe(initial._id);
  expect(requests).toHaveLength(1);
  const key = await alice.mutation(api.policy.customRules.add, {
    title: 'NY payment example',
    kind: 'state_rule',
    jurisdiction: 'NY',
    appliesTo: { products: ['personal_loan'], channels: [] },
    check: 'Show a NY payment example.',
  });
  const excluded = await alice.mutation(api.policy.customRules.add, {
    title: 'California disclosure',
    kind: 'state_rule',
    jurisdiction: 'CA',
    appliesTo: {},
    check: 'Use the California disclosure.',
  });
  const custom = await alice.action(api.quickCheck.forAssets, args);
  expect(custom.rules.some((r) => r.ruleId === key)).toBe(true);
  expect(custom.rules.some((r) => r.ruleId === excluded)).toBe(false);
  await alice.mutation(api.policies.edit, {
    key,
    expectedVersion: 1,
    check: 'Show the updated NY payment example.',
    changeSummary: 'Clarify the example.',
  });
  const edited = await alice.action(api.quickCheck.forAssets, args);
  expect(edited._id).not.toBe(custom._id);
  expect(requests.at(-1)?.find((q) => q.name === key)?.instructions).toContain(
    'updated NY payment example',
  );
  const bobAsset = await bob.mutation(api.assets.createText, {
    name: 'Ad',
    text: 'Your loan offer.',
  });
  const isolated = await bob.action(api.quickCheck.forAssets, { ...args, assetIds: [bobAsset] });
  expect(isolated.rules.some((r) => r.ruleId === key)).toBe(false);
  expect(await bob.query(api.policies.history, { key })).toEqual([]);
  expect(await bob.query(api.policies.history, { key: 'google-ads-personal-loans' })).toHaveLength(
    1,
  );
});
