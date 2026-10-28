import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { mock, test } from 'node:test';

// Node's TS stripper does not resolve extensionless TS imports as Wrangler does.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === './auth' || specifier === './capturePage')
      return next(`${specifier}.ts`, context);
    return next(specifier, context);
  },
});
let auth = {
  authenticated: true,
  user: { id: 'fixture', email: 'fixture@example.test' },
  accessToken: 'fixture',
};
let failure;
let launched = 0,
  closed = 0;
class WorkOS {
  userManagement = {
    loadSealedSession: () => ({
      authenticate: async () => auth,
      refresh: async () => ({ authenticated: false }),
    }),
  };
}
mock.module('@workos-inc/node', { namedExports: { WorkOS } });
mock.module('@cloudflare/puppeteer', {
  defaultExport: {
    launch: async () => {
      launched++;
      return {
        newPage: async () => ({}),
        close: async () => {
          closed++;
        },
      };
    },
  },
});
mock.module('./capturePage.ts', {
  namedExports: {
    renderCapture: async () => {
      if (failure) throw failure;
      return {
        screenshot: 'data:image/jpeg;base64,AA==',
        blocks: [],
        size: { width: 1440, height: 900 },
      };
    },
  },
});
const { handleCapture } = await import('./capture.ts');
const env = {
  WORKOS_API_KEY: 'fixture',
  WORKOS_CLIENT_ID: 'fixture',
  WORKOS_COOKIE_PASSWORD: 'fixture',
  WORKOS_REDIRECT_URI: 'https://app.test/auth/callback',
};
const request = (url, cookie = true, extra = {}) =>
  new Request('https://app.test/api/capture', {
    method: 'POST',
    body: JSON.stringify({ url }),
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: 'clearpath-session=fixture' } : {}),
      ...extra,
    },
  });

test('capture requires an authenticated sealed session and blocks cross-origin requests before browser launch', async () => {
  assert.equal((await handleCapture(request('https://example.com', false), env)).status, 401);
  assert.equal(
    (
      await handleCapture(
        request('https://example.com', true, { Origin: 'https://other.test' }),
        env,
      )
    ).status,
    403,
  );
  auth = { authenticated: false };
  const denied = await handleCapture(request('https://example.com'), env);
  assert.equal(denied.status, 401);
  assert.equal(denied.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(launched, 0);
  auth = {
    authenticated: true,
    user: { id: 'fixture', email: 'fixture@example.test' },
    accessToken: 'fixture',
  };
});

test('capture validates URL protocols and closes its browser on success and timeout', async () => {
  for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'not a URL']) {
    assert.equal((await handleCapture(request(url), env)).status, 400);
  }
  const ok = await handleCapture(request('https://example.com'), env);
  assert.equal(ok.status, 200);
  assert.equal(closed, 1);
  const body = await ok.json();
  assert.equal(typeof body.browserMs, 'number');
  assert.equal(ok.headers.get('Cache-Control'), 'private, no-store');
  failure = new Error('Navigation timeout of 30000 ms exceeded');
  const timeout = await handleCapture(request('https://example.com'), env);
  assert.equal(timeout.status, 422);
  assert.match((await timeout.json()).error, /timed out/);
  assert.equal(closed, 2);
});
