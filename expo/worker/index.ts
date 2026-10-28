// clearpath-marketing-compliance-web Worker: copy to expo/worker/index.ts. Cloudflare serves files in dist/client without
// running this script; every other request is rendered by Expo Router's server build. Workers Cache
// (wrangler.jsonc) serves cached pages before this script runs. Add other paths (a relay, a webhook)
// as branches before renderPage. Export only the default handler: Wrangler treats every export of
// the main module as a handler.
import { createRequestHandler } from 'expo-server/adapter/workerd';

// The export's server build is uploaded as extra modules (find_additional_modules and rules in
// wrangler.jsonc), named by their path from base_dir. Wrangler uploads this bundled script as
// index.js at the root, so the adapter's imports resolve from there.
const renderPage = createRequestHandler({ build: './dist/server' });

type Env = Parameters<typeof renderPage>[1];
type Context = Parameters<typeof renderPage>[2];

export default {
  async fetch(request: Request, env: Env, ctx: Context): Promise<Response> {
    return withPreloadHeaders(await renderPage(request, env, ctx));
  },
};

// The page's <link rel="preload"> tags, repeated as a Link header. A browser acts on the header
// when the response's headers arrive, before it parses the HTML, and Cloudflare's Early Hints (a
// zone setting) caches the header and sends it as a 103 before the page is even rendered, so the
// bundles, fonts, Rive's engine and the hero's rig start downloading during the page's own wait.
// Only on rendered pages; the cached copy keeps the header.
async function withPreloadHeaders(page: Response): Promise<Response> {
  if (!page.ok || !page.headers.get('content-type')?.includes('text/html')) return page;
  const html = await page.text();
  const links = preloadLinks(html);
  const headers = new Headers(page.headers);
  if (links.length > 0) headers.set('Link', links.join(', '));
  return new Response(html, {
    status: page.status,
    statusText: page.statusText,
    headers,
  });
}

const PRELOAD_TAG = /<link\s[^>]*rel="preload"[^>]*>/g;
const ATTRIBUTE = /\b(href|as|type|crossorigin|fetchpriority)="([^"]*)"/gi;

function preloadLinks(html: string): string[] {
  const links: string[] = [];
  for (const [tag] of html.matchAll(PRELOAD_TAG)) {
    const attributes = new Map<string, string>();
    for (const [, name, value] of tag.matchAll(ATTRIBUTE)) {
      if (name && value) attributes.set(name.toLowerCase(), value);
    }
    const href = attributes.get('href');
    if (!href || !href.startsWith('/')) continue;
    const parts = [`<${href}>`, 'rel=preload'];
    for (const name of ['as', 'type', 'crossorigin', 'fetchpriority'] as const) {
      const value = attributes.get(name);
      if (value) parts.push(`${name}=${value}`);
    }
    links.push(parts.join('; '));
  }
  return links;
}
