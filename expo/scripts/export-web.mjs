// Exports the web build for the <slug>-web Worker (wrangler.jsonc): dist/client holds the files
// Cloudflare serves directly, and dist/server the server-rendering build the Worker runs.
// Production deploys run this through `npm run deploy:web` at the repo root, which sets
// EXPO_PUBLIC_CONVEX_URL to the production deployment. Run alone, it uses .env.local (dev).
import { spawnSync } from 'node:child_process';

const result = spawnSync(
  'npx',
  ['expo', 'export', '--platform', 'web', '--output-dir', 'dist', '--clear'],
  {
    stdio: 'inherit',
  },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
