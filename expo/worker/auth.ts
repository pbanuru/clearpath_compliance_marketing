import { WorkOS } from '@workos-inc/node';

export interface AuthEnv {
  WORKOS_API_KEY: string;
  WORKOS_CLIENT_ID: string;
  WORKOS_COOKIE_PASSWORD: string;
  WORKOS_REDIRECT_URI: string;
}

const SESSION_COOKIE = 'clearpath-session';
const FLOW_COOKIE = 'clearpath-auth-flow';
const SESSION_SECONDS = 60 * 60 * 24 * 14;

function cookie(request: Request, name: string): string {
  const value = request.headers
    .get('Cookie')
    ?.split('; ')
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  try {
    return value ? decodeURIComponent(value) : '';
  } catch (error) {
    if (!(error instanceof URIError)) throw error;
    return '';
  }
}

function setCookie(request: Request, name: string, value: string, maxAge: number): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function response(body: BodyInit | null, status = 200, headers?: HeadersInit): Response {
  const result = new Response(body, { status, headers });
  result.headers.set('Cache-Control', 'private, no-store');
  result.headers.set('Pragma', 'no-cache');
  return result;
}

function redirect(url: string): Response {
  return response(null, 302, { Location: url });
}

function json(data: unknown): Response {
  return response(JSON.stringify(data), 200, { 'Content-Type': 'application/json' });
}

function readFlow(request: Request): { state: string; codeVerifier: string } | null {
  try {
    const data: unknown = JSON.parse(cookie(request, FLOW_COOKIE) || 'null');
    if (
      typeof data === 'object' &&
      data !== null &&
      'state' in data &&
      typeof data.state === 'string' &&
      'codeVerifier' in data &&
      typeof data.codeVerifier === 'string'
    ) {
      return { state: data.state, codeVerifier: data.codeVerifier };
    }
  } catch (error) {
    if (!(error instanceof SyntaxError || error instanceof URIError)) throw error;
  }
  return null;
}

export async function handleAuth(request: Request, env: AuthEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== '/login' && !url.pathname.startsWith('/auth/')) return null;
  if (
    !env.WORKOS_API_KEY ||
    !env.WORKOS_CLIENT_ID ||
    !env.WORKOS_COOKIE_PASSWORD ||
    !env.WORKOS_REDIRECT_URI
  ) {
    return response('Account sign-in is being configured. Please try again shortly.', 503);
  }
  const workos = new WorkOS(env.WORKOS_API_KEY, {
    clientId: env.WORKOS_CLIENT_ID,
    issuer: [
      'https://api.workos.com/',
      `https://api.workos.com/user_management/${env.WORKOS_CLIENT_ID}`,
    ],
  });
  const home = `${new URL(env.WORKOS_REDIRECT_URI).origin}/`;

  if (request.method === 'GET' && url.pathname === '/login') {
    const {
      url: authorizationUrl,
      state,
      codeVerifier,
    } = await workos.userManagement.getAuthorizationUrlWithPKCE({
      provider: 'authkit',
      screenHint: url.searchParams.get('screen_hint') === 'sign-up' ? 'sign-up' : undefined,
      redirectUri: env.WORKOS_REDIRECT_URI,
      loginHint: url.searchParams.get('login_hint') ?? undefined,
      invitationToken: url.searchParams.get('invitation_token') ?? undefined,
    });
    const result = redirect(authorizationUrl);
    result.headers.append(
      'Set-Cookie',
      setCookie(request, FLOW_COOKIE, JSON.stringify({ state, codeVerifier }), 600),
    );
    return result;
  }

  if (request.method === 'GET' && url.pathname === '/auth/callback') {
    const flow = readFlow(request);
    const code = url.searchParams.get('code');
    if (!flow || !code || !flow.state || flow.state !== url.searchParams.get('state')) {
      return response('Sign-in could not be completed. Return to the app and try again.', 400);
    }
    const { sealedSession } = await workos.userManagement.authenticateWithCode({
      code,
      codeVerifier: flow.codeVerifier,
      session: { sealSession: true, cookiePassword: env.WORKOS_COOKIE_PASSWORD },
    });
    if (!sealedSession) throw new Error('WorkOS did not create a sealed session.');
    const result = redirect(home);
    result.headers.append(
      'Set-Cookie',
      setCookie(request, SESSION_COOKIE, sealedSession, SESSION_SECONDS),
    );
    result.headers.append('Set-Cookie', setCookie(request, FLOW_COOKIE, '', 0));
    return result;
  }

  const isLogout = request.method === 'POST' && url.pathname === '/auth/logout';
  const isSession = request.method === 'GET' && url.pathname === '/auth/session';
  if (!isLogout && !isSession) return response('Not found', 404);
  if (
    (isLogout && request.headers.get('Origin') !== url.origin) ||
    request.headers.get('Sec-Fetch-Site') === 'cross-site'
  ) {
    return response('Forbidden', 403);
  }

  const sealedSession = cookie(request, SESSION_COOKIE);
  if (!sealedSession) {
    const result = json(isLogout ? { url: home } : { user: null, accessToken: null });
    if (request.headers.get('Cookie')?.includes(`${SESSION_COOKIE}=`)) {
      result.headers.append('Set-Cookie', setCookie(request, SESSION_COOKIE, '', 0));
    }
    return result;
  }
  const session = workos.userManagement.loadSealedSession({
    sessionData: sealedSession,
    cookiePassword: env.WORKOS_COOKIE_PASSWORD,
  });
  let auth: Awaited<ReturnType<typeof session.authenticate>> | null = await session.authenticate();
  let nextCookie: string | undefined;
  if (!auth.authenticated || url.searchParams.get('refresh') === '1') {
    const refreshed = await session.refresh();
    if (!refreshed.authenticated && refreshed.retryable) {
      return response('Your account session is temporarily unavailable. Please try again.', 503);
    }
    if (refreshed.authenticated) {
      nextCookie = refreshed.sealedSession;
      auth = await session.authenticate();
    } else {
      auth = null;
    }
  }
  if (!auth?.authenticated) {
    const result = json(isLogout ? { url: home } : { user: null, accessToken: null });
    result.headers.append('Set-Cookie', setCookie(request, SESSION_COOKIE, '', 0));
    return result;
  }
  if (isLogout) {
    const result = json({ url: await session.getLogoutUrl({ returnTo: home }) });
    result.headers.append('Set-Cookie', setCookie(request, SESSION_COOKIE, '', 0));
    return result;
  }
  const { user, accessToken } = auth;
  const result = json({
    user: {
      id: user.id,
      email: user.email,
      name: [user.firstName, user.lastName].filter(Boolean).join(' ') || undefined,
      profilePictureUrl: user.profilePictureUrl ?? undefined,
    },
    accessToken,
  });
  if (nextCookie) {
    result.headers.append(
      'Set-Cookie',
      setCookie(request, SESSION_COOKIE, nextCookie, SESSION_SECONDS),
    );
  }
  return result;
}
