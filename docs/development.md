# Development and deployment

The web app uses Expo Router with request-time server rendering on Cloudflare
Workers. Convex owns the backend. Development and production deployments are
separate; no product tables or review workflows exist yet.

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
ESLint, and unused-code checks. GitHub Actions runs the same command on pull
requests and pushes to `main`. The commit hook renders staged diagrams and
checks file and skill limits.

## Deployment

Use `npm run deploy:web` from the root. It deploys Convex production, exports
Expo with that production URL, and deploys the Cloudflare Worker. The Worker
runtime configuration must point at that same production deployment.

Use `npm run preview:web -w @clearpath/expo` to export and preview the Worker
locally. A standalone export uses the local development environment; never
publish it with a standalone `wrangler deploy`.

The app starts with only its name visible. Unknown routes and `/_sitemap`
return 404. Public HTML has a five-minute cache lifetime. Any future per-user
content must load in the browser or use a non-cacheable response.

Native app distribution and OTA updates are outside this web setup. Configure
Expo Updates before creating a native binary.
