# Account authentication

The live web demo uses WorkOS AuthKit in ClearPath Marketing Compliance's
**Production** environment. Local development uses its separate **Staging**
environment. This is a fictional-company take-home demo. No enterprise identity
provider, paid SSO connection, roles, or review permissions are configured. The
signed-out demo remains available.

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
- Production: `environment_01M60P3VYJYNWA2TMRCKCC1T6Z`.
- Production client: `client_01M60P3W2MV0GS0C65XECBR7XS`.
- Production AuthKit: `vocal-gull-22.authkit.app`.
- Production callback:
  `https://clearpath-marketing-compliance-web.aera.workers.dev/auth/callback`.
- Production sign-out destination:
  `https://clearpath-marketing-compliance-web.aera.workers.dev/`.
- Production Initiate login URI:
  `https://clearpath-marketing-compliance-web.aera.workers.dev/login`.
- Staging: `environment_01M60P3VKTDVCGZ52QRH6X8RV9`.
- Staging client: `client_01M60P3VXJC9QPX2VT1FJTH7Q6`.
- Staging AuthKit: `orderly-adventure-34-staging.authkit.app`.
- Local callback: `http://localhost:8791/auth/callback`; sign-out destination:
  `http://localhost:8791/`; Initiate login URI: `http://localhost:8791/login`.

The server SDK supplies an explicit callback and logout destination for each
runtime. Browser-to-WorkOS CORS configuration is unnecessary for this flow.

## Runtime configuration

Cloudflare stores `WORKOS_API_KEY` and `WORKOS_COOKIE_PASSWORD` as secret bindings.
`WORKOS_CLIENT_ID` and `WORKOS_REDIRECT_URI` are nonsecret Worker vars in
`expo/wrangler.jsonc`. The local runtime has its own WorkOS key, named
`yn.apple ClearPath expo/.dev.vars WORKOS_API_KEY`. Cloudflare's separate key is
named `Cloudflare clearpath-marketing-compliance-web WORKOS_API_KEY`; do not copy
one credential across these final stores.
Deployments preserve the existing secret bindings; CI does not need the WorkOS key.

Both Convex deployments have the public `WORKOS_CLIENT_ID` environment variable:
the production deployment uses the Production client, and development uses the
Staging client. Convex does not need the WorkOS API key to verify JWTs.

For local development, keep the WorkOS values in ignored, mode-600
`expo/.dev.vars`, with `WORKOS_REDIRECT_URI=http://localhost:8791/auth/callback`.
Use a different random cookie password for the live Worker. Never prefix either
secret with `EXPO_PUBLIC_`.

The server SDK works on the HTTPS Workers subdomain without a WorkOS custom auth
domain. The browser SPA SDK's first-party refresh-cookie requirement does not
apply because this app's Worker owns the sealed session and refreshes it server-side.

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
