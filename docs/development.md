# Development and deployment

The web app uses Expo Router with request-time server rendering on Cloudflare
Workers. Convex owns the backend. Development and production deployments are
separate. The workspace stores immutable assets and versioned compliance reviews;
see [review flow](review-flow.md) for the API and AI processing contract.

## Service locations

- Web: https://clearpath-marketing-compliance-web.aera.workers.dev
- Convex dashboard: https://dashboard.convex.dev/t/-84ebe/clearpath-marketing-compliance
- Development backend: https://affable-skunk-990.convex.cloud
- Production backend: https://befitting-cormorant-173.convex.cloud

Cloudflare's default hostname is used for the take-home; no custom domain is
required. The Worker belongs to the existing Cloudflare account.

## Pause and resume

The take-home is paused after review. Both Convex deployments are paused, the
Worker's `workers.dev` route is disabled, and GitHub's `Check` workflow is
disabled manually. Code, database records, R2 uploads, runtime secrets, and the
deployed Worker are retained. Local ClearPath preview servers are stopped.

To resume without rebuilding or redeploying:

1. In the [Convex dashboard](https://dashboard.convex.dev/t/-84ebe/clearpath-marketing-compliance),
   select production `befitting-cormorant-173`, open Settings, and choose Resume
   deployment. Resume `affable-skunk-990` too when local development is needed.
2. In Cloudflare, select Worker `clearpath-marketing-compliance-web`, then
   Settings > Domains & Routes, and enable its `workers.dev` route. Leave preview
   URLs disabled. The existing public address and deployed code are reused.
3. Verify the live app, then restore CI with
   `gh workflow enable check.yml --repo pbanuru/clearpath_compliance_marketing`.
   Enabling the workflow does not itself deploy anything.

The corresponding API operations are `POST /api/v1/unpause_deployment` on each
Convex deployment and Cloudflare's Worker subdomain update with
`{"enabled":true,"previews_enabled":false}`. Use existing CLI credentials; no
new key is needed. Reverse these operations and disable `Check` to pause again.

The route setting is an operational override: `expo/wrangler.jsonc` still has
`workers_dev: true`, so a future deployment would enable the route. Keep the
workflow disabled while paused. Paused Convex deployments skip cron jobs;
queued scheduled jobs can run on resume. Retained storage can still incur
storage charges.

## Local setup

1. Run `npm ci` at the repository root.
2. Run `npm run dev:backend`. On a new machine, select the existing
   `clearpath-marketing-compliance` project rather than creating another one.
3. Copy the development `CONVEX_URL` from `backend/.env.local` into
   `expo/.env.local` as `EXPO_PUBLIC_CONVEX_URL`.
4. In another terminal run `npm run dev:web`.

Metro serves the UI with hot updates. To exercise sign-in and the full account
flow, follow the [local Worker setup](authentication.md#runtime-configuration).
The Worker handles `/auth/*`, `/login`, and `/api/capture`; Metro alone does not
serve those endpoints.

Local environment files stay ignored. Only the public deployment URL belongs in
the browser bundle. Convex admin credentials and Cloudflare credentials stay in
their existing CLI login stores.

## Checks

`npm run check` runs file limits, skill validation, formatting, TypeScript,
ESLint, auth and asset contract tests, and unused-code checks. GitHub Actions runs the same command on pull
requests and pushes to `main`. The commit hook renders staged diagrams and
checks file and skill limits.

## Deployment

Merging a pull request into `main` starts the `Check` workflow. After its checks
pass, it runs `npm run deploy:web` on that tested commit: Expo exports with
Convex's production URL, the backend deploys, then the Cloudflare Worker publishes. Production
deployments run one at a time and finish with a live-site request. See
[CI credentials and recovery](ci.md#deployment-credentials).

For a local recovery deployment, use `npm run deploy:web` from the root with
the existing Convex and Cloudflare CLI logins. The Worker runtime configuration
must point at the same production deployment as the export.

Use `npm run preview:web -w @clearpath/expo` to export and preview the Worker
locally. A standalone export uses the local development environment; never
publish it with a standalone `wrangler deploy`.

The app starts with an asset workspace. Signed-out visitors use the header sign-in. Unknown routes and `/_sitemap`
return 404. Public HTML has a five-minute cache lifetime. Any future per-user
content must load in the browser or use a non-cacheable response.

Native app distribution and OTA updates are outside this web setup. Configure
Expo Updates before creating a native binary.
