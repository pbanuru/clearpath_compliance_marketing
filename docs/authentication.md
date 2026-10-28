# Account authentication

The web demo uses real WorkOS AuthKit in the ClearPath Marketing Compliance
**staging** environment. This is a fictional-company take-home demo. WorkOS
Production remains inactive because it requires billing information. No enterprise
identity provider, paid SSO connection, roles, or review permissions are configured.
The signed-out demo remains available.

## Request flow

The Cloudflare Worker handles `/login`, `/auth/callback`, `/auth/session`, and
`POST /auth/logout` before Expo's renderer. WorkOS's Node SDK creates the login
URL with PKCE, exchanges the callback code, seals the session, validates tokens,
and refreshes expired sessions. The browser stores the sealed session in an
HttpOnly, SameSite=Lax cookie; HTTPS adds Secure. The refresh token never reaches
browser JavaScript or local storage.

The account provider loads the current user and access token from `/auth/session`.
`ConvexProviderWithAuth` forwards that access token to Convex, whose `auth.config.ts`
validates WorkOS signatures and issuers. Future backend permissions must derive
identity from `ctx.auth.getUserIdentity()` and enforce access in each function.
An account button is not an authorization check.

The server-rendered shell contains no account data and can retain public caching.
Every auth response is `private, no-store`; callbacks and cookies bypass the page
cache. User data loads only after hydration.

## Provider configuration

- Project: `project_01M60P3VK3NG26BC6QP0AGB58V`.
- Staging: `environment_01M60P3VKTDVCGZ52QRH6X8RV9`.
- Client: `client_01M60P3VXJC9QPX2VT1FJTH7Q6`.
- Hosted AuthKit: `orderly-adventure-34-staging.authkit.app`.
- Registered callbacks: `http://localhost:8791/auth/callback` and
  `https://clearpath-marketing-compliance-web.aera.workers.dev/auth/callback`.
- Registered sign-out destinations: `http://localhost:8791/` and
  `https://clearpath-marketing-compliance-web.aera.workers.dev/`.
- Initiate login URI:
  `https://clearpath-marketing-compliance-web.aera.workers.dev/login`.

The server SDK supplies an explicit callback and logout destination for each
runtime. Browser-to-WorkOS CORS configuration is unnecessary for this flow.

## Runtime configuration

Cloudflare stores `WORKOS_API_KEY` and `WORKOS_COOKIE_PASSWORD` as secret bindings.
`WORKOS_CLIENT_ID` and `WORKOS_REDIRECT_URI` are nonsecret Worker vars in
`expo/wrangler.jsonc`. The WorkOS key is named
`ClearPath Cloudflare WORKOS_API_KEY + local .dev.vars` for its consumers.
Deployments preserve the existing secret bindings; CI does not need the WorkOS key.

Both Convex deployments have the public `WORKOS_CLIENT_ID` environment variable.
Convex does not need the WorkOS API key to verify JWTs.

For local development, keep the WorkOS values in ignored, mode-600
`expo/.dev.vars`, with `WORKOS_REDIRECT_URI=http://localhost:8791/auth/callback`.
Use a different random cookie password for the live Worker. Never prefix either
secret with `EXPO_PUBLIC_`.

Run `npm run export:web`, then from `expo/` run
`npx wrangler dev --port 8791 --ip 127.0.0.1` and open
`http://localhost:8791/`. Metro alone serves the app but not the Worker's account
endpoints, so it cannot exercise the real account flow.

## Verification

Run `npm run test:auth` and `npm run check`. The focused auth tests cover callback
state, sealed-cookie flags, expired-session refresh, rejected or malformed cookies,
transient refresh failures, logout origin checks, and private caching.

For the real provider boundary, use a staging fixture on a reserved example
domain, authenticate it through WorkOS, and verify the local Worker returns the
user, refreshes the session, and signs it out. WorkOS's default Test SSO connection
can claim `example.com`; use another reserved domain for password-only fixtures.
See the workspace's `52-workos` skill for provider setup and credential handling.
