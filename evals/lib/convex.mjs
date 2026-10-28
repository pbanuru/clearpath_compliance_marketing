import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';

export const deployment = 'affable-skunk-990';
export const identity = {
  subject: 'clearpath-review-evals',
  issuer: 'https://clearpath-dev-harness.example',
  tokenIdentifier: 'https://clearpath-dev-harness.example|clearpath-review-evals',
};
const exec = promisify(execFile);
export function client(root) {
  if (process.env.CONVEX_DEPLOY_KEY)
    throw new Error(
      'Unset CONVEX_DEPLOY_KEY: evals use the logged-in CLI and pinned DEV deployment.',
    );
  async function invoke(args, useIdentity = true) {
    try {
      const { stdout } = await exec(
        resolve(root, 'node_modules/.bin/convex'),
        [
          'run',
          '--deployment',
          deployment,
          '--codegen',
          'disable',
          ...(useIdentity ? ['--identity', JSON.stringify(identity)] : []),
          ...args,
        ],
        {
          cwd: resolve(root, 'backend'),
          encoding: 'utf8',
          maxBuffer: 32 * 1024 * 1024,
          timeout: 180000,
          env: { ...process.env, CONVEX_DEPLOYMENT: `dev:${deployment}` },
        },
      );
      return JSON.parse(stdout);
    } catch (error) {
      // Preserve provider/CLI stderr verbatim; arguments may contain signed URLs, so omit them.
      throw new Error(error.stderr || error.stdout || error.message);
    }
  }
  return {
    run: (name, args) => invoke([name, JSON.stringify(args)]),
    spans: (reviewId, assetIds = []) =>
      invoke(
        [
          '--inline-query',
          `
      const review = await ctx.db.get('reviews', ${JSON.stringify(reviewId)});
      if (!review || review.owner !== ${JSON.stringify(identity.tokenIdentifier)})
        throw new Error('Eval review ownership mismatch.');
      const spans = await ctx.db.query('aiSpans').withIndex('by_reviewId_and_version',
        q => q.eq('reviewId', ${JSON.stringify(reviewId)})).take(200);
      for (const assetId of ${JSON.stringify(assetIds)}) {
        const asset = await ctx.db.get('assets', assetId);
        if (asset?.owner !== review.owner) throw new Error('Eval asset ownership mismatch.');
        spans.push(...await ctx.db.query('aiSpans').withIndex('by_assetId',
          q => q.eq('assetId', assetId)).take(200));
      }
      return [...new Map(spans.map(span => [span._id, span])).values()];
    `,
        ],
        false,
      ),
  };
}
