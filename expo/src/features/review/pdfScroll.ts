import { revealMaterialHighlight } from './materialScroll';

export function revealPdfHighlight(target: Element) {
  if (!target.getClientRects().length) return;
  const pages = target.closest('.cp-pdf-pages');
  if (pages) {
    const box = target.getBoundingClientRect();
    const frame = pages.getBoundingClientRect();
    const left =
      box.left < frame.left + 4 || box.right > frame.right - 4
        ? box.left - frame.left - Math.max(4, (pages.clientWidth - box.width) / 2)
        : 0;
    const top =
      box.top < frame.top + 8 || box.bottom > frame.bottom - 8
        ? box.top - frame.top - Math.max(8, (pages.clientHeight - box.height) / 2)
        : 0;
    pages.scrollBy({ left, top });
  }
  // Keep the whole preview in the app's page scroller. Page/quote navigation
  // belongs to the PDF scroller, without moving the controls out of view.
  const viewer = pages ?? target;
  revealMaterialHighlight(viewer);
  if (!window.matchMedia('(min-width: 768px)').matches)
    viewer.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
