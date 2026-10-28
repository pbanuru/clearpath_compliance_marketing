import puppeteer from '@cloudflare/puppeteer';
import { handleAuth, type AuthEnv } from './auth';
import { renderCapture } from './capturePage';

export type CaptureEnv = { BROWSER: Parameters<typeof puppeteer.launch>[0] };
const headers = { 'Cache-Control': 'private, no-store', 'Content-Type': 'application/json' };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });

export async function handleCapture(request: Request, env: AuthEnv & CaptureEnv) {
  if (request.method !== 'POST') return json({ error: 'Use POST to capture a web page.' }, 405);
  if (
    request.headers.get('Sec-Fetch-Site') === 'cross-site' ||
    (request.headers.has('Origin') && request.headers.get('Origin') !== new URL(request.url).origin)
  )
    return json({ error: 'Capture must be requested from this app.' }, 403);
  // Reuse WorkOS sealed-session authentication, including refresh and cookie rotation.
  if (!request.headers.get('Cookie')?.includes('clearpath-session='))
    return json({ error: 'Sign in to capture a web page.' }, 401);
  let session: Response | null;
  try {
    session = await handleAuth(
      new Request(new URL('/auth/session', request.url), { headers: request.headers }),
      env,
    );
  } catch (error) {
    console.error('Capture session check failed', error instanceof Error ? error.name : 'Unknown');
    return json({ error: 'Your account session is unavailable. Please try again.' }, 503);
  }
  const respond = (body: unknown, status = 200) => {
    const result = json(body, status);
    const nextCookie = session?.headers.get('Set-Cookie');
    if (nextCookie) result.headers.set('Set-Cookie', nextCookie);
    return result;
  };
  if (!session?.ok)
    return respond(
      { error: 'Your account session is unavailable. Please sign in again.' },
      session?.status ?? 401,
    );
  const auth: unknown = await session.json();
  if (!auth || typeof auth !== 'object' || !('user' in auth) || !auth.user)
    return respond({ error: 'Sign in to capture a web page.' }, 401);
  let url: URL;
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || !('url' in body) || typeof body.url !== 'string')
      throw new Error('Missing URL');
    url = new URL(body.url);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
      throw new Error('Invalid URL');
  } catch (error) {
    return respond(
      {
        error:
          error instanceof Error ? 'Enter a valid http or https web page URL.' : 'Invalid URL.',
      },
      400,
    );
  }
  const startedAt = Date.now();
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
  try {
    let capture: Awaited<ReturnType<typeof renderCapture>>;
    try {
      browser = await puppeteer.launch(env.BROWSER);
      capture = await renderCapture(await browser.newPage(), url.href);
    } finally {
      await browser?.close();
    }
    return respond({ ...capture, browserMs: Date.now() - startedAt, capturedAt: startedAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to capture this page.';
    return respond(
      {
        error: /timeout|timed out/i.test(message)
          ? 'The page timed out while loading. Please retry or upload a screenshot.'
          : `Unable to capture this page: ${message}`,
      },
      422,
    );
  }
}
