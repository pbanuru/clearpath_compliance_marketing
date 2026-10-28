import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

let state;
let authorizationOptions;
class WorkOS {
  userManagement = {
    getAuthorizationUrlWithPKCE: async (options) => {
      authorizationOptions = options;
      return {
        url: 'https://auth.example.test/sign-in',
        state: 'state-fixture',
        codeVerifier: 'verifier-fixture',
      };
    },
    authenticateWithCode: async (options) => {
      assert.equal(options.codeVerifier, 'verifier-fixture');
      return { sealedSession: 'sealed-fixture' };
    },
    loadSealedSession: () => ({
      authenticate: async () => state.auth,
      refresh: async () => {
        if (state.refresh.authenticated) state.auth = state.refreshedAuth;
        return state.refresh;
      },
      getLogoutUrl: async () => 'https://auth.example.test/logout',
    }),
  };
}
mock.module('@workos-inc/node', { namedExports: { WorkOS } });
const { handleAuth } = await import('./auth.ts');
const env = {
  WORKOS_API_KEY: 'test-key',
  WORKOS_CLIENT_ID: 'test-client',
  WORKOS_COOKIE_PASSWORD: 'test-cookie-password',
  WORKOS_REDIRECT_URI: 'https://app.example.test/auth/callback',
};
const signedIn = {
  authenticated: true,
  accessToken: 'access-fixture',
  user: { id: 'user-fixture', email: 'fixture@example.test', firstName: 'Test' },
};
const request = (path, init) => new Request(`https://app.example.test${path}`, init);
const sessionRequest = () =>
  request('/auth/session', { headers: { Cookie: 'clearpath-session=x' } });

test('callback requires the browser flow state and issues only HttpOnly sealed cookies', async () => {
  const login = await handleAuth(request('/login'), env);
  assert.equal(login.status, 302);
  const flow = login.headers.get('Set-Cookie').split(';')[0];
  const invalid = await handleAuth(
    request('/auth/callback?code=code&state=wrong', { headers: { Cookie: flow } }),
    env,
  );
  assert.equal(invalid.status, 400);
  const valid = await handleAuth(
    request('/auth/callback?code=code&state=state-fixture', { headers: { Cookie: flow } }),
    env,
  );
  assert.equal(valid.status, 302);
  assert.match(valid.headers.get('Set-Cookie'), /HttpOnly; SameSite=Lax; Max-Age=1209600; Secure/);
  assert.equal(valid.headers.get('Cache-Control'), 'private, no-store');
});

test('expired sessions refresh before returning the new token and sealed cookie', async () => {
  state = {
    auth: { authenticated: false },
    refresh: { authenticated: true, sealedSession: 'renewed-fixture' },
    refreshedAuth: signedIn,
  };
  const result = await handleAuth(sessionRequest(), env);
  assert.equal((await result.json()).accessToken, 'access-fixture');
  assert.match(result.headers.get('Set-Cookie'), /clearpath-session=renewed-fixture/);
  assert.equal(result.headers.get('Cache-Control'), 'private, no-store');
});

test('malformed and rejected cookies become signed-out sessions; transient refresh keeps the cookie', async () => {
  const malformed = await handleAuth(
    request('/auth/session', { headers: { Cookie: 'clearpath-session=%broken' } }),
    env,
  );
  assert.deepEqual(await malformed.json(), { user: null, accessToken: null });
  assert.match(malformed.headers.get('Set-Cookie'), /Max-Age=0/);
  state = { auth: { authenticated: false }, refresh: { authenticated: false, retryable: false } };
  const rejected = await handleAuth(sessionRequest(), env);
  assert.deepEqual(await rejected.json(), { user: null, accessToken: null });
  state.refresh.retryable = true;
  const unavailable = await handleAuth(sessionRequest(), env);
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers.get('Set-Cookie'), null);
});

test('forced refresh discards a still-valid token when WorkOS terminally rejects the session', async () => {
  state = { auth: signedIn, refresh: { authenticated: false, retryable: false } };
  const forced = () =>
    request('/auth/session?refresh=1', { headers: { Cookie: 'clearpath-session=x' } });
  const rejected = await handleAuth(forced(), env);
  assert.deepEqual(await rejected.json(), { user: null, accessToken: null });
  assert.match(rejected.headers.get('Set-Cookie'), /Max-Age=0/);
  assert.equal(rejected.headers.get('Cache-Control'), 'private, no-store');
  state.refresh.retryable = true;
  const unavailable = await handleAuth(forced(), env);
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers.get('Set-Cookie'), null);
});

test('logout requires a same-origin POST and clears the cookie before WorkOS logout', async () => {
  state = { auth: signedIn };
  const bad = await handleAuth(request('/auth/logout', { method: 'POST' }), env);
  assert.equal(bad.status, 403);
  const result = await handleAuth(
    request('/auth/logout', {
      method: 'POST',
      headers: { Origin: 'https://app.example.test', Cookie: 'clearpath-session=x' },
    }),
    env,
  );
  assert.deepEqual(await result.json(), { url: 'https://auth.example.test/logout' });
  assert.match(result.headers.get('Set-Cookie'), /Max-Age=0/);
  assert.equal(result.headers.get('Cache-Control'), 'private, no-store');
});

// Screen selection is a presentation hint; the existing PKCE callback remains shared.
test('create account selects AuthKit sign-up and ignores unsupported screen hints', async () => {
  for (const [path, hint] of [
    ['/login?screen_hint=sign-up', 'sign-up'],
    ['/login', undefined],
    ['/login?screen_hint=untrusted', undefined],
  ]) {
    const result = await handleAuth(request(path), env);
    assert.equal(result.status, 302);
    assert.equal(authorizationOptions.screenHint, hint);
    assert.equal(authorizationOptions.provider, 'authkit');
    assert.equal(authorizationOptions.redirectUri, env.WORKOS_REDIRECT_URI);
    assert.match(result.headers.get('Set-Cookie'), /HttpOnly; SameSite=Lax; Max-Age=600; Secure/);
    assert.equal(result.headers.get('Cache-Control'), 'private, no-store');
  }
});
