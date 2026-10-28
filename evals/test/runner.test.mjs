import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const results = new URL('../results/', import.meta.url);
const identity = { subject: 'offline-test', tokenIdentifier: 'offline-test' };

test('offline runner: all 24 fresh submissions, span budget and completed resume without new calls', async () => {
  const before = new Set(
    await readdir(results).catch((error) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    }),
  );
  let attempts = 1;
  let uploads = 0,
    created = 0,
    reads = 0;
  const versions = new Map();
  const api = {
    run: async (name, args) => {
      if (name === 'policies:list') return [];
      if (name === 'reviews:create') {
        const id = `review-${++created}`;
        assert.ok(!/clean|holdout|eval/i.test(args.title));
        versions.set(id, args.assetIds);
        return id;
      }
      assert.equal(name, 'reviews:get');
      reads++;
      return {
        versions: [{ number: 1, analysis: { status: 'succeeded', startedAt: 1, finishedAt: 2 } }],
        findings: [],
        assets: versions.get(args.reviewId),
      };
    },
    spans: async () =>
      Array.from({ length: attempts }, () => ({
        operation: 'review',
        durationMs: 1,
        costUsd: 0.01,
      })),
  };
  mock.module(new URL('../lib/convex.mjs', import.meta.url), {
    namedExports: { client: () => api, deployment: 'affable-skunk-990', identity },
  });
  mock.module(new URL('../lib/upload.mjs', import.meta.url), {
    namedExports: {
      uploadCase: async (_api, _root, c) => {
        uploads++;
        return Object.fromEntries(c.assets.map((a) => [a.ref, `asset-${uploads}-${a.ref}`]));
      },
    },
  });
  const previousArgv = process.argv;
  const previousInfo = console.info;
  const previousError = console.error;
  const previousExitCode = process.exitCode;
  console.info = () => undefined;
  let output, budgetOutput;
  try {
    process.argv = [
      'node',
      'evals/run.mjs',
      '--suite',
      'original',
      '--runs',
      '3',
      '--budget',
      '30',
    ];
    await import(`../run.mjs?test=${Date.now()}`);
    const added = (await readdir(results)).filter((name) => !before.has(name));
    assert.equal(added.length, 1);
    output = new URL(`${added[0]}/`, results);
    const report = JSON.parse(await readFile(new URL('report.json', output), 'utf8'));
    assert.equal(created, 24);
    assert.equal(uploads, 24);
    assert.equal(reads, 24);
    assert.equal(report.callsUsed, 24);
    assert.equal(report.aggregate.completed, 24);
    assert.equal(report.aggregate.requiredTotal, 48);
    assert.equal(report.aggregate.requiredCaught, 0);
    assert.equal(report.aggregate.knownCostUsd.toFixed(2), '0.24');
    assert.ok((await readFile(new URL('report.md', output), 'utf8')).includes('Missed required'));
    process.argv = [
      'node',
      'evals/run.mjs',
      '--suite',
      'original',
      '--runs',
      '3',
      '--budget',
      '30',
      '--resume',
      fileURLToPath(output),
    ];
    await import(`../run.mjs?resume=${Date.now()}`);
    assert.equal(created, 24);
    assert.equal(uploads, 24);
    assert.equal(reads, 24);
    const beforeBudget = new Set(await readdir(results));
    attempts = 2;
    const errors = [];
    console.error = (message) => errors.push(message);
    process.argv = [
      'node',
      'evals/run.mjs',
      '--suite',
      'original',
      '--runs',
      '3',
      '--budget',
      '30',
    ];
    await import(`../run.mjs?budget=${Date.now()}`);
    const budgetAdded = (await readdir(results)).filter((name) => !beforeBudget.has(name));
    assert.equal(budgetAdded.length, 1);
    budgetOutput = new URL(`${budgetAdded[0]}/`, results);
    const limited = JSON.parse(await readFile(new URL('report.json', budgetOutput), 'utf8'));
    assert.ok(limited.callsUsed <= 30);
    assert.ok(limited.aggregate.completed < 24);
    assert.equal(created, 24 + limited.aggregate.completed);
    assert.equal(process.exitCode, 1);
    assert.match(errors[0], /Budget guard \(30\)/);
  } finally {
    process.argv = previousArgv;
    console.info = previousInfo;
    console.error = previousError;
    process.exitCode = previousExitCode;
    mock.restoreAll();
    if (output) await rm(output, { recursive: true });
    if (budgetOutput) await rm(budgetOutput, { recursive: true });
  }
});
