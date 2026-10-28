import { revealMaterialHighlight } from './materialScroll';

export function revealPdfHighlight(target: Element) {
  const pages = target.closest('.cp-pdf-pages');
  if (pages) {
    const box = target.getBoundingClientRect();
    const frame = pages.getBoundingClientRect();
    if (box.left < frame.left + 4 || box.right > frame.right - 4) {
      pages.scrollBy({
        left: box.left - frame.left - Math.max(4, (pages.clientWidth - box.width) / 2),
      });
    }
  }
  revealMaterialHighlight(target);
  // Mobile uses the document scroller, as it does for long webpage captures.
  if (!window.matchMedia('(min-width: 1024px)').matches)
    target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
