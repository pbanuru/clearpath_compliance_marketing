# Development and deployment

The web app uses Expo Router with request-time server rendering on Cloudflare
Workers. Convex owns the backend. Development and production deployments are
separate. The workspace stores assets; compliance review workflows are not built yet.

## Service locations

- Web: https://clearpath-marketing-compliance-web.aera.workers.dev
- Convex dashboard: https://dashboard.convex.dev/t/-84ebe/clearpath-marketing-compliance
- Development backend: https://affable-skunk-990.convex.cloud
- Production backend: https://befitting-cormorant-173.convex.cloud

Cloudflare's default hostname is used for the take-home; no custom domain is
required. The Worker belongs to the existing Cloudflare account.

## Local setup

1. Run `npm ci` at the repository root.
2. Run `npm run dev:backend`. On a new machine, select the existing
   `clearpath-marketing-compliance` project rather than creating another one.
3. Copy the development `CONVEX_URL` from `backend/.env.local` into
   `expo/.env.local` as `EXPO_PUBLIC_CONVEX_URL`.
4. In another terminal run `npm run dev:web`.

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
