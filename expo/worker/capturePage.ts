import type { Page } from '@cloudflare/puppeteer';
import { limitBlocks } from '@clearpath/backend/convex/webpageBlocks';

// Runs inside the captured page. Keep this self-contained for page.evaluate().
function extractPage() {
  const width = 1440;
  const height = Math.min(12000, Math.max(900, document.documentElement.scrollHeight));
  const semantic =
    'h1,h2,h3,h4,h5,h6,p,li,a,button,label,small,td,th,blockquote,figcaption,dt,dd,address';
  function textFits(node: ChildNode, element: HTMLElement) {
    const range = document.createRange();
    range.selectNodeContents(node);
    const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
    if (!rects.length) return false;
    if (
      rects.some(
        (r) =>
          r.left + scrollX < 0 ||
          r.top + scrollY < 0 ||
          r.right + scrollX > width ||
          r.bottom + scrollY > height,
      )
    )
      return false;
    for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      // Masks and line-clamp ellipses cannot verify complete text, even where
      // Range reports boxes for the hidden characters.
      if (
        style.clipPath !== 'none' ||
        !['auto', ''].includes(style.getPropertyValue('clip')) ||
        Number.parseInt(style.webkitLineClamp) > 0 ||
        Number.parseInt(style.getPropertyValue('line-clamp')) > 0
      )
        return false;
      // Full-page screenshots extend past the root viewport. Inner scroll
      // containers still clip their text to their own padding boxes.
      if (ancestor === document.documentElement) continue;
      const box = ancestor.getBoundingClientRect();
      const left = box.left + ancestor.clientLeft,
        top = box.top + ancestor.clientTop;
      const clips = (overflow: string) => ['hidden', 'clip', 'auto', 'scroll'].includes(overflow);
      if (
        rects.some(
          (r) =>
            (clips(style.overflowX) && (r.left < left || r.right > left + ancestor.clientWidth)) ||
            (clips(style.overflowY) && (r.top < top || r.bottom > top + ancestor.clientHeight)),
        )
      )
        return false;
    }
    return true;
  }
  function visibleText(element: HTMLElement): string | null {
    if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return '';
    const style = getComputedStyle(element);
    if (
      style.getPropertyValue('clip') === 'rect(0px, 0px, 0px, 0px)' ||
      style.clipPath === 'inset(50%)'
    )
      return '';
    const parts: string[] = [];
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.textContent?.trim() && !textFits(node, element)) return null;
        parts.push(node.textContent ?? '');
      } else if (node instanceof HTMLElement) {
        if (node.tagName === 'BR') parts.push(' ');
        else {
          const text = visibleText(node);
          if (text === null) return null;
          parts.push(getComputedStyle(node).display === 'block' ? ` ${text} ` : text);
        }
      }
    }
    return parts.join('');
  }
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(`${semantic},div,span`))
    .filter((element) => {
      if (!element.matches(semantic)) {
        if (element.querySelector(semantic)) return false;
        if (!Array.from(element.childNodes).some((n) => n.nodeType === 3 && n.textContent?.trim()))
          return false;
      }
      return element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    })
    .flatMap((element) => {
      const text = visibleText(element);
      return text === null ? [] : [{ element, text: text.replace(/\s+/g, ' ').trim() }];
    })
    .filter(({ text }) => text.length > 0);
  const chosen = new Set(candidates.map(({ element }) => element));
  const blocks = candidates.flatMap(({ element, text }) => {
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      if (chosen.has(parent)) return [];
    }
    const rect = element.getBoundingClientRect();
    const x = rect.x + scrollX,
      y = rect.y + scrollY;
    const right = rect.right + scrollX,
      bottom = rect.bottom + scrollY;
    // A clipped box cannot verify the element's complete text. Omit the whole
    // block rather than anchoring an unseen disclosure to its visible fragment.
    if (x < 0 || y < 0 || right > width || bottom > height || right <= x || bottom <= y) return [];
    return [{ text, x, y, width: right - x, height: bottom - y }];
  });
  return {
    title: document.title,
    finalUrl: location.href,
    size: { width, height },
    heightTruncated: document.documentElement.scrollHeight > height,
    blocks,
  };
}

export async function renderCapture(page: Page, url: string) {
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  const deadline = Date.now() + 30000;
  const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  if (!response || response.status() >= 400)
    throw new Error(
      `The page blocked capture or could not be loaded (${response?.status() ?? 'no response'}).`,
    );
  if (
    response.headers()['cf-mitigated'] === 'challenge' ||
    /^(just a moment|access denied|attention required|403 forbidden)/i.test(await page.title())
  )
    throw new Error('This page blocked automated capture. Upload a screenshot instead.');
  if (!response.headers()['content-type']?.includes('text/html'))
    throw new Error('This URL is not a web page. Upload the file directly instead.');
  // Visit overlapping viewports so IntersectionObserver/native lazy content in
  // the middle loads too. Recheck height after each load, bounded by our clip.
  let top = 0;
  for (;;) {
    await settleViewport(page, top, deadline);
    const lastTop = await page.evaluate(() =>
      Math.max(0, Math.min(12000, document.documentElement.scrollHeight) - 900),
    );
    if (top >= lastTop) break;
    top = Math.min(top + 720, lastTop);
  }
  await settleViewport(page, 0, deadline);
  const metadata = await page.evaluate(extractPage);
  const screenshot = await page.screenshot({
    type: 'jpeg',
    quality: 80,
    clip: { x: 0, y: 0, ...metadata.size },
    captureBeyondViewport: true,
  });
  return {
    ...metadata,
    ...limitBlocks(metadata.blocks),
    screenshot: `data:image/jpeg;base64,${uint8Base64(screenshot)}`,
  };
}

async function settleViewport(page: Page, top: number, deadline: number) {
  await page.evaluate(async (y) => {
    document.documentElement.style.scrollBehavior = 'auto';
    window.scrollTo({ top: y, left: 0, behavior: 'instant' });
    // Let layout/intersection observers enqueue their resource requests before
    // waiting for idle; no network request is required for client-rendered text.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  }, top);
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error('Page loading timed out.');
  await page.waitForNetworkIdle({ idleTime: 500, timeout: remaining });
}

function uint8Base64(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
