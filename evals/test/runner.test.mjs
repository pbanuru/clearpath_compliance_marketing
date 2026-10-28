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
  let failVideo = false;
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
        extractions: failVideo
          ? [{ kind: 'video_timeline', status: 'failed', error: 'Saved Gemini failure' }]
          : [],
        versions: [{ number: 1, analysis: { status: 'succeeded', startedAt: 1, finishedAt: 2 } }],
        findings: [],
        assets: versions.get(args.reviewId),
      };
    },
    spans: async (_reviewId, assetIds) => {
      assert.ok(assetIds.length);
      return Array.from({ length: attempts }, () => ({
        operation: 'review',
        durationMs: 1,
        costUsd: 0.01,
      }));
    },
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
  let output, budgetOutput, failureOutput;
  const extraOutputs = [];
  try {
    process.argv = [
      'node',
      'evals/run.mjs',
      '--suite',
      'original',
      '--runs',
      '3',
      '--budget',
      '100',
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
    assert.equal(report.aggregate.requiredTotal, 60);
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
      '100',
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
    const beforeFailure = new Set(await readdir(results));
    const beforeCreated = created,
      beforeUploads = uploads;
    failVideo = true;
    process.argv = [
      'node',
      'evals/run.mjs',
      '--case',
      'affiliate-video',
      '--runs',
      '3',
      '--budget',
      '100',
    ];
    await import(`../run.mjs?failure=${Date.now()}`);
    const failureAdded = (await readdir(results)).filter((name) => !beforeFailure.has(name));
    assert.equal(failureAdded.length, 1);
    failureOutput = new URL(`${failureAdded[0]}/`, results);
    const failed = JSON.parse(await readFile(new URL('report.json', failureOutput), 'utf8'));
    assert.equal(created, beforeCreated + 1);
    assert.equal(uploads, beforeUploads + 1);
    assert.equal(failed.runs.length, 1);
    assert.match(failed.runs[0].error, /Saved Gemini failure/);
    assert.match(failed.errors[0], /Stopped after video failure/);
    const saved = JSON.parse(
      await readFile(new URL('affiliate-video-1.json', failureOutput), 'utf8'),
    );
    assert.equal(saved.extractions[0].error, 'Saved Gemini failure');
    failVideo = false;
    attempts = 1;
    for (const usdBudget of [null, '0.50']) {
      const beforeGroup = new Set(await readdir(results));
      const previousCreated = created;
      process.argv = [
        'node',
        'evals/run.mjs',
        '--case',
        'holdout-card-email-clean,holdout-search-ad-clean,holdout-sms',
        '--runs',
        '3',
        '--budget',
        '100',
        ...(usdBudget ? ['--usd-budget', usdBudget] : []),
      ];
      await import(`../run.mjs?group=${usdBudget}-${Date.now()}`);
      const added = (await readdir(results)).filter((name) => !beforeGroup.has(name));
      assert.equal(added.length, 1);
      const path = new URL(`${added[0]}/`, results);
      extraOutputs.push(path);
      const grouped = JSON.parse(await readFile(new URL('report.json', path), 'utf8'));
      assert.equal(grouped.caseIds.length, 3);
      assert.equal(grouped.runs.length, usdBudget ? 1 : 9);
      assert.equal(created, previousCreated + grouped.runs.length);
      if (usdBudget) {
        assert.match(grouped.errors[0], /USD budget guard/);
        const beforeResume = created;
        process.argv = process.argv.filter(
          (arg, i, all) => arg !== '--usd-budget' && all[i - 1] !== '--usd-budget',
        );
        process.argv.push('--resume', fileURLToPath(path));
        await import(`../run.mjs?usd-resume=${Date.now()}`);
        assert.equal(created, beforeResume);
      }
    }
  } finally {
    process.argv = previousArgv;
    console.info = previousInfo;
    console.error = previousError;
    process.exitCode = previousExitCode;
    mock.restoreAll();
    if (output) await rm(output, { recursive: true });
    if (budgetOutput) await rm(budgetOutput, { recursive: true });
    if (failureOutput) await rm(failureOutput, { recursive: true });
    for (const path of extraOutputs) await rm(path, { recursive: true });
  }
});
